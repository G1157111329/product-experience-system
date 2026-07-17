import assert from 'node:assert/strict';
import test from 'node:test';

// @ts-expect-error Node's direct TypeScript test runner needs the source extension.
import { stripAssistantReasoning } from './assistant-output.ts';

test('assistant output removes hidden reasoning and display-breaking characters while preserving Chinese', () => {
  assert.equal(
    stripAssistantReasoning('<think>先分析一下\n再组织答案</think>最终答案'),
    '最终答案',
  );
  assert.equal(
    stripAssistantReasoning('开头\n<THINK>内部推理</THINK>\n结论'),
    '开头\n\n结论',
  );
  assert.equal(
    stripAssistantReasoning('可见回答<think>未闭合的内部推理'),
    '可见回答',
  );
  assert.equal(stripAssistantReasoning('正常回答'), '正常回答');
  assert.equal(stripAssistantReasoning(null), '');
  assert.equal(
    stripAssistantReasoning('<think>internal</think>\uFEFF请\u0000确认写入。\uFFFD'),
    '请确认写入。',
  );
});
