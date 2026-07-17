import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadAnchoredReportSnapshot } from './report-snapshots';

type Row = Record<string, unknown>;

function createSnapshotClient(rows: Row[]) {
  return {
    from(table: string) {
      assert.equal(table, 'report_snapshots');
      return {
        select() {
          const filters: Array<[string, unknown]> = [];
          const builder = {
            eq(field: string, value: unknown) {
              filters.push([field, value]);
              return builder;
            },
            async maybeSingle() {
              return {
                data: rows.find((row) => filters.every(([field, value]) => row[field] === value)) ?? null,
                error: null,
              };
            },
          };
          return builder;
        },
      };
    },
  };
}

async function captureError(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    return error as Error & { code?: string; status?: number };
  }
  throw new Error('Expected operation to fail');
}

async function run() {
  const missingAnchorError = await captureError(() => loadAnchoredReportSnapshot(
    createSnapshotClient([]) as never,
    { id: 'report-1', snapshot_id: 'missing-snapshot' },
  ));

  assert.equal(missingAnchorError.code, 'REPORT_SNAPSHOT_INTEGRITY');
  assert.equal(missingAnchorError.status, 409);

  for (const route of [
    'src/app/api/reports/[id]/detail/route.ts',
    'src/app/api/reports/share/route.ts',
    'src/app/api/reports/[id]/pdf/route.ts',
  ]) {
    const source = readFileSync(resolve(process.cwd(), route), 'utf8');
    assert.match(source, /reportSnapshotErrorStatus/,
      `${route} must map a frozen snapshot integrity error to an HTTP response`);
    assert.match(source, /status:\s*reportSnapshotErrorStatus\(/,
      `${route} must return the integrity status instead of a generic 500`);
  }

  const schema = readFileSync(resolve(process.cwd(), 'database-schema.sql'), 'utf8');
  assert.match(schema, /reports_snapshot_id_report_snapshots_id_fkey/);
  assert.match(schema, /FOREIGN KEY \(snapshot_id\) REFERENCES report_snapshots\(id\)/);

  console.log('report snapshot integrity contract tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
