import assert from 'node:assert/strict';
import { toOpaqueVideoTransportUrl } from './video-media-transport';

const key = 'materials/task-1/phone-video.mp4';
const opaqueKey = Buffer.from(key, 'utf8').toString('base64url');

assert.equal(
  toOpaqueVideoTransportUrl(`/api/materials/file/${key}?exp=123&token=signed-token`),
  `/api/materials/video/${opaqueKey}?exp=123&token=signed-token`,
);
assert.equal(
  toOpaqueVideoTransportUrl(`https://example.test/api/materials/file/${key}?token=signed-token&exp=123`),
  `https://example.test/api/materials/video/${opaqueKey}?token=signed-token&exp=123`,
);
assert.equal(toOpaqueVideoTransportUrl('/api/materials/file/materials/task-1/photo.jpg?token=signed'), null);

console.log('opaque video transport tests passed');
