import assert from 'node:assert/strict';
import test from 'node:test';
import { orderRowsByHierarchy } from './hierarchy-row-order';

test('hierarchy row order keeps sibling level-three rows under their level-two parent', () => {
  const rows = orderRowsByHierarchy(
    [
      { id: 'late-child', level1NodeId: 'l1', level2NodeId: 'l2a', level3NodeId: 'l3a2', visibleRowIndex: 5 },
      { id: 'other-parent', level1NodeId: 'l1', level2NodeId: 'l2b', level3NodeId: 'l3b1', visibleRowIndex: 3 },
      { id: 'first-child', level1NodeId: 'l1', level2NodeId: 'l2a', level3NodeId: 'l3a1', visibleRowIndex: 1 },
    ],
    new Map([
      ['l1', 1], ['l2a', 1], ['l2b', 2], ['l3a1', 1], ['l3a2', 2], ['l3b1', 1],
    ]),
  );

  assert.deepEqual(rows.map((row) => row.id), ['first-child', 'late-child', 'other-parent']);
});
