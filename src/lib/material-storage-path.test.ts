import assert from 'node:assert/strict';
import { localStoragePathVariants } from './material-storage-path';

assert.deepEqual(
  localStoragePathVariants('experience-media/task-1/image/photo.jpg'),
  ['experience-media/task-1/image/photo.jpg', '/uploads/experience-media/task-1/image/photo.jpg'],
);

assert.deepEqual(
  localStoragePathVariants('/uploads/experience-media/task-1/image/photo.jpg'),
  ['/uploads/experience-media/task-1/image/photo.jpg', 'experience-media/task-1/image/photo.jpg'],
);

assert.deepEqual(localStoragePathVariants(''), []);
assert.deepEqual(localStoragePathVariants('/uploads/'), []);

console.log('material storage path tests passed');
