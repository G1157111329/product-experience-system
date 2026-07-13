import assert from 'node:assert/strict';
import { normalizePrintMode, uniqueUrls, mapWithConcurrency, posterStorageKey, signedPosterUrl } from './print-assets';

assert.equal(normalizePrintMode('high'), 'high');
assert.equal(normalizePrintMode('text'), 'text');
assert.equal(normalizePrintMode('unknown'), 'fast');
assert.equal(normalizePrintMode(null), 'fast');

assert.deepEqual(
  uniqueUrls(['a.jpg', '', 'b.jpg', 'a.jpg', '  ', 'c.jpg', 'b.jpg']),
  ['a.jpg', 'b.jpg', 'c.jpg'],
);

assert.equal(posterStorageKey('/api/materials/poster/videos/demo%20clip.mp4'), 'videos/demo clip.mp4');
assert.equal(
  signedPosterUrl('/api/materials/poster/videos/demo%20clip.mp4', '/api/materials/file/videos/demo%20clip.mp4?exp=123&token=signed'),
  '/api/materials/poster/videos/demo%20clip.mp4?exp=123&token=signed',
);
assert.equal(
  signedPosterUrl('/api/materials/poster/videos/demo.mp4', 'https://media.example/api/materials/file/videos/demo.mp4?token=signed'),
  'https://media.example/api/materials/poster/videos/demo.mp4?token=signed',
);

async function main() {
  let active = 0;
  let maxActive = 0;
  const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 10));
    active -= 1;
    return value * 2;
  });

  assert.deepEqual(result, [2, 4, 6, 8, 10]);
  assert.equal(maxActive <= 2, true);
}

main();
