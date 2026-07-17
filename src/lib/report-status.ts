export interface ReportStatusPresentation {
  code: string;
  label: string;
}

/**
 * Keep persisted report state visible. A draft must never be presented as a
 * completed report because publication is a separate, user-facing lifecycle.
 */
export function getReportStatusPresentation(status: string | null | undefined): ReportStatusPresentation {
  const value = String(status || '').trim();
  const normalized = value.toLowerCase();
  const known: Record<string, ReportStatusPresentation> = {
    draft: { code: 'draft', label: '草稿' },
    草稿: { code: 'draft', label: '草稿' },
    pending_review: { code: 'pending_review', label: '待审' },
    待审: { code: 'pending_review', label: '待审' },
    published: { code: 'published', label: '已发布' },
    已发布: { code: 'published', label: '已发布' },
    archived: { code: 'archived', label: '已归档' },
    已归档: { code: 'archived', label: '已归档' },
    completed: { code: 'completed', label: '已完成' },
    已完成: { code: 'completed', label: '已完成' },
  };
  if (known[normalized]) return known[normalized];
  if (!value) return { code: 'unknown', label: '未知状态' };
  return { code: value, label: value };
}
