import assert from 'node:assert/strict';
import {
  formatAiSummaryText,
  parseAiSummaryText,
  selectEffectEvaluationText,
} from './report-content-rules';

assert.equal(
  selectEffectEvaluationText({
    effect_description: '  人工效果评价  ',
    effect_ai_result: { summary: 'AI 评价' },
  }),
  '人工效果评价',
);

assert.equal(
  selectEffectEvaluationText({
    effect_description: '   ',
    effect_ai_result: { summary: 'AI 评价' },
  }),
  'AI 评价',
);

assert.equal(selectEffectEvaluationText({}), '');
assert.equal(
  selectEffectEvaluationText({
    effectDescription: '',
    effectAiResult: { summary: '兼容旧字段 AI 评价' },
  }),
  '兼容旧字段 AI 评价',
);

const summary = {
  tag: '良好',
  summary: '整体稳定',
  strengths: ['加热均匀', '操作清晰'],
  risks: ['水量偏少'],
  historical_position: '较上一轮提升',
  suggestions: ['补充连续运行测试'],
};
const text = formatAiSummaryText(summary);

assert.match(text, /^总结\n整体稳定/m);
assert.match(text, /^主要优势\n• 加热均匀/m);
assert.doesNotMatch(text, /满意度|评分|得分|分数|\/10/);
assert.deepEqual(parseAiSummaryText(text, summary), summary);

const freeText = parseAiSummaryText('没有标签的自由编辑内容', summary);
assert.equal(freeText.summary, '没有标签的自由编辑内容');
assert.deepEqual(freeText.strengths, []);
assert.deepEqual(freeText.risks, []);
assert.equal(freeText.historical_position, '');
assert.deepEqual(freeText.suggestions, []);

console.log('report-content-rules tests passed');
