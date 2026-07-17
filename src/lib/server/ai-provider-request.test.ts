import assert from 'node:assert/strict';
import test from 'node:test';

// @ts-expect-error Node's direct TypeScript test runner needs the source extension.
import { buildChatCompletionRequest } from './ai.ts';

test('all OpenAI-compatible models use the same portable request shape', () => {
  const body = buildChatCompletionRequest({
    model: 'MiniMax-M3',
    messages: [{ role: 'user', content: '生成计划' }],
    temperature: 0.4,
    maxTokens: 6400,
  });

  assert.equal('thinking' in body, false);
  assert.equal('reasoning_split' in body, false);
  assert.equal('max_completion_tokens' in body, false);
  assert.equal(body.max_tokens, 6400);
});

test('portable request shape is independent of the configured model name', () => {
  const body = buildChatCompletionRequest({
    model: 'custom-model',
    messages: [{ role: 'user', content: '你好' }],
    temperature: 0.4,
    maxTokens: 1000,
  });

  assert.equal('thinking' in body, false);
  assert.equal('reasoning_split' in body, false);
  assert.equal(body.max_tokens, 1000);
});

test('configured provider capabilities extend the portable request without inspecting the model name', () => {
  const body = buildChatCompletionRequest({
    model: 'any-reasoning-model',
    messages: [{ role: 'user', content: '生成计划' }],
    temperature: 0.4,
    maxTokens: 6400,
    requestOptions: {
      tokenField: 'max_completion_tokens',
      extraBody: { thinking: { type: 'disabled' }, reasoning_split: true },
    },
  });

  assert.equal('max_tokens' in body, false);
  assert.equal(body.max_completion_tokens, 6400);
  assert.deepEqual(body.thinking, { type: 'disabled' });
  assert.equal(body.reasoning_split, true);
});
