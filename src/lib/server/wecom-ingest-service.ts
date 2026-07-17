/**
 * WeCom media ingest service — PRD V3.1.2.4 §12.
 *
 * Skeleton: enqueue jobs from callback, retry failed downloads, and (when
 * credentials exist) download media into materials + bind via wecom_ingest.
 * Until WECOM_* env is configured, jobs stay pending / fail with a clear
 * last_error so ops can see the queue is alive.
 */
import { getDb } from '@/storage/database/pg-db';
import { wecomBindings, wecomMediaIngestJobs } from '@/storage/database/shared/schema';
import { and, eq, sql } from 'drizzle-orm';

export type WecomIngestEnqueueInput = {
  wecomMsgId: string;
  wecomMediaId: string;
  mediaType: 'image' | 'video' | 'file' | 'voice';
  wecomUserId?: string;
  wecomCorpId?: string | null;
  /** ISO expiry; defaults to now+72h (WeCom media TTL). */
  expiresAt?: string;
};

export async function findActiveBinding(wecomUserId: string, wecomCorpId?: string | null) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(wecomBindings)
    .where(
      and(
        eq(wecomBindings.wecomUserId, wecomUserId),
        eq(wecomBindings.status, 'active'),
      ),
    )
    .execute();
  if (!wecomCorpId) return rows[0] ?? null;
  return rows.find((r) => r.wecomCorpId === wecomCorpId) ?? null;
}

export async function enqueueWecomMediaJob(input: WecomIngestEnqueueInput) {
  const db = await getDb();
  let bindingId: string | null = null;
  if (input.wecomUserId) {
    const binding = await findActiveBinding(input.wecomUserId, input.wecomCorpId);
    bindingId = binding?.id ?? null;
  }

  const expiresAt =
    input.expiresAt ??
    new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

  const [job] = await db
    .insert(wecomMediaIngestJobs)
    .values({
      wecomMsgId: input.wecomMsgId,
      wecomMediaId: input.wecomMediaId,
      mediaType: input.mediaType,
      wecomBindingId: bindingId,
      expiresAt,
      downloadStatus: 'pending',
      lastError: 'awaiting_download_worker',
    })
    .returning()
    .execute();

  return job;
}

/**
 * Retry a pending/failed job. Without WeCom credentials this marks the job
 * failed with a stable error code (skeleton). Real download lands in Wave 6+.
 */
export async function retryWecomMediaJob(jobId: string) {
  const db = await getDb();
  const [job] = await db
    .select()
    .from(wecomMediaIngestJobs)
    .where(eq(wecomMediaIngestJobs.id, jobId))
    .limit(1)
    .execute();

  if (!job) return { ok: false as const, error: 'job_not_found' };
  if (job.downloadStatus === 'succeeded' && job.materialId) {
    return { ok: true as const, job, skipped: true as const };
  }

  const hasCreds = Boolean(
    process.env.WECOM_CORP_ID && process.env.WECOM_SECRET && process.env.WECOM_AGENT_ID,
  );

  const nextRetry = (job.retryCount ?? 0) + 1;
  if (!hasCreds) {
    const [updated] = await db
      .update(wecomMediaIngestJobs)
      .set({
        downloadStatus: 'failed',
        retryCount: nextRetry,
        lastRetryAt: sql`NOW()`,
        lastError: 'WECOM_CREDENTIALS_MISSING: set WECOM_CORP_ID/WECOM_SECRET/WECOM_AGENT_ID',
      })
      .where(eq(wecomMediaIngestJobs.id, jobId))
      .returning()
      .execute();
    return { ok: false as const, error: 'credentials_missing', job: updated };
  }

  // Credentials present but download client not yet wired — keep pending.
  const [updated] = await db
    .update(wecomMediaIngestJobs)
    .set({
      downloadStatus: 'pending',
      retryCount: nextRetry,
      lastRetryAt: sql`NOW()`,
      lastError: 'download_client_not_implemented',
    })
    .where(eq(wecomMediaIngestJobs.id, jobId))
    .returning()
    .execute();

  return { ok: false as const, error: 'download_not_implemented', job: updated };
}
