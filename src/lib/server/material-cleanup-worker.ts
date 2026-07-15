import { getPool } from '@/storage/database/pg-db';
import { deleteFile } from '@/lib/server/storage';

export type MaterialCleanupClaim = { id: string; fileKey: string; attempts: number; leaseToken: string };
export interface MaterialCleanupWorkerRepository {
  claim(limit: number): Promise<MaterialCleanupClaim[]>;
  complete(id: string, leaseToken: string): Promise<boolean>;
  retry(id: string, leaseToken: string, error: string, delayMs: number): Promise<boolean>;
}

export async function runMaterialCleanupBatch(
  repository: MaterialCleanupWorkerRepository,
  removeFile: (key: string) => Promise<void>,
  limit = 10,
) {
  const jobs = await repository.claim(limit);
  for (const job of jobs) {
    try {
      await removeFile(job.fileKey);
      await repository.complete(job.id, job.leaseToken);
    } catch (error) {
      const delayMs = Math.min(24 * 60 * 60_000, 2 ** Math.min(job.attempts, 10) * 60_000);
      await repository.retry(job.id, job.leaseToken, error instanceof Error ? error.message : 'cleanup_failed', delayMs);
    }
  }
  return jobs.length;
}

const databaseRepository: MaterialCleanupWorkerRepository = {
  async claim(limit) {
    const result = await getPool().query(`
      WITH claimed AS (
        SELECT id FROM material_cleanup_jobs
        WHERE (status='pending' AND next_attempt_at <= NOW() AND (lease_until IS NULL OR lease_until < NOW()))
           OR (status='processing' AND lease_until < NOW())
        ORDER BY next_attempt_at, created_at
        FOR UPDATE SKIP LOCKED LIMIT $1
      )
      UPDATE material_cleanup_jobs job SET status='processing', lease_token=gen_random_uuid(), lease_until=NOW()+INTERVAL '2 minutes', updated_at=NOW()
      FROM claimed WHERE job.id=claimed.id
      RETURNING job.id, job.file_key, job.attempts, job.lease_token
    `, [limit]);
    return result.rows.map((row) => ({ id: String(row.id), fileKey: String(row.file_key), attempts: Number(row.attempts || 0), leaseToken: String(row.lease_token) }));
  },
  async complete(id, leaseToken) {
    const result = await getPool().query("UPDATE material_cleanup_jobs SET status='completed', lease_token=NULL, lease_until=NULL, updated_at=NOW() WHERE id=$1 AND status='processing' AND lease_token=$2::uuid", [id, leaseToken]);
    return (result.rowCount ?? 0) === 1;
  },
  async retry(id, leaseToken, error, delayMs) {
    const result = await getPool().query("UPDATE material_cleanup_jobs SET status='pending', attempts=attempts+1, last_error=$3, lease_token=NULL, lease_until=NULL, next_attempt_at=NOW()+($4::bigint * INTERVAL '1 millisecond'), updated_at=NOW() WHERE id=$1 AND status='processing' AND lease_token=$2::uuid", [id, leaseToken, error.slice(0, 2000), delayMs]);
    return (result.rowCount ?? 0) === 1;
  },
};

export function startMaterialCleanupWorker(options: {
  intervalMs?: number;
  repository?: MaterialCleanupWorkerRepository;
  removeFile?: (key: string) => Promise<void>;
} = {}) {
  let running = false;
  let stopped = false;
  const run = async () => {
    if (running || stopped) return;
    running = true;
    try { await runMaterialCleanupBatch(options.repository ?? databaseRepository, options.removeFile ?? ((key) => deleteFile(key))); }
    catch (error) { console.error('[material-cleanup] batch failed', error instanceof Error ? error.message : 'unknown'); }
    finally { running = false; }
  };
  const timer = setInterval(() => void run(), options.intervalMs ?? 30_000);
  timer.unref();
  void run();
  return async () => {
    stopped = true;
    clearInterval(timer);
    while (running) await new Promise((resolve) => setTimeout(resolve, 10));
  };
}
