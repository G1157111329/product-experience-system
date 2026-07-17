import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rectificationDialog = readFileSync('src/components/issues/issue-rectification-dialog.tsx', 'utf8');
const updateFieldBody = rectificationDialog.slice(
  rectificationDialog.indexOf('const updateField ='),
  rectificationDialog.indexOf('const saveField ='),
);
assert.doesNotMatch(
  updateFieldBody,
  /fetch\(/,
  'typing rectification text must stay local until the field is completed',
);
assert.match(rectificationDialog, /onBlur=\{\(e\) => void saveField\('improve_plan', e\.currentTarget\.value\)\}/, 'rectification text must save when the user leaves the completed field');

const materialRail = readFileSync('src/app/(main)/tasks/[id]/components/material-evidence-rail.tsx', 'utf8');
const deleteSelectedBody = materialRail.slice(
  materialRail.indexOf('const handleDeleteSelected ='),
  materialRail.indexOf('\n\n  return (', materialRail.indexOf('const handleDeleteSelected =')),
);
assert.match(deleteSelectedBody, /response\.ok/, 'bulk material deletion must verify every HTTP response');
assert.match(deleteSelectedBody, /data\.code\s*!==\s*0/, 'bulk material deletion must reject API-level failures');
assert.match(deleteSelectedBody, /detach_mutable_references=1/, 'confirmed authoring deletion must remove mutable bindings');

const sensesWorkspace = readFileSync('src/app/(main)/tasks/[id]/components/senses-input-workspace.tsx', 'utf8');
const recordDeleteBody = sensesWorkspace.slice(
  sensesWorkspace.indexOf('remove: async (target) =>'),
  sensesWorkspace.indexOf('refresh:', sensesWorkspace.indexOf('remove: async (target) =>')),
);
assert.match(
  recordDeleteBody,
  /onBindingTargetChange\(null\)/,
  'successful record deletion must clear the deleted record material-binding context',
);

console.log('authoring deletion regression contracts passed');
