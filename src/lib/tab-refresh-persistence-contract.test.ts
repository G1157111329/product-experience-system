import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const taskPage = readFileSync('src/app/(main)/tasks/[id]/page.tsx', 'utf8');
const frozenReader = readFileSync('src/components/reports/frozen-report-reader.tsx', 'utf8');

assert.match(taskPage, /withActiveTabSearch/, 'task report-entry tabs must be persisted into the URL');
assert.match(taskPage, /window\.history\.replaceState/, 'task tab selection must survive browser refresh without reloading drafts');
assert.match(frozenReader, /withActiveTabSearch/, 'frozen report tabs must be persisted into the URL');
assert.match(frozenReader, /window\.history\.replaceState/, 'frozen issue tab must survive browser refresh');

console.log('tab refresh persistence contract passed');
