import assert from 'node:assert/strict';
import { authoritativeRetestRows } from './report-frozen-view';

const frozen = [{ id: 'frozen-retest', created_at: '2026-07-10T00:00:00.000Z' }];
const latest = [{ id: 'live-retest', created_at: '2026-07-11T00:00:00.000Z' }];

assert.deepEqual(
  authoritativeRetestRows(frozen, []),
  [],
  'an explicitly loaded empty live retest list must remove a deleted frozen retest from every report surface',
);
assert.deepEqual(
  authoritativeRetestRows(frozen, latest),
  latest,
  'live retests must replace frozen retest history instead of being merged with it',
);
assert.deepEqual(
  authoritativeRetestRows(frozen, undefined),
  frozen,
  'legacy projections without a live retest field may fall back to frozen history',
);

console.log('frozen retest authority tests passed');
