import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const picker = readFileSync('src/components/material-picker.tsx', 'utf8');
const taskPage = readFileSync('src/app/(main)/tasks/[id]/page.tsx', 'utf8');

assert.match(picker, /enableImageEditing\?: boolean/, 'the reusable picker must keep image editing opt-in so read-only report surfaces never gain an editor');
assert.match(picker, /enableImageEditing && previewMaterial\.material_type === 'image'/, 'bound task images must expose editing only when the recording surface opts in');
assert.match(picker, /copy_source_file_name/, 'save-as-new must preserve an edited-copy filename instead of replacing the archived original');
assert.match(taskPage, /enableImageEditing/, 'the report-entry page must explicitly opt into editing for bound materials');

console.log('report entry image editor contract tests passed');
