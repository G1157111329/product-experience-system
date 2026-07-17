import assert from 'node:assert/strict';
import { resolveMaterialEditSaveMode } from './material-edit-policy';

assert.equal(
  resolveMaterialEditSaveMode({ requested: 'overwrite', hasFrozenReference: true }),
  'save_new',
  'a material referenced by a frozen report must never overwrite the archived original',
);
assert.equal(
  resolveMaterialEditSaveMode({ requested: 'overwrite', hasFrozenReference: false }),
  'overwrite',
  'unfrozen task media may still overwrite when the user explicitly chooses it',
);
assert.equal(
  resolveMaterialEditSaveMode({ requested: 'save_new', hasFrozenReference: true }),
  'save_new',
  'save-as-new remains available for all materials',
);

console.log('material edit policy tests passed');
