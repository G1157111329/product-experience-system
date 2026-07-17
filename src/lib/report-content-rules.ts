export interface AiSummaryContent {
  tag: string;
  satisfaction_score?: number;
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

const SUMMARY_LABELS = ['总结', '主要优势', '主要风险', '历史表现', '后续建议'] as const;
type SummaryLabel = (typeof SUMMARY_LABELS)[number];

const SCORE_LINE = /(?:满意度|(?:AI|综合|总体|体验)?评分|得分|分数|\/[ ]?10)/u;

function withoutScoreLines(value: string) {
  return value
    .split('\n')
    .filter((line) => !SCORE_LINE.test(line))
    .join('\n')
    .trim();
}

function withoutScoreItems(items: string[] | undefined) {
  return (items || []).filter((item) => !SCORE_LINE.test(item));
}

export function selectEffectEvaluationText(recipe: EffectEvaluationSource) {
  const manual = String(recipe.effect_description ?? recipe.effectDescription ?? '').trim();
  if (manual) return manual;
  const aiResult = recipe.effect_ai_result ?? recipe.effectAiResult;
  if (!aiResult || typeof aiResult !== 'object') return '';
  return String((aiResult as { summary?: unknown }).summary ?? '').trim();
}

export function formatAiSummaryText(summary: AiSummaryContent) {
  return [
    withoutScoreLines(summary.summary || ''),
    ...withoutScoreItems(summary.strengths).map((item) => `• ${item}`),
    ...withoutScoreItems(summary.risks).map((item) => `• ${item}`),
    withoutScoreLines(summary.historical_position || ''),
    ...withoutScoreItems(summary.suggestions).map((item) => `• ${item}`),
  ].filter(Boolean).join('\n\n').trim();
}

function textList(value: string) {
  return value
    .split(/[；;\n]/)
    .map((item) => item.replace(/^[•-]\s*/, '').trim())
    .filter(Boolean);
}

export function parseAiSummaryText(value: string, previous: AiSummaryContent): AiSummaryContent {
  const source = withoutScoreLines(value);
  const labelAlternation = SUMMARY_LABELS.join('|');
  const sectionHeading = new RegExp(`^(${labelAlternation})(?:：\\s*(.*))?$`);
  const hasLabels = source.split('\n').some((line) => sectionHeading.test(line.trim()));

  if (!hasLabels) {
    return {
      tag: previous.tag,
      summary: source,
      strengths: [],
      risks: [],
      historical_position: '',
      suggestions: [],
      ...(previous.updated_at ? { updated_at: previous.updated_at } : {}),
    };
  }

  const fields = Object.fromEntries(SUMMARY_LABELS.map((label) => [label, ''])) as Record<SummaryLabel, string>;
  let activeLabel: SummaryLabel | null = null;
  for (const line of source.split('\n')) {
    const heading = line.trim().match(sectionHeading);
    if (heading) {
      activeLabel = heading[1] as SummaryLabel;
      fields[activeLabel] = heading[2]?.trim() || '';
      continue;
    }
    if (activeLabel) fields[activeLabel] = `${fields[activeLabel]}${fields[activeLabel] ? '\n' : ''}${line}`.trimEnd();
  }

  return {
    tag: previous.tag,
    summary: fields.总结,
    strengths: withoutScoreItems(textList(fields.主要优势)),
    risks: withoutScoreItems(textList(fields.主要风险)),
    historical_position: fields.历史表现,
    suggestions: withoutScoreItems(textList(fields.后续建议)),
    ...(previous.updated_at ? { updated_at: previous.updated_at } : {}),
  };
}
