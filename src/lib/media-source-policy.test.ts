import assert from 'node:assert/strict';
import { isAllowedMediaSource, toMediaStorageKey, toPublicMediaUrl } from './use-presigned-url';

const origin = 'http://118.25.178.78:5000';

assert.equal(isAllowedMediaSource('/api/materials/file/video.mp4', origin), true);
assert.equal(isAllowedMediaSource('/api/materials/video/b3BhcXVlLXRva2Vu', origin), true);
assert.equal(isAllowedMediaSource('/uploads/video.mp4', origin), true);
assert.equal(isAllowedMediaSource('blob:http://118.25.178.78:5000/abc', origin), true);
assert.equal(isAllowedMediaSource('https://media.example.com/video.mp4', origin), true);
assert.equal(isAllowedMediaSource('http://118.25.178.78:5000/uploads/video.mp4', origin), true);
assert.equal(isAllowedMediaSource('http://172.19.3.12/disable/disable.htm', origin), false);
assert.equal(toPublicMediaUrl('http://172.19.3.12/disable/disable.htm'), null);
assert.equal(
  toMediaStorageKey('/api/materials/file/materials/task-a/demo.mp4?exp=123&token=stale'),
  'materials/task-a/demo.mp4',
);
assert.equal(
  toMediaStorageKey('http://localhost:5000/api/materials/file/materials/task-a/demo.mp4?exp=123&token=stale'),
  'materials/task-a/demo.mp4',
);
assert.equal(toMediaStorageKey('/uploads/materials/task-a/demo.mp4'), 'materials/task-a/demo.mp4');

console.log('media source policy tests passed');
