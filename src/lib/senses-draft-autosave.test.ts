import assert from 'node:assert/strict';
import {
  hasMaterialSelectionChanged,
  shouldCloseSensesDraftWithoutSaving,
} from './senses-draft-autosave';

assert.equal(
  hasMaterialSelectionChanged([], []),
  false,
  'opening and closing the material picker without selecting media must not mark a new sensory issue draft dirty',
);
assert.equal(
  hasMaterialSelectionChanged(['material-1'], ['material-1']),
  false,
  'an unchanged material selection must not start another autosave',
);
assert.equal(
  hasMaterialSelectionChanged(['material-1'], ['material-2']),
  true,
  'a changed material selection must remain autosaveable',
);
assert.equal(
  shouldCloseSensesDraftWithoutSaving({ draftDirty: false, formValid: false }),
  true,
  'an untouched invalid new issue draft must close silently',
);
assert.equal(
  shouldCloseSensesDraftWithoutSaving({ draftDirty: true, formValid: false }),
  false,
  'a changed invalid draft must remain open instead of being discarded',
);

console.log('sensory draft autosave tests passed');
