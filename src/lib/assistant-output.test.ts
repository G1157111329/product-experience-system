import assert from 'node:assert/strict';
import { stripAssistantReasoning } from './assistant-output';

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

console.log('assistant output tests passed');
