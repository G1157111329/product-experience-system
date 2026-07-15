import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  registerPendingInlineSave,
  waitForPendingInlineSavesOrThrow,
} from './inline-save-registry';

const sharedHook = readFileSync(resolve(process.cwd(), 'src/hooks/use-debounced-save.ts'), 'utf8');
assert.match(sharedHook, /markInlineSaveDirty\(saveKeyRef\.current, persistLatest\)/, 'onChange must register a retryable latest-value factory');
assert.match(sharedHook, /result\?\.conflict[\s\S]*throw conflict/, 'a conflict must remain dirty and block publishing/navigation');
assert.match(sharedHook, /useEffect\(\(\) => \{\s*mountedRef\.current = true;[\s\S]*const saveKey = saveKeyRef\.current;[\s\S]*flushInlineSave\(saveKey\)/, 'StrictMode setup must remount and unmount may only flush the registered entry');

const matrixCell = readFileSync(
  resolve(process.cwd(), 'src/app/(main)/tasks/[id]/components/matrix-cell.tsx'),
  'utf8',
);
assert.doesNotMatch(matrixCell, /useEffect\(\(\) => \(\) => cancel\(\)/, 'matrix cells must not discard a pending save on unmount');
assert.match(matrixCell, /useEffect\(\(\) => \(\) => flush\(\)/, 'matrix cells must flush pending edits on unmount');

const ingredientEditor = readFileSync(
  resolve(process.cwd(), 'src/app/(main)/tasks/[id]/components/recipe-ingredient-editor.tsx'),
  'utf8',
);
assert.match(ingredientEditor, /markInlineSaveDirty\(saveKeyRef\.current, persistLatest\)/, 'ingredient edits must be dirty before debounce or blur');
assert.match(ingredientEditor, /onSaveRef\.current\(toIngredientPayload\(draftRef\.current\)\)/, 'ingredient retry factory must read its latest draft');
assert.doesNotMatch(ingredientEditor, /registerPendingInlineSave/, 'ingredient cleanup must not create a new untracked save entry');

const navigation = readFileSync(resolve(process.cwd(), 'src/components/navigation.tsx'), 'utf8');
assert.match(navigation, /createNavigateHandler[\s\S]*event\.defaultPrevented[\s\S]*return/, 'Next Link capture must respect a document-level dirty navigation veto');

const functionsWorkspace = readFileSync(resolve(process.cwd(), 'src/app/(main)/tasks/[id]/components/functions-input-workspace.tsx'), 'utf8');
assert.match(functionsWorkspace, /attemptNavigation\(\(\) => \{[\s\S]*setSelectedRecipeId\(recipe\.id\)/, 'recipe selection must wait for pending saves');

const sensesWorkspace = readFileSync(resolve(process.cwd(), 'src/app/(main)/tasks/[id]/components/senses-input-workspace.tsx'), 'utf8');
assert.match(sensesWorkspace, /attemptNavigation\(\(\) => \{[\s\S]*setSelectedId\(record\.id\)/, 'record selection must wait for pending saves');

const matrixTab = readFileSync(resolve(process.cwd(), 'src/app/(main)/tasks/[id]/components/matrix-tab.tsx'), 'utf8');
assert.match(matrixTab, /attemptNavigation\(\(\) => setSelectedMatrixId\(m\.id\)\)/, 'matrix object selection must wait for pending saves');

const matrixGrid = readFileSync(resolve(process.cwd(), 'src/app/(main)/tasks/[id]/components/matrix-v3-grid.tsx'), 'utf8');
assert.match(matrixGrid, /markInlineSaveDirty/, 'direct V3 grid drafts must enter the shared save registry before blur');
assert.match(matrixGrid, /registerMatrixSave/, 'direct V3 grid save registration must use one non-duplicating boundary');

const matrixMobile = readFileSync(resolve(process.cwd(), 'src/app/(main)/tasks/[id]/components/matrix-v3-mobile.tsx'), 'utf8');
assert.match(matrixMobile, /attemptNavigation\(\(\) =>[\s\S]*setCurrentRowIndex/, 'V3 mobile row changes must use retry/discard navigation semantics');

const recipeEvaluation = readFileSync(resolve(process.cwd(), 'src/components/recipes/recipe-evaluation-panel.tsx'), 'utf8');
assert.match(recipeEvaluation, /markInlineSaveDirty\(recipeSaveFailureKeyRef\.current,[\s\S]*flushInlineSave/, 'recipe evaluation queue must retain a retry factory and flush it explicitly');

const taskPage = readFileSync(resolve(process.cwd(), 'src/app/(main)/tasks/[id]/page.tsx'), 'utf8');
assert.match(
  taskPage,
  /await waitForPendingInlineSavesOrThrow\(\)[\s\S]*fetch\('\/api\/reports'/,
  'report generation must propagate inline-save failures before POSTing a report',
);
assert.doesNotMatch(
  taskPage,
  /await waitForPendingInlineSaves\(\)[\s\S]*fetch\('\/api\/reports'/,
  'report generation must not use the failure-swallowing wait path',
);
assert.match(
  taskPage,
  /handleTransfer[\s\S]*await attemptNavigation\(\(\) => \{ saveGatePassed = true; \}\);[\s\S]*if \(!saveGatePassed\) return;[\s\S]*fetch\(`\/api\/tasks\/\$\{id\}\/transfer`/,
  'transfer POST must start only after the save guard succeeds, outside its continuation',
);

async function verifyCompletedFailureStillBlocksPublishing() {
  const failedSave = registerPendingInlineSave(Promise.reject(new Error('字段保存失败：请重试')));
  await assert.rejects(failedSave, /字段保存失败/);
  await assert.rejects(
    waitForPendingInlineSavesOrThrow(),
    /字段保存失败/,
    'a save that rejects before the publishing wait begins must remain observable',
  );
}

async function main() {
  await verifyCompletedFailureStillBlocksPublishing();
  console.log('autosave flush contract tests passed');
}

void main();
