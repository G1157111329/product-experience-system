import assert from 'node:assert/strict';
import test from 'node:test';

// @ts-expect-error -- Node's native TypeScript runner requires the explicit extension, while the project resolver disallows it.
import { getProjectTypeSelectionPatch, shouldSelectProjectPhase } from './task-report-info-options.ts';

test('only self-developed tasks have a selectable project phase', () => {
  assert.equal(shouldSelectProjectPhase('自研'), true);
  assert.equal(shouldSelectProjectPhase('改型/降本/优化'), false);
  assert.equal(shouldSelectProjectPhase('ODM/OEM'), false);
});

test('changing away from self-development clears its phase', () => {
  assert.deepEqual(getProjectTypeSelectionPatch('自研', '试制阶段'), {
    project_type: '自研',
    project_phase: '试制阶段',
  });
  assert.deepEqual(getProjectTypeSelectionPatch('ODM/OEM', '试制阶段'), {
    project_type: 'ODM/OEM',
    project_phase: null,
  });
});
