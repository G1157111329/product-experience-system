import assert from 'node:assert/strict';
import {
  buildDisplayReportContent,
  mergeReviewOverrides,
  preserveReviewOverrides,
  type ReportContentWithReview,
} from './report-review-overrides';

const generatedContent: ReportContentWithReview = {
  task: { task_name: '清洁体验' },
  ai_summary: {
    tag: 'AI原始判断',
    satisfaction_score: 7,
    summary: 'AI生成的总评',
    strengths: ['AI优势'],
    risks: ['AI风险'],
    historical_position: 'AI历史判断',
    suggestions: ['AI建议'],
  },
  records: [],
  recipes: [],
  materials: [],
  generatedAt: '2026-05-23T00:00:00.000Z',
};

const overrides = {
  title: '人工润色标题',
  ai_summary: {
    tag: '人工判断',
    satisfaction_score: 8.5,
    summary: '人工润色后的总评',
    strengths: ['人工优势'],
    risks: ['人工风险'],
    historical_position: '人工历史判断',
    suggestions: ['人工建议'],
  },
  review_note: '评审确认可发布',
  review_status: 'reviewed' as const,
  updated_at: '2026-05-23T01:00:00.000Z',
};

const display = buildDisplayReportContent(
  { title: '系统标题', content: { ...generatedContent, review_overrides: overrides } },
);

assert.equal(display.title, '人工润色标题');
assert.equal(display.ai_summary?.summary, '人工润色后的总评');
assert.equal(display.ai_summary?.tag, '人工判断');
assert.equal(display.review_note, '评审确认可发布');
assert.equal(display.review_status, 'reviewed');

const merged = mergeReviewOverrides(generatedContent, {
  ai_summary: {
    summary: '只改总评',
  },
  review_status: 'draft',
});

assert.equal(merged.review_overrides?.ai_summary?.summary, '只改总评');
assert.equal(merged.review_overrides?.review_status, 'draft');
assert.equal(merged.ai_summary?.summary, 'AI生成的总评');

const regenerated = preserveReviewOverrides(
  { ...generatedContent, review_overrides: overrides },
  {
    ...generatedContent,
    ai_summary: {
      ...generatedContent.ai_summary!,
      summary: '重新生成的AI总评',
    },
    generatedAt: '2026-05-23T02:00:00.000Z',
  },
);

assert.equal(regenerated.ai_summary?.summary, '重新生成的AI总评');
assert.equal(regenerated.review_overrides?.ai_summary?.summary, '人工润色后的总评');
assert.equal(regenerated.review_overrides?.review_status, 'reviewed');

const overwritten = preserveReviewOverrides(
  { ...generatedContent, review_overrides: overrides },
  { ...generatedContent, generatedAt: '2026-05-23T03:00:00.000Z' },
  { preserve: false },
);

assert.equal(overwritten.review_overrides, undefined);

console.log('report-review-overrides tests passed');
