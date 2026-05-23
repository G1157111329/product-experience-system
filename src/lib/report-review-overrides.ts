export type ReviewStatus = 'draft' | 'reviewed' | 'published';

export interface AiSummaryLike {
  tag?: string | null;
  satisfaction_score?: number | null;
  summary?: string | null;
  strengths?: string[];
  risks?: string[];
  historical_position?: string | null;
  suggestions?: string[];
  updated_at?: string;
}

export interface ReportReviewOverrides {
  title?: string;
  ai_summary?: Partial<AiSummaryLike>;
  review_note?: string;
  review_status?: ReviewStatus;
  updated_at?: string;
}

export interface ReportContentWithReview {
  task?: unknown;
  ai_summary?: AiSummaryLike | null;
  records?: unknown[];
  recipes?: unknown[];
  materials?: unknown[];
  generatedAt?: string;
  review_overrides?: ReportReviewOverrides;
  [key: string]: unknown;
}

export interface DisplayReportContent {
  title: string;
  ai_summary?: AiSummaryLike | null;
  review_note?: string;
  review_status: ReviewStatus;
  content: ReportContentWithReview;
}

function cleanString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function mergeReviewOverrides(
  content: ReportContentWithReview,
  overrides: ReportReviewOverrides,
): ReportContentWithReview {
  const current = content.review_overrides || {};
  const mergedAiSummary = overrides.ai_summary
    ? {
        ...(current.ai_summary || {}),
        ...overrides.ai_summary,
      }
    : current.ai_summary;

  const nextOverrides: ReportReviewOverrides = {
    ...current,
    ...overrides,
    updated_at: overrides.updated_at || new Date().toISOString(),
  };

  if (mergedAiSummary) nextOverrides.ai_summary = mergedAiSummary;

  return {
    ...content,
    review_overrides: nextOverrides,
  };
}

export function preserveReviewOverrides(
  oldContent: ReportContentWithReview | null | undefined,
  newContent: ReportContentWithReview,
  options: { preserve?: boolean } = {},
): ReportContentWithReview {
  const preserve = options.preserve !== false;
  if (!preserve || !oldContent?.review_overrides) return { ...newContent };

  return {
    ...newContent,
    review_overrides: oldContent.review_overrides,
  };
}

export function getEffectiveAiSummary(content: ReportContentWithReview | null | undefined) {
  if (!content) return null;
  const generated = content.ai_summary || null;
  const override = content.review_overrides?.ai_summary;
  if (!override) return generated;

  return {
    ...(generated || {}),
    ...override,
  };
}

export function buildDisplayReportContent(report: {
  title?: string | null;
  content?: ReportContentWithReview | null;
}): DisplayReportContent {
  const content = report.content || {};
  const overrides = content.review_overrides;
  const overrideTitle = cleanString(overrides?.title);

  return {
    title: overrideTitle || report.title || '',
    ai_summary: getEffectiveAiSummary(content),
    review_note: overrides?.review_note,
    review_status: overrides?.review_status || 'draft',
    content,
  };
}
