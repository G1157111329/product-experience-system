import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildSnapshotOperationKey,
  persistExistingReportSnapshotAtomic,
  serializeReportSnapshotDto,
} from './report-snapshot-persistence';

const input = {
  reportId: 'report-1',
  reportType: 'comparison_report',
  snapshotJson: { report_type: 'comparison_report' },
  layoutProfile: 'comparison_a3',
  actorId: 'user-1',
  allowAll: false,
  reportUpdate: { assembly_id: 'assembly-1' },
};

async function run() {
  {
    const snapshots = new Map<string, { id: string; version: number }>();
    const selfHostedPersist = async (persistInput: typeof input & { idempotencyKey: string }) => {
      const existing = snapshots.get(persistInput.idempotencyKey);
      const stored = existing ?? { id: `snapshot-${snapshots.size + 1}`, version: snapshots.size + 2 };
      snapshots.set(persistInput.idempotencyKey, stored);
      return { report: { id: 'report-1' }, snapshot: { ...stored, reportId: 'report-1' } };
    };
    const first = await persistExistingReportSnapshotAtomic({} as never, input, {
      mode: 'self-hosted-postgres',
      selfHostedPersist: selfHostedPersist as never,
    });
    const retry = await persistExistingReportSnapshotAtomic({} as never, input, {
      mode: 'self-hosted-postgres', selfHostedPersist: selfHostedPersist as never,
    });
    const different = await persistExistingReportSnapshotAtomic({} as never, { ...input, requestKey: 'other' }, {
      mode: 'self-hosted-postgres', selfHostedPersist: selfHostedPersist as never,
    });
    assert.equal(first.snapshot.id, retry.snapshot.id);
    assert.equal(first.snapshot.version, retry.snapshot.version);
    assert.notEqual(first.snapshot.id, different.snapshot.id);
    assert.ok(Number(different.snapshot.version) > Number(first.snapshot.version));
  }

  {
    const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const snapshots = new Map<string, { id: string; version: number }>();
    const client = {
      async rpc(name: string, args: Record<string, unknown>) {
        rpcCalls.push({ name, args });
        const key = String(args.p_idempotency_key);
        const existing = snapshots.get(key);
        const stored = existing ?? { id: `snapshot-${snapshots.size + 1}`, version: snapshots.size + 3 };
        snapshots.set(key, stored);
        return {
          data: { report: { id: 'report-1' }, snapshot: { ...stored, report_id: 'report-1' } },
          error: null,
        };
      },
    };
    const first = await persistExistingReportSnapshotAtomic(client as never, input, {
      mode: 'supabase-service-role',
      selfHostedPersist: async () => { throw new Error('must not initialize pg'); },
    });
    const retry = await persistExistingReportSnapshotAtomic(client as never, input, { mode: 'supabase-service-role' });
    const different = await persistExistingReportSnapshotAtomic(client as never, { ...input, requestKey: 'other' }, { mode: 'supabase-service-role' });
    assert.equal(rpcCalls[0]?.name, 'persist_existing_report_snapshot_atomic');
    assert.equal(first.snapshot.id, retry.snapshot.id);
    assert.equal(first.snapshot.version, retry.snapshot.version);
    assert.notEqual(first.snapshot.id, different.snapshot.id);
  }

  assert.equal(
    buildSnapshotOperationKey(input),
    buildSnapshotOperationKey({
      ...input,
      snapshotJson: { ...input.snapshotJson, generated_at: '2099-01-01T00:00:00.000Z' },
    }),
    'volatile timestamps must not change the server content fingerprint',
  );
  assert.notEqual(buildSnapshotOperationKey(input), buildSnapshotOperationKey({ ...input, requestKey: 'explicit' }));

  assert.deepEqual(
    serializeReportSnapshotDto({
      id: 'snapshot-1',
      reportId: 'report-1',
      version: 4,
      snapshotJson: { frozen: true },
      createdBy: 'user-1',
      createdAt: '2026-07-13T00:00:00.000Z',
    }),
    {
      id: 'snapshot-1',
      report_id: 'report-1',
      report_type: null,
      version: 4,
      idempotency_key: null,
      snapshot_schema_version: null,
      snapshot_json: { frozen: true },
      layout_profile: null,
      content_hash: null,
      model_meta: null,
      template_version: null,
      frozen_at: '2026-07-13T00:00:00.000Z',
      created_by: 'user-1',
      created_at: '2026-07-13T00:00:00.000Z',
    },
  );

  for (const path of [
    'database-schema.sql',
    'src/storage/database/shared/migrations/0014_idempotent_report_snapshot_rpc.sql',
  ]) {
    const sql = readFileSync(path, 'utf8');
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.persist_existing_report_snapshot_atomic/);
    assert.match(sql, /pg_advisory_xact_lock/);
    assert.match(sql, /FOR UPDATE/);
    assert.match(sql, /SECURITY DEFINER/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.persist_existing_report_snapshot_atomic/);
    assert.match(sql, /idempotency_key/);
    assert.match(sql, /UNIQUE|unique/i);
  }
  const journal = readFileSync('src/storage/database/shared/migrations/meta/_journal.json', 'utf8');
  assert.match(journal, /0013_atomic_report_snapshot_rpc/);
  assert.match(journal, /0014_idempotent_report_snapshot_rpc/);
  const persistenceSource = readFileSync('src/lib/server/report-snapshot-persistence.ts', 'utf8');
  assert.match(persistenceSource, /pg_advisory_xact_lock/);
  assert.match(persistenceSource, /FOR UPDATE/);
  assert.match(persistenceSource, /idempotencyKey/);

  console.log('report snapshot persistence mode tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
