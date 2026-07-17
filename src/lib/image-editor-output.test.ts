import assert from 'node:assert/strict';
import { capImageOutputDimensions } from './image-editor-output';

assert.deepEqual(
  capImageOutputDimensions({ width: 5000, height: 2500 }),
  { width: 1920, height: 960, constrained: true },
  'large images must be capped to a mobile-safe longest edge before canvas export',
);
assert.deepEqual(
  capImageOutputDimensions({ width: 1200, height: 800 }),
  { width: 1200, height: 800, constrained: false },
  'small images must keep their requested export dimensions',
);

console.log('image editor output tests passed');
