import assert from 'node:assert/strict';
import { isAllowedMediaSource, toPublicMediaUrl } from './use-presigned-url';

const origin = 'http://118.25.178.78:5000';

assert.equal(isAllowedMediaSource('/api/materials/file/video.mp4', origin), true);
assert.equal(isAllowedMediaSource('/uploads/video.mp4', origin), true);
assert.equal(isAllowedMediaSource('blob:http://118.25.178.78:5000/abc', origin), true);
assert.equal(isAllowedMediaSource('https://media.example.com/video.mp4', origin), true);
assert.equal(isAllowedMediaSource('http://118.25.178.78:5000/uploads/video.mp4', origin), true);
assert.equal(isAllowedMediaSource('http://172.19.3.12/disable/disable.htm', origin), false);
assert.equal(toPublicMediaUrl('http://172.19.3.12/disable/disable.htm'), null);

console.log('media source policy tests passed');
