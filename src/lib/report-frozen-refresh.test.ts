import assert from 'node:assert/strict';
import { fetchFrozenReportProjection } from './report-frozen-refresh';

const fullOverlay = {
  status: 'rectifying', rectification: 'updated', evidence: [{ id: 'rectified' }],
  retest: { count: 2, latest: { id: 'new' }, history: [{ id: 'new' }, { id: 'old' }] },
};

async function main() {
  const refreshed = await fetchFrozenReportProjection('report-1', async () => new Response(JSON.stringify({
    code: 0,
    data: {
      frozenViewModel: { header: { id: 'report-1' }, issues: [{ id: 'frozen', liveOverlay: fullOverlay }] },
      siblingReports: [{ id: 'report-2' }],
      siblingFrozenViewModels: { 'report-2': { header: { id: 'report-2' } } },
      mergedReportOrder: ['report-1', 'report-2'],
    },
  }), { status: 200 }));
  assert.deepEqual(refreshed.frozenViewModel.issues[0]?.liveOverlay, fullOverlay, 'refresh returns the complete authoritative overlay');
  assert.deepEqual(refreshed.mergedReportOrder, ['report-1', 'report-2']);

  await assert.rejects(
    () => fetchFrozenReportProjection('report-1', async () => new Response(JSON.stringify({ code: 1, message: 'refresh failed' }), { status: 500 })),
    /refresh failed/,
    'refresh failure rejects so the caller can preserve its previous state',
  );
  console.log('frozen report refresh contract tests passed');
}

void main();
