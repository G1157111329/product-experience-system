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
export type ReportListEntry<T extends {
  id?: string | null;
  task_id?: string | null;
  product_model?: string | null;
  project_type?: string | null;
  created_at?: string | null;
}> =
  | { kind: 'report'; sort_at: string; report: T }
  | { kind: 'group'; sort_at: string; model: string; projectTypes: string[]; reports: T[] };

/**
 * Builds the report-centre display units from frozen report rows.
 *
 * Only self-developed, early-research and cost-reduction reports sharing a
 * non-empty product model can form a model group.  A task contributes its
 * latest eligible report once; all other report cards remain standalone.
 * Finally, groups and standalone cards are ordered together by their newest
 * report time so grouping never changes the global "newest first" contract.
 */
export function buildReportListEntries<T extends {
  id?: string | null;
  task_id?: string | null;
  product_model?: string | null;
  project_type?: string | null;
  created_at?: string | null;
}>(reports: T[]): Array<ReportListEntry<T>> {
  const groupsByModel = new Map<string, T[]>();
  const candidates = new Set<T>();

  for (const report of reports) {
    const model = getReportMergeModel(report.product_model);
    if (!model || !isMergeableReportProjectType(report.project_type)) continue;
    candidates.add(report);
    const group = groupsByModel.get(model) || [];
    group.push(report);
    groupsByModel.set(model, group);
  }

  const groupedReportIds = new Set<T>();
  const entries: Array<ReportListEntry<T>> = [];

  for (const [model, modelReports] of groupsByModel) {
    const latestPerTask = sortReportsByCreatedAtDesc(pickLatestReportPerTask(modelReports));
    if (latestPerTask.length < 2) continue;

    for (const report of latestPerTask) groupedReportIds.add(report);
    entries.push({
      kind: 'group',
      sort_at: String(latestPerTask[0]?.created_at || ''),
      model,
      projectTypes: Array.from(new Set(latestPerTask
        .map((report) => normalizeReportProjectType(report.project_type))
        .filter(Boolean))),
      reports: latestPerTask,
    });
  }

  for (const report of reports) {
    if (groupedReportIds.has(report)) continue;
    if (candidates.has(report)) {
      const model = getReportMergeModel(report.product_model);
      const latestForModelAndTask = model
        ? pickLatestReportPerTask(groupsByModel.get(model) || []).some((latest) => latest === report)
        : true;
      if (!latestForModelAndTask) continue;
    }
    entries.push({ kind: 'report', sort_at: String(report.created_at || ''), report });
  }

  return [...entries].sort((a, b) => b.sort_at.localeCompare(a.sort_at));
}
