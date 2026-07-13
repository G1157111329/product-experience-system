import assert from 'node:assert/strict';
import {
  loadAnchoredReportSnapshot,
  persistAnchoredReportSnapshot,
} from './report-snapshots';

type Row = Record<string, unknown>;
type Filter = { field: string; value: unknown };
type CapturedQuery = {
  filters: Filter[];
  order?: { field: string; ascending: boolean };
  limit?: number;
};

function createSnapshotClient(rows: Row[]) {
  const queries: CapturedQuery[] = [];

  return {
    queries,
    client: {
      from(table: string) {
        assert.equal(table, 'report_snapshots');
        return {
          select() {
            const query: CapturedQuery = { filters: [] };
            queries.push(query);
            const builder = {
              eq(field: string, value: unknown) {
                query.filters.push({ field, value });
                return builder;
              },
              order(field: string, options?: { ascending?: boolean }) {
                query.order = { field, ascending: options?.ascending ?? true };
                return builder;
              },
              async maybeSingle() {
                const matches = rows.filter((row) => query.filters.every(({ field, value }) => row[field] === value));
                return { data: matches[0] ?? null, error: null };
              },
              async limit(count: number) {
                query.limit = count;
                let matches = rows.filter((row) => query.filters.every(({ field, value }) => row[field] === value));
                if (query.order) {
                  const direction = query.order.ascending ? 1 : -1;
                  matches = [...matches].sort((left, right) => (
                    Number(left[query.order!.field] ?? 0) - Number(right[query.order!.field] ?? 0)
                  ) * direction);
                }
                return { data: matches.slice(0, count), error: null };
              },
            };
            return builder;
          },
        };
      },
    },
  };
}

async function run() {
  {
    const anchored = { id: 'snapshot-1', report_id: 'report-1', version: 1 };
    const later = { id: 'snapshot-2', report_id: 'report-1', version: 2 };
    const { client, queries } = createSnapshotClient([later, anchored]);

    const result = await loadAnchoredReportSnapshot(client as never, {
      id: 'report-1',
      snapshot_id: 'snapshot-1',
    });

    assert.deepEqual(result, { snapshot: anchored, resolution: 'anchored' });
    assert.deepEqual(queries, [{
      filters: [
        { field: 'id', value: 'snapshot-1' },
        { field: 'report_id', value: 'report-1' },
      ],
    }]);
  }

  for (const rows of [
    [{ id: 'snapshot-1', report_id: 'other-report', version: 1 }],
    [],
  ]) {
    const { client } = createSnapshotClient(rows);
    await assert.rejects(
      loadAnchoredReportSnapshot(client as never, { id: 'report-1', snapshot_id: 'snapshot-1' }),
      /Report snapshot integrity error: report report-1 references missing or foreign snapshot snapshot-1/,
    );
  }

  {
    const latest = { id: 'snapshot-2', report_id: 'legacy-report', version: 2 };
    const { client } = createSnapshotClient([
      { id: 'snapshot-1', report_id: 'legacy-report', version: 1 },
      latest,
    ]);
    const result = await loadAnchoredReportSnapshot(client as never, {
      id: 'legacy-report',
      snapshot_id: null,
    });
    assert.deepEqual(result, { snapshot: latest, resolution: 'legacy_latest' });
  }

  {
    const { client } = createSnapshotClient([]);
    const result = await loadAnchoredReportSnapshot(client as never, {
      id: 'legacy-report',
      snapshot_id: null,
    });
    assert.deepEqual(result, { snapshot: null, resolution: 'none' });
  }

  {
    const deletedReportIds: string[] = [];
    const client = {
      from(table: string) {
        if (table === 'report_snapshots') {
          return {
            insert() {
              return {
                select() {
                  return {
                    async single() {
                      return { data: null, error: { message: 'snapshot insert failed' } };
                    },
                  };
                },
              };
            },
          };
        }
        assert.equal(table, 'reports');
        return {
          delete() {
            return {
              async eq(field: string, value: unknown) {
                assert.equal(field, 'id');
                deletedReportIds.push(String(value));
                return { error: null };
              },
            };
          },
        };
      },
    };

    await assert.rejects(
      persistAnchoredReportSnapshot(client as never, 'report-1', { report_id: 'report-1' }),
      /snapshot insert failed/,
    );
    assert.deepEqual(deletedReportIds, ['report-1']);
  }

  console.log('report snapshot anchoring contract tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
