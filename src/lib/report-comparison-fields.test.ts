import assert from 'node:assert/strict';
import { comparisonCellFields } from './report-comparison-fields';

const result = comparisonCellFields({
  process_notes: ['加水 1650ml', '运行 1 小时'],
  effect_summary: '粥底绵密',
});

assert.deepEqual(result.processNotes, ['加水 1650ml', '运行 1 小时']);
assert.equal(result.conclusion, '粥底绵密');
assert.notEqual(result.processNotes.join('；'), result.conclusion);

const legacy = comparisonCellFields({
  process_notes: '单段过程记录',
  conclusion: '旧版效果结论',
});
assert.deepEqual(legacy.processNotes, ['单段过程记录']);
assert.equal(legacy.conclusion, '旧版效果结论');

console.log('report comparison field tests passed');
