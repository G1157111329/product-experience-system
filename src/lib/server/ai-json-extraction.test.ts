import assert from 'node:assert/strict';
import test from 'node:test';

// @ts-expect-error Node's direct TypeScript test runner needs the source extension.
import { extractJsonObject } from './ai.ts';

test('extractJsonObject ignores model reasoning before the final JSON payload', () => {
  const output = '<think>先分析 {"internal":true}</think>\n{"reply":"计划已生成","actions":[{"type":"record_create"}]}';

  assert.deepEqual(
    extractJsonObject(output, { reply: '', actions: [] as unknown[] }),
    { reply: '计划已生成', actions: [{ type: 'record_create' }] },
  );
});
