import assert from 'node:assert/strict';
import { selectActiveAssemblyForTask } from './comparison-assembly';

const taskId = 'task-1';

assert.equal(
  selectActiveAssemblyForTask([
    { id: 'archived-new', source_task_ids: [taskId], status: 'archived' },
    { id: 'active-old', source_task_ids: [taskId], status: 'draft' },
  ],
  taskId)?.id,
  'active-old',
);

assert.equal(
  selectActiveAssemblyForTask([
    { id: 'archived-only', source_task_ids: [taskId], status: 'archived' },
  ],
  taskId),
  null,
);

console.log('comparison assembly selection tests passed');
