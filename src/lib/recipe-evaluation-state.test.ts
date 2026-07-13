import assert from 'node:assert/strict';
import { materialSignature, shouldReportSaveError, shouldSyncExternalMaterials } from './recipe-evaluation-state';

assert.equal(materialSignature([{ id: 'b' }, { id: 'a' }]), 'a|b');
assert.equal(shouldSyncExternalMaterials({ externalSignature: 'a|b', localSignature: 'a', dirty: false, inFlight: 0 }), true);
assert.equal(shouldSyncExternalMaterials({ externalSignature: 'a|b', localSignature: 'a', dirty: true, inFlight: 0 }), false);
assert.equal(shouldSyncExternalMaterials({ externalSignature: 'a|b', localSignature: 'a', dirty: false, inFlight: 1 }), false);
assert.equal(shouldSyncExternalMaterials({ externalSignature: 'a', localSignature: 'a', dirty: false, inFlight: 0 }), false);
assert.equal(shouldReportSaveError(false), true);
assert.equal(shouldReportSaveError(true), false);
console.log('recipe evaluation external sync tests passed');
