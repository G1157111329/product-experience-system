import type { AiTaskSummary } from './types';
import { formatAiSummaryText } from '@/lib/report-content-rules';

export function summaryToForm(summary: AiTaskSummary) {
  return { text: formatAiSummaryText(summary) };
}
