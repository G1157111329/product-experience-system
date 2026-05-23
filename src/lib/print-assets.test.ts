import assert from 'node:assert/strict';
import { normalizePrintMode, uniqueUrls, mapWithConcurrency } from './print-assets';

assert.equal(normalizePrintMode('high'), 'high');
assert.equal(normalizePrintMode('text'), 'text');
assert.equal(normalizePrintMode('unknown'), 'fast');
assert.equal(normalizePrintMode(null), 'fast');

assert.deepEqual(
  uniqueUrls(['a.jpg', '', 'b.jpg', 'a.jpg', '  ', 'c.jpg', 'b.jpg']),
  ['a.jpg', 'b.jpg', 'c.jpg'],
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
