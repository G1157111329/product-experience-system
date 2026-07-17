import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const sharedHook = read('src/hooks/use-debounced-save.ts');
const sharedSchedule = sharedHook.match(/const schedule = useCallback\([\s\S]*?\n  \}, \[[^\]]*\]\);/)?.[0] ?? '';
assert.match(sharedSchedule, /pendingValueRef\.current = value/, 'typing must retain the complete latest local draft');
assert.match(sharedSchedule, /registerLatestDraft\(\)/, 'typing must register the latest retryable draft');
assert.doesNotMatch(sharedSchedule, /setTimeout|flushInlineSave/, 'typing must not schedule or start a save request');

const inlineEditable = read('src/components/inline-editable.tsx');
assert.match(inlineEditable, /lastAuthoritativeValueRef/, 'authoritative refreshes must be compared with the last server value');
assert.match(inlineEditable, /status === 'dirty' \|\| status === 'saving' \|\| status === 'error' \|\| status === 'conflict'/, 'server refresh must not replace an unfinished draft');
assert.match(inlineEditable, /action === 'save'[\s\S]*flush\(\)[\s\S]*event\.currentTarget\.blur\(\)/, 'Enter must finish and flush the current field');

const matrixCell = read('src/app/(main)/tasks/[id]/components/matrix-cell.tsx');
const matrixSaveHook = matrixCell.match(/function useCompletionSave[\s\S]*?return \{ schedule, flush, hasPending \};\s*\}/)?.[0] ?? '';
assert.ok(matrixSaveHook, 'matrix text cells must use a completion-save hook');
assert.doesNotMatch(matrixSaveHook, /setTimeout|delay|deboun/i, 'matrix typing must not use debounce or periodic saves');
assert.match(matrixSaveHook, /dirtyRef\.current = true/, 'matrix typing must only mark the latest draft dirty');
assert.match(matrixSaveHook, /saveRef\.current\(valueRef\.current\)/, 'field completion must persist the latest draft');
assert.match(matrixCell, /onKeyDown=\{\(event\) => \{[\s\S]*event\.key === 'Enter'[\s\S]*flush\(\)[\s\S]*event\.currentTarget\.blur\(\)/, 'matrix Enter must finish the current field');

const ingredientEditor = read('src/app/(main)/tasks/[id]/components/recipe-ingredient-editor.tsx');
assert.doesNotMatch(ingredientEditor, /saveTimerRef|setTimeout\(/, 'ingredient text fields must not save on a typing timer');
assert.match(ingredientEditor, /onBlur=\{flushDraft\}/, 'ingredient fields must save when the current field is completed');
assert.match(ingredientEditor, /event\.key === 'Enter'[\s\S]*flushDraft\(\)[\s\S]*event\.currentTarget\.blur\(\)/, 'ingredient Enter must finish the current field');

const taskPage = read('src/app/(main)/tasks/[id]/page.tsx');
const sensesTab = taskPage.slice(taskPage.indexOf('function SensesTab'), taskPage.indexOf('/* ─── Tab: 功能效果'));
assert.match(sensesTab, /handleSensesDialogOpenChange/, 'closing the senses dialog must pass through an autosave gate');
assert.match(sensesTab, /handleSensesFieldCompletion/, 'blur or Enter must finish and autosave a senses field');
assert.match(sensesTab, /handleSensesMaterialSelectionChange/, 'selecting or uploading media must autosave the latest senses draft');
assert.match(sensesTab, /onBlurCapture=\{handleSensesFieldCompletion\}/, 'the dialog form must autosave completed fields');
assert.match(sensesTab, /onKeyDownCapture=\{handleSensesFieldKeyDown\}/, 'Enter must autosave the completed dialog field');
assert.doesNotMatch(sensesTab, /<Button onClick=\{handleAdd\}/, 'the senses dialog must not expose a manual save button');
assert.match(sensesTab, /toast\.error\([^)]*自动保存失败/, 'autosave failures must be explicit');
assert.match(sensesTab, /if \(!saved\) return/, 'a failed close save must keep the dialog open');

console.log('completion autosave contract tests passed');
