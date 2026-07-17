import assert from 'node:assert/strict';
import { detectUploadMediaType } from './media-upload-type';

const mp4Prefix = Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
const jpegPrefix = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

assert.deepEqual(
  detectUploadMediaType({ fileName: 'IMG_001.MP4.jpg', declaredMime: 'application/octet-stream', prefix: mp4Prefix }),
  { materialType: 'video', mimeType: 'video/mp4', extension: 'mp4' },
);
assert.deepEqual(
  detectUploadMediaType({ fileName: '手机拍摄', declaredMime: '', prefix: jpegPrefix }),
  { materialType: 'image', mimeType: 'image/jpeg', extension: 'jpg' },
);
assert.throws(
  () => detectUploadMediaType({ fileName: 'photo.jpg', declaredMime: 'image/jpeg', prefix: mp4Prefix }),
  /媒体类型与文件内容不一致/,
);

console.log('media upload type tests passed');
