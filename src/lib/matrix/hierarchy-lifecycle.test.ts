import assert from 'node:assert/strict';
import { decideHierarchyDeletion } from './hierarchy-lifecycle';

assert.deepEqual(
  decideHierarchyDeletion({ meaningfulCellCount: 0, mediaLinkCount: 0, issuePointCount: 0 }),
  { mode: 'delete', requiresConfirmation: false },
);
assert.deepEqual(
  decideHierarchyDeletion({ meaningfulCellCount: 1, mediaLinkCount: 0, issuePointCount: 0 }),
  { mode: 'archive', requiresConfirmation: true },
);
assert.deepEqual(
  decideHierarchyDeletion({ meaningfulCellCount: 0, mediaLinkCount: 1, issuePointCount: 0 }),
  { mode: 'archive', requiresConfirmation: true },
);
assert.deepEqual(
  decideHierarchyDeletion({ meaningfulCellCount: 0, mediaLinkCount: 0, issuePointCount: 1 }),
  { mode: 'archive', requiresConfirmation: true },
);

console.log('hierarchy lifecycle tests passed');
