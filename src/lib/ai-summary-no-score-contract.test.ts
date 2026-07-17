import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatAiSummaryText } from './report-content-rules';

const summaryText = formatAiSummaryText({
  tag: '体验总结',
  satisfaction_score: 8,
  summary: '整体运行稳定。',
  strengths: ['操作清晰'],
  risks: ['清洁步骤较多'],
  historical_position: '较前代更稳定',
  suggestions: ['优化清洁指引'],
});

assert.doesNotMatch(summaryText, /满意度|评分|得分|分数|\/10/, 'AI report summary text must never expose a score');

const taskPage = readFileSync('src/app/(main)/tasks/[id]/page.tsx', 'utf8');
const route = readFileSync('src/app/api/tasks/[id]/ai-summary/route.ts', 'utf8');

assert.doesNotMatch(taskPage, /aiSummary\.satisfaction_score/, 'the AI summary card must not render a score');
assert.doesNotMatch(route, /AI评分/, 'the AI summary input snapshot must not include recipe AI scores');
assert.match(route, /不得输出、推断或提及任何评分/, 'the server must override stale custom prompts and prohibit scores');

console.log('AI summary no-score contract passed');
