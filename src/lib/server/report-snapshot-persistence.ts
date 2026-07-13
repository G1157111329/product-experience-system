import { createHash } from 'node:crypto';

type Row = Record<string, unknown>;

export type ExistingReportSnapshotInput = {
  reportId: string;
  reportType: string;
  snapshotJson: Row;
  layoutProfile: string;
  actorId: string;
  allowAll: boolean;
  requestKey?: string;
  reportUpdate: {
    assembly_id?: string | null;
  };
};

type PersistenceMode = 'self-hosted-postgres' | 'supabase-service-role';

type PersistenceDeps = {
  mode?: PersistenceMode;
  selfHostedPersist?: (input: ExistingReportSnapshotInput & { idempotencyKey: string }) => Promise<{ report: Row; snapshot: Row }>;
};

const VOLATILE_FINGERPRINT_KEYS = new Set(['generated_at', 'created_at', 'updated_at', 'frozen_at']);

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Row)
      .filter(([key]) => !VOLATILE_FINGERPRINT_KEYS.has(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => [key, canonicalize(entryValue)]),
  );
}

export function buildSnapshotOperationKey(input: ExistingReportSnapshotInput) {
  const explicit = String(input.requestKey || '').trim();
  const payload = explicit
    ? `request:${explicit}`
    : JSON.stringify(canonicalize({
      reportId: input.reportId,
      reportType: input.reportType,
      snapshotJson: input.snapshotJson,
      layoutProfile: input.layoutProfile,
      reportUpdate: input.reportUpdate,
    }));
  return `${explicit ? 'request' : 'content'}:${createHash('sha256').update(payload).digest('hex')}`;
}

function value(row: Row, snake: string, camel: string) {
  return row[snake] ?? row[camel] ?? null;
}

export function serializeReportSnapshotDto(row: Row) {
  const createdAt = value(row, 'created_at', 'createdAt');
  return {
    id: value(row, 'id', 'id'),
    report_id: value(row, 'report_id', 'reportId'),
    report_type: value(row, 'report_type', 'reportType'),
    version: value(row, 'version', 'version'),
    idempotency_key: value(row, 'idempotency_key', 'idempotencyKey'),
    snapshot_schema_version: value(row, 'snapshot_schema_version', 'snapshotSchemaVersion'),
    snapshot_json: value(row, 'snapshot_json', 'snapshotJson'),
    layout_profile: value(row, 'layout_profile', 'layoutProfile'),
    content_hash: value(row, 'content_hash', 'contentHash'),
    model_meta: value(row, 'model_meta', 'modelMeta'),
    template_version: value(row, 'template_version', 'templateVersion'),
    frozen_at: value(row, 'frozen_at', 'frozenAt') ?? createdAt,
    created_by: value(row, 'created_by', 'createdBy'),
    created_at: createdAt,
  };
}

function snakeCaseRow(row: Row) {
  return Object.fromEntries(Object.entries(row).map(([key, entryValue]) => [
    key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
    entryValue,
  ]));
}

function resolveMode(): PersistenceMode {
  const raw = String(process.env.DATABASE_ACCESS_MODE || '').trim().toLowerCase();
  if (raw === 'supabase-service-role' || raw === 'supabase') return 'supabase-service-role';
  if (!raw && String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').startsWith('https://')) {
    return 'supabase-service-role';
  }
  return 'self-hosted-postgres';
}

async function persistSelfHosted(input: ExistingReportSnapshotInput & { idempotencyKey: string }) {
  const [{ getDb }, schema, drizzle] = await Promise.all([
    import('@/storage/database/pg-db'),
    import('@/storage/database/shared/schema'),
    import('drizzle-orm'),
  ]);
  const { reportSnapshots, reports } = schema;
  const { and, desc, eq, sql } = drizzle;
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.reportId}, 0))`);
    const lockedReport = await tx.execute(sql`SELECT id FROM reports WHERE id = ${input.reportId} FOR UPDATE`);
    if (lockedReport.rows.length === 0) throw new Error(`report not found: ${input.reportId}`);
    const [existing] = await tx
      .select()
      .from(reportSnapshots)
      .where(and(
        eq(reportSnapshots.reportId, input.reportId),
        eq(reportSnapshots.idempotencyKey, input.idempotencyKey),
      ))
      .limit(1);
    if (existing) {
      const [report] = await tx.select().from(reports).where(eq(reports.id, input.reportId)).limit(1);
      if (!report) throw new Error(`report not found: ${input.reportId}`);
      return { report: report as Row, snapshot: existing as Row };
    }
    const [latest] = await tx
      .select({ version: reportSnapshots.version })
      .from(reportSnapshots)
      .where(eq(reportSnapshots.reportId, input.reportId))
      .orderBy(desc(reportSnapshots.version))
      .limit(1);
    const [snapshot] = await tx.insert(reportSnapshots).values({
      reportId: input.reportId,
      reportType: input.reportType,
      version: Number(latest?.version || 0) + 1,
      snapshotJson: input.snapshotJson,
      layoutProfile: input.layoutProfile,
      createdBy: input.actorId,
      idempotencyKey: input.idempotencyKey,
    }).returning();
    if (!snapshot) throw new Error('创建报告快照失败');
    const [report] = await tx.update(reports).set({
      snapshotId: snapshot.id,
      reportType: input.reportType,
      assemblyId: input.reportUpdate.assembly_id,
      layoutProfile: input.layoutProfile,
      updatedAt: new Date().toISOString(),
    }).where(eq(reports.id, input.reportId)).returning();
    if (!report) throw new Error('Report snapshot anchor update returned no report');
    return { report: report as Row, snapshot: snapshot as Row };
  });
}

export async function persistExistingReportSnapshotAtomic(
  client: { rpc?: (name: string, args: Row) => Promise<{ data: unknown; error?: { message?: string } | null }> },
  input: ExistingReportSnapshotInput,
  deps: PersistenceDeps = {},
) {
  const mode = deps.mode ?? resolveMode();
  const persistedInput = { ...input, idempotencyKey: buildSnapshotOperationKey(input) };
  let persisted: { report: Row; snapshot: Row };
  if (mode === 'supabase-service-role') {
    if (typeof client.rpc !== 'function') throw new Error('Supabase client does not support atomic snapshot RPC');
    const { data, error } = await client.rpc('persist_existing_report_snapshot_atomic', {
      p_report_id: persistedInput.reportId,
      p_report_type: persistedInput.reportType,
      p_snapshot_json: persistedInput.snapshotJson,
      p_layout_profile: persistedInput.layoutProfile,
      p_actor_id: persistedInput.actorId,
      p_allow_all: persistedInput.allowAll,
      p_assembly_id: persistedInput.reportUpdate.assembly_id ?? null,
      p_idempotency_key: persistedInput.idempotencyKey,
    });
    if (error) throw new Error(error.message || 'Atomic report snapshot RPC failed');
    if (!data || typeof data !== 'object') throw new Error('Atomic report snapshot RPC returned no data');
    persisted = data as { report: Row; snapshot: Row };
  } else {
    persisted = await (deps.selfHostedPersist ?? persistSelfHosted)(persistedInput);
  }
  return {
    report: snakeCaseRow(persisted.report),
    snapshot: serializeReportSnapshotDto(persisted.snapshot),
  };
}
