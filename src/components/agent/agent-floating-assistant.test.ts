import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  'src/components/agent/agent-floating-assistant.tsx',
  'utf8',
);

test('task AI exploration choices directly submit their preset to the always-visible chat panel', () => {
  assert.match(source, /data-testid="task-ai-entry-choices"/);
  assert.match(source, /aria-pressed=\{taskEntry\?\.id === entry\.id\}/);
  assert.doesNotMatch(source, /taskId && !taskEntry \?/);
  assert.match(source, /taskId \? \([\s\S]*?<HermesChat[\s\S]*?initialDraft=\{selectedTaskPrompt\}/);
});

test('floating AI dialog opens centered and exposes its established header as a drag handle', () => {
  assert.match(source, /data-testid="agent-floating-assistant-dialog"/);
  assert.match(source, /data-testid="agent-floating-assistant-drag-handle"/);
  assert.match(source, /left: '50%'/);
  assert.match(source, /top: '50%'/);
  assert.match(source, /transform: 'translate\(-50%, -50%\)'/);
  assert.match(source, /onPointerDown=\{startPanelDrag\}/);
  assert.match(source, /onPointerMove=\{movePanelDrag\}/);
  assert.match(source, /onPointerUp=\{endPanelDrag\}/);
});

test('floating assistant prefers WeChat/WeCom external conversation history when opening globally', () => {
  assert.match(source, /channel === 'external_chat'/);
  assert.match(source, /\/api\/v1\/agent\/conversations'/);
  assert.match(source, /pickPreferred/);
});
