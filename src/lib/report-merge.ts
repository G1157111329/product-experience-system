export function normalizeReportProjectType(value: unknown) {
  const normalized = String(value ?? '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/\uFF0F/g, '/');

  if (normalized === '\u6539\u578b\u964d\u672c\u4f18\u5316') {
    return '\u6539\u578b/\u964d\u672c/\u4f18\u5316';
  }

  return normalized;
}

export function isMergeableReportProjectType(value: unknown) {
  const normalized = normalizeReportProjectType(value);
  return normalized === '\u81ea\u7814'
    || normalized === '\u524d\u671f\u7814\u7a76'
    || normalized === '\u6539\u578b/\u964d\u672c/\u4f18\u5316';
}

export function getReportMergeModel(value: unknown) {
  return String(value ?? '').trim();
}

export function sortReportsByCreatedAtAsc<T extends { created_at?: string | null }>(reports: T[]) {
  return [...reports].sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
}

export function sortReportsByCreatedAtDesc<T extends { created_at?: string | null }>(reports: T[]) {
  return [...reports].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

export function pickLatestReportPerTask<T extends { id?: string | null; task_id?: string | null; created_at?: string | null }>(
  reports: T[],
) {
  const byTaskId = new Map<string, T>();
  for (const report of reports) {
    const key = String(report.task_id || report.id || '');
    if (!key) continue;
    const existing = byTaskId.get(key);
    if (!existing || String(report.created_at || '') > String(existing.created_at || '')) {
      byTaskId.set(key, report);
    }
  }
  return Array.from(byTaskId.values());
}
