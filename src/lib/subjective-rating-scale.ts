export const SUBJECTIVE_RATING_SCALE_SIZES = [5, 7, 10] as const;

export type SubjectiveRatingScaleSize = (typeof SUBJECTIVE_RATING_SCALE_SIZES)[number];

export type SubjectiveRatingScale = {
  max_score: SubjectiveRatingScaleSize;
  meanings: Record<string, string>;
};

type LegacyScaleItem = {
  subjective_score?: number | string | null;
  subjective_rating?: string | null;
  subjective_scale?: unknown;
};

function isSupportedScaleSize(value: unknown): value is SubjectiveRatingScaleSize {
  return typeof value === 'number' && SUBJECTIVE_RATING_SCALE_SIZES.includes(value as SubjectiveRatingScaleSize);
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return asObject(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function createSubjectiveRatingScale(maxScore: SubjectiveRatingScaleSize): SubjectiveRatingScale {
  return {
    max_score: maxScore,
    meanings: Object.fromEntries(Array.from({ length: maxScore }, (_, index) => [String(index + 1), ''])),
  };
}

export function normalizeSubjectiveRatingScale(value: unknown): SubjectiveRatingScale | null {
  const raw = asObject(value);
  if (!raw || !isSupportedScaleSize(raw.max_score)) return null;
  const rawMeanings = asObject(raw.meanings);
  if (!rawMeanings) return null;

  const scale = createSubjectiveRatingScale(raw.max_score);
  for (let score = 1; score <= raw.max_score; score += 1) {
    const meaning = rawMeanings[String(score)];
    scale.meanings[String(score)] = typeof meaning === 'string' ? meaning.trim() : '';
  }
  return scale;
}

export function resolveSubjectiveRatingScale(items: LegacyScaleItem[]): SubjectiveRatingScale | null {
  for (const item of items) {
    const normalized = normalizeSubjectiveRatingScale(item.subjective_scale);
    if (normalized) return normalized;
  }

  const legacyEntries = items
    .map((item) => ({
      score: Number(item.subjective_score),
      meaning: item.subjective_rating?.trim() || '',
    }))
    .filter((entry) => Number.isInteger(entry.score) && entry.score >= 1 && entry.meaning);
  if (!legacyEntries.length) return null;

  const greatestScore = Math.max(...legacyEntries.map((entry) => entry.score));
  const maxScore = SUBJECTIVE_RATING_SCALE_SIZES.find((size) => size >= greatestScore) || 10;
  const scale = createSubjectiveRatingScale(maxScore);
  for (const entry of legacyEntries) scale.meanings[String(entry.score)] = entry.meaning;
  return scale;
}

export function isCompleteSubjectiveRatingScale(scale: SubjectiveRatingScale | null | undefined): boolean {
  return Boolean(scale && Object.values(scale.meanings).every((meaning) => meaning.trim().length > 0));
}

export function formatSubjectiveRatingScale(scale: SubjectiveRatingScale | null | undefined): string {
  if (!scale) return '';
  const labels = Array.from({ length: scale.max_score }, (_, index) => {
    const score = index + 1;
    const meaning = scale.meanings[String(score)]?.trim();
    return meaning ? `${score}分=${meaning}` : `${score}分`;
  });
  return `${scale.max_score}分制：${labels.join('；')}`;
}

export function validateSubjectiveMeanScore(value: unknown, scale: SubjectiveRatingScale | null | undefined): { valid: boolean; value?: number; message?: string } {
  const numericValue = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(numericValue)) return { valid: false, message: '请填写平均分' };
  const maxScore = scale?.max_score ?? 5;
  if (numericValue < 1 || numericValue > maxScore) {
    return { valid: false, message: `平均分应在 1–${maxScore} 分之间` };
  }
  return { valid: true, value: numericValue };
}
