import type { AiTaskSummary } from './types';

export function summaryToForm(summary: AiTaskSummary) {
  return {
    tag: summary.tag || '',
    satisfaction_score: String(summary.satisfaction_score ?? 0),
    summary: summary.summary || '',
    strengths: (summary.strengths || []).join('\n'),
    risks: (summary.risks || []).join('\n'),
    historical_position: summary.historical_position || '',
    suggestions: (summary.suggestions || []).join('\n'),
  };
}

export function linesToList(value: string) {
  return value.split('\n').map((line) => line.trim()).filter(Boolean);
}
