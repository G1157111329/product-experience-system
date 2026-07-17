import { buildFrozenReportViewModel, type FrozenIssue } from './report-frozen-view';

type Row = Record<string, unknown>;

export type IssueManagementRow = Row & {
  id: string;
  task_id: string;
  title: string;
  status: string;
  source_kind: FrozenIssue['sourceKind'];
};

type IssueManagementInput = {
  issues: Row[];
  reports: Row[];
  snapshots: Row[];
};

function text(value: unknown, fallback = ''): string {
  const result = value === null || value === undefined ? '' : String(value).trim();
  return result || fallback;
}

function normalizedText(value: unknown): string {
  return text(value).normalize('NFKC').replace(/\s+/g, ' ').toLocaleLowerCase();
}

function timestamp(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function sourceKind(issue: Row): FrozenIssue['sourceKind'] {
  const type = text(issue.source_type);
  if (type === 'matrix_problem' || type === 'matrix_issue') return 'matrix';
  if (text(issue.source_cell_id) || text(issue.sourceCellId) || text(issue.source_assembly_id)) return 'comparison';
  if (type === 'record_fail' || type === 'sensory_problem') return 'sensory';
  return 'function';
}

function canonicalKey(issue: Row): string {
  const taskId = text(issue.task_id);
  const cellId = text(issue.source_cell_id || issue.sourceCellId);
  if (cellId) return `comparison:${taskId}:${cellId}`;
  const recordId = text(issue.record_id);
  if (recordId) return `sensory:${taskId}:${recordId}`;
  const recipeId = text(issue.recipe_id);
  if (recipeId) return `function:${taskId}:${recipeId}:${normalizedText(issue.title)}`;
  return `issue:${taskId}:${text(issue.id)}`;
}

function preferIssue(left: Row, right: Row): Row {
  const leftIsLive = !text(left.source_report_id);
  const rightIsLive = !text(right.source_report_id);
  if (leftIsLive !== rightIsLive) return rightIsLive ? right : left;
  const leftUpdated = text(left.updated_at || left.created_at);
  const rightUpdated = text(right.updated_at || right.created_at);
  return rightUpdated > leftUpdated ? right : left;
}

function dedupeLiveIssues(issues: Row[]): IssueManagementRow[] {
  const byKey = new Map<string, Row>();
  for (const issue of issues) {
    const key = canonicalKey(issue);
    const previous = byKey.get(key);
    byKey.set(key, previous ? preferIssue(previous, issue) : issue);
  }
  return Array.from(byKey.values()).map((issue) => ({
    ...issue,
    id: text(issue.id),
    task_id: text(issue.task_id),
    title: text(issue.title),
    status: text(issue.status, 'open'),
    source_kind: sourceKind(issue),
  }));
}

function issueManagementRow(
  issue: FrozenIssue,
  liveIssuesById: Map<string, Row>,
  report: Row,
): IssueManagementRow {
  const live = liveIssuesById.get(text(issue.liveIssueId));
  return {
    ...(live ?? {}),
    id: text(live?.id || issue.liveIssueId || issue.id),
    task_id: text(live?.task_id || report.task_id),
    title: issue.title,
    description: issue.details,
    source_type: issue.sourceType,
    source_kind: issue.sourceKind,
    source_cell_id: issue.sourceCellId || text(live?.source_cell_id) || null,
    source_report_id: text(report.id) || null,
    source: text(report.title, '冻结报告问题'),
    status: text(issue.liveOverlay.status || live?.status, 'open'),
    improve_plan: text(live?.improve_plan || issue.liveOverlay.rectification) || null,
    level: issue.level || text(live?.level, '二类'),
    created_at: text(live?.created_at || issue.createdAt || report.created_at),
    can_manage: issue.canManage,
  };
}

/**
 * Produces the same source-level issue set used by a task's latest frozen
 * report.  This keeps problem management, the frozen reader, and print/PDF
 * counts aligned while preserving unsaved-task visibility through source-key
 * deduplication.
 */
export function buildIssueManagementRows(input: IssueManagementInput): IssueManagementRow[] {
  const issuesByTask = new Map<string, Row[]>();
  for (const issue of input.issues) {
    const taskId = text(issue.task_id);
    if (!taskId) continue;
    const rows = issuesByTask.get(taskId) ?? [];
    rows.push(issue);
    issuesByTask.set(taskId, rows);
  }

  const latestReportByTask = new Map<string, Row>();
  for (const report of input.reports) {
    const taskId = text(report.task_id);
    if (!taskId || !issuesByTask.has(taskId)) continue;
    const previous = latestReportByTask.get(taskId);
    if (!previous || timestamp(report.created_at) > timestamp(previous.created_at)) latestReportByTask.set(taskId, report);
  }
  const snapshotsById = new Map(input.snapshots.map((snapshot) => [text(snapshot.id), snapshot]));

  const result: IssueManagementRow[] = [];
  for (const [taskId, taskIssues] of issuesByTask) {
    const report = latestReportByTask.get(taskId);
    if (!report) {
      result.push(...dedupeLiveIssues(taskIssues));
      continue;
    }
    const snapshot = snapshotsById.get(text(report.snapshot_id));
    const liveIssuesById = new Map(taskIssues.map((issue) => [text(issue.id), issue]));
    const frozen = buildFrozenReportViewModel({
      report,
      snapshot: snapshot ?? null,
      issues: taskIssues,
      snapshotResolution: snapshot ? 'anchored' : 'legacy_latest',
    }, {
      audience: 'internal',
      manageableIssueIds: new Set(liveIssuesById.keys()),
    });
    result.push(...frozen.issues.map((issue) => issueManagementRow(issue, liveIssuesById, report)));
  }
  return result;
}
