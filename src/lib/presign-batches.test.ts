import assert from 'node:assert/strict';
import { resolvePresignBatches } from './presign-batches';

async function main() {
  const paths = [
    ...Array.from({ length: 123 }, (_, index) => `uploads/${index}.jpg`),
    'uploads/0.jpg',
    ' ',
  ];
  const batches: string[][] = [];
  const result = await resolvePresignBatches(paths, async (batch) => {
    batches.push(batch);
    return Object.fromEntries(batch.map((path) => [path, `signed:${path}`]));
  });

  assert.deepEqual(batches.map((batch) => batch.length), [50, 50, 23]);
  assert.equal(Object.keys(result).length, 123);
  assert.equal(result['uploads/122.jpg'], 'signed:uploads/122.jpg');

  const attempted: string[][] = [];
  const partial = await resolvePresignBatches(paths.slice(0, 120), async (batch) => {
    attempted.push(batch);
    if (attempted.length === 2) throw new Error('temporary signing failure');
    return Object.fromEntries(batch.map((path) => [path, `signed:${path}`]));
  });

  assert.deepEqual(attempted.map((batch) => batch.length), [50, 50, 20]);
  assert.equal(Object.keys(partial).length, 70);
  assert.equal(partial['uploads/119.jpg'], 'signed:uploads/119.jpg');

  console.log('presign-batches tests passed');
}

void main();
