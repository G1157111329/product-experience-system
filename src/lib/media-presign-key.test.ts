import assert from 'node:assert/strict';
import { mediaPresignKey } from './use-presigned-url';

assert.equal(
  mediaPresignKey('/uploads/experience-media/task-1/photo.jpg'),
  'experience-media/task-1/photo.jpg',
);
assert.equal(
  mediaPresignKey('experience-media/task-1/photo.jpg'),
  'experience-media/task-1/photo.jpg',
);
assert.equal(
  mediaPresignKey('/api/materials/file/experience-media/task-1/photo.jpg?token=valid&exp=123'),
  null,
);
assert.equal(mediaPresignKey('/api/materials/video/opaque-token'), null);
assert.equal(mediaPresignKey('https://cdn.example.test/photo.jpg'), null);

console.log('media presign key tests passed');
