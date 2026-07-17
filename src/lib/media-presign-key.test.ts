import assert from 'node:assert/strict';
import { buildMediaDerivativeUrl, mediaPresignKey } from './use-presigned-url';

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

const videoKey = 'materials/task-1/phone-video.mp4';
const opaqueVideoKey = Buffer.from(videoKey, 'utf8').toString('base64url');
assert.equal(
  buildMediaDerivativeUrl(`/api/materials/video/${opaqueVideoKey}?exp=123&token=signed`, 'poster'),
  `/api/materials/poster/${videoKey}?exp=123&token=signed`,
  'protected video poster URLs must retain the same signed authorization as the video stream',
);

console.log('media presign key tests passed');
