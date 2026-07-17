import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workspaceSource = readFileSync(
  'src/app/(main)/tasks/[id]/components/comparison-workspace.tsx',
  'utf8',
);
const pickerSource = readFileSync('src/components/material-picker.tsx', 'utf8');

test('comparison object cells reserve an equal media slot and use the compact material trigger', () => {
  assert.match(workspaceSource, /min-h-\[84px\]/);
  assert.match(workspaceSource, /compact/);
  assert.match(pickerSource, /compact\?: boolean/);
  assert.match(pickerSource, /size="icon"/);
});

test('comparison category deletion uses the same icon-only density as object deletion', () => {
  const categoryDeleteClass = 'className="h-8 w-8 text-muted-foreground hover:text-destructive"';
  const categoryDeleteButtonStart = workspaceSource.lastIndexOf('<Button', workspaceSource.indexOf(categoryDeleteClass));
  const categoryDeleteButtonEnd = workspaceSource.indexOf('</Button>', categoryDeleteButtonStart);
  const categoryDeleteButton = workspaceSource.slice(categoryDeleteButtonStart, categoryDeleteButtonEnd);
  assert.match(categoryDeleteButton, /size="icon"/);
  assert.match(categoryDeleteButton, /variant="ghost"/);
  assert.match(categoryDeleteButton, /className="h-8 w-8 text-muted-foreground hover:text-destructive"/);
  const categoryDeleteVisibleText = categoryDeleteButton.slice(categoryDeleteButton.indexOf('/>') + 2).trim();
  assert.equal(categoryDeleteVisibleText, '');
});

test('comparison object deletion is a compact confirmed action', () => {
  assert.match(workspaceSource, /pendingObjectDelete/);
  assert.match(workspaceSource, /AlertDialog/);
  assert.match(workspaceSource, /确认删除/);
});

test('mobile comparison uses an object overview and one focused editing column without a wide scroller', () => {
  assert.match(workspaceSource, /data-testid="comparison-mobile-overview"/);
  assert.match(workspaceSource, /data-testid="comparison-mobile-focus"/);
  assert.match(workspaceSource, /aria-pressed=/);
  assert.match(workspaceSource, /className="hidden md:block"/);
  assert.match(workspaceSource, /className="space-y-3 md:hidden"/);
});
