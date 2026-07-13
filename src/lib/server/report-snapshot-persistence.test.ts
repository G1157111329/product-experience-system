import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
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
    const calls: string[] = [];
    const result = await persistExistingReportSnapshotAtomic({} as never, input, {
      mode: 'self-hosted-postgres',
      selfHostedPersist: async () => {
        calls.push('self-hosted');
        return { report: { id: 'report-1' }, snapshot: { id: 'snapshot-1', reportId: 'report-1', version: 2 } };
      },
    });
    assert.deepEqual(calls, ['self-hosted']);
    assert.equal(result.snapshot.report_id, 'report-1');
  }

  {
    const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const client = {
      async rpc(name: string, args: Record<string, unknown>) {
        rpcCalls.push({ name, args });
        return {
          data: { report: { id: 'report-1' }, snapshot: { id: 'snapshot-2', report_id: 'report-1', version: 3 } },
          error: null,
        };
      },
    };
    const result = await persistExistingReportSnapshotAtomic(client as never, input, {
      mode: 'supabase-service-role',
      selfHostedPersist: async () => { throw new Error('must not initialize pg'); },
    });
    assert.equal(rpcCalls[0]?.name, 'persist_existing_report_snapshot_atomic');
    assert.equal(result.snapshot.report_id, 'report-1');
  }

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
      version: 4,
      snapshot_schema_version: null,
      snapshot_json: { frozen: true },
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
    'src/storage/database/shared/migrations/0013_atomic_report_snapshot_rpc.sql',
  ]) {
    const sql = readFileSync(path, 'utf8');
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.persist_existing_report_snapshot_atomic/);
    assert.match(sql, /pg_advisory_xact_lock/);
    assert.match(sql, /FOR UPDATE/);
    assert.match(sql, /SECURITY DEFINER/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.persist_existing_report_snapshot_atomic/);
  }
  const journal = readFileSync('src/storage/database/shared/migrations/meta/_journal.json', 'utf8');
  assert.match(journal, /0013_atomic_report_snapshot_rpc/);

  console.log('report snapshot persistence mode tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
