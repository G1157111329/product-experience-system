import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('src/components/material-picker.tsx', 'utf8');

test('material picker does not hide an asset because it is already bound elsewhere', () => {
  assert.doesNotMatch(source, /list\s*=\s*list\.filter\(/);
  assert.doesNotMatch(source, /return !material\.record_id && !material\.recipe_step_id/);
});
