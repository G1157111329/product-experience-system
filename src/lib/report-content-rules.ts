export interface AiSummaryContent {
  tag: string;
  satisfaction_score: number;
  summary: string;
  strengths: string[];
  risks: string[];
  historical_position: string;
  suggestions: string[];
  updated_at?: string;
}

type EffectEvaluationSource = {
  effect_description?: unknown;
  effectDescription?: unknown;
  effect_ai_result?: unknown;
  effectAiResult?: unknown;
};

const SUMMARY_LABELS = ['总结', '满意度', '主要优势', '主要风险', '历史表现', '后续建议'] as const;
type SummaryLabel = (typeof SUMMARY_LABELS)[number];

export function selectEffectEvaluationText(recipe: EffectEvaluationSource) {
  const manual = String(recipe.effect_description ?? recipe.effectDescription ?? '').trim();
  if (manual) return manual;
  const aiResult = recipe.effect_ai_result ?? recipe.effectAiResult;
  if (!aiResult || typeof aiResult !== 'object') return '';
  return String((aiResult as { summary?: unknown }).summary ?? '').trim();
}

export function formatAiSummaryText(summary: AiSummaryContent) {
  const satisfaction = Number.isFinite(summary.satisfaction_score)
    ? `${summary.satisfaction_score}/10`
    : '';

  return [
    `总结：${summary.summary || ''}`,
    `满意度：${satisfaction}`,
    `主要优势：${(summary.strengths || []).join('；')}`,
    `主要风险：${(summary.risks || []).join('；')}`,
    `历史表现：${summary.historical_position || ''}`,
    `后续建议：${(summary.suggestions || []).join('；')}`,
  ].join('\n');
}

function textList(value: string) {
  return value
    .split(/[；;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseAiSummaryText(value: string, previous: AiSummaryContent): AiSummaryContent {
  const source = value.trim();
  const labelAlternation = SUMMARY_LABELS.join('|');
  const hasLabels = SUMMARY_LABELS.some((label) => new RegExp(`(?:^|\\n)${label}：`).test(source));

  if (!hasLabels) {
    return {
      ...previous,
      summary: source,
      strengths: [],
      risks: [],
      historical_position: '',
      suggestions: [],
    };
  }

  const fields = Object.fromEntries(SUMMARY_LABELS.map((label) => [label, ''])) as Record<SummaryLabel, string>;
  const pattern = new RegExp(
    `(?:^|\\n)(${labelAlternation})：([\\s\\S]*?)(?=\\n(?:${labelAlternation})：|$)`,
    'g',
  );
  for (const match of source.matchAll(pattern)) {
    fields[match[1] as SummaryLabel] = match[2].trim();
  }

  const scoreMatch = fields.满意度.match(/\d+(?:\.\d+)?/);
  return {
    ...previous,
    summary: fields.总结,
    satisfaction_score: scoreMatch
      ? Math.min(10, Math.max(0, Number(scoreMatch[0])))
      : previous.satisfaction_score,
    strengths: textList(fields.主要优势),
    risks: textList(fields.主要风险),
    historical_position: fields.历史表现,
    suggestions: textList(fields.后续建议),
  };
}
