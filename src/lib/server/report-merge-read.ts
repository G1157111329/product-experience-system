import {
  getReportMergeModel,
  isMergeableReportProjectType,
  pickLatestReportPerTask,
  sortReportsByCreatedAtAsc,
} from '@/lib/report-merge';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { attachLatestSnapshotForComparisonReport } from './report-snapshots';
import { buildFrozenReportResponse } from './report-frozen-view';
import { canReadReport, type AuthUser } from './auth';

type Row = Record<string, unknown>;
type Audience = 'internal' | 'share';

export type MergedFrozenReportMember = {
  report: Row;
  model: Awaited<ReturnType<typeof buildFrozenReportResponse>>['model'];
  detailModel: Awaited<ReturnType<typeof buildFrozenReportResponse>>['detailModel'];
  issues: Row[];
};

export async function filterAuthorizedMergeCandidates<T extends { id?: unknown }>(
  candidates: T[],
  primaryReportId: string,
  canRead: (reportId: string) => Promise<boolean>,
): Promise<T[]> {
  const decisions = await Promise.all(candidates.map(async (report) => {
    const reportId = String(report.id || '');
    return reportId === primaryReportId || (reportId !== '' && await canRead(reportId));
  }));
  return candidates.filter((_, index) => decisions[index]);
}

export async function runAuthorizedReportMerge<T>(
  canReadPrimary: () => Promise<boolean>,
  load: () => Promise<T>,
): Promise<{ allowed: false } | { allowed: true; value: T }> {
  if (!(await canReadPrimary())) return { allowed: false };
  return { allowed: true, value: await load() };
}

/**
 * Reads a report's frozen merge set without rebuilding any member from live
 * task facts. ODM/OEM and other ineligible project types always return the
 * primary report alone.
 */
export async function loadMergedFrozenReportMembers(
  client: ReturnType<typeof getSupabaseClient>,
  primaryReport: Row,
  audience: Audience,
  actor?: AuthUser,
): Promise<MergedFrozenReportMember[]> {
  const primaryTaskId = String(primaryReport.task_id || '');
  const mergeModel = getReportMergeModel(primaryReport.product_model);
  const { data: primaryTask } = primaryTaskId
    ? await client.from('experience_tasks').select('project_type').eq('id', primaryTaskId).maybeSingle()
    : { data: null };

  let candidates: Row[] = [primaryReport];
  if (mergeModel && isMergeableReportProjectType(primaryTask?.project_type)) {
    const { data: sameModelReports } = await client
      .from('reports')
      .select('*')
      .eq('product_model', primaryReport.product_model)
      .neq('status', 'archived');
    const sameModel = ((sameModelReports || []) as Row[]).filter((report) => (
      getReportMergeModel(report.product_model) === mergeModel
    ));
    const taskIds = [...new Set(sameModel.map((report) => String(report.task_id || '')).filter(Boolean))];
    const { data: tasks } = taskIds.length > 0
      ? await client.from('experience_tasks').select('id, project_type').in('id', taskIds)
      : { data: [] };
    const projectTypeByTask = new Map((tasks || []).map((task: { id: string; project_type: unknown }) => [String(task.id), task.project_type]));
    const eligible = sameModel.filter((report) => isMergeableReportProjectType(projectTypeByTask.get(String(report.task_id || ''))));
    const latestByTask = pickLatestReportPerTask(eligible);
    const primaryIndex = latestByTask.findIndex((report) => String(report.task_id || '') === primaryTaskId);
    if (primaryIndex >= 0) latestByTask[primaryIndex] = primaryReport;
    else latestByTask.push(primaryReport);
    candidates = sortReportsByCreatedAtAsc(latestByTask);
  }

  if (audience === 'internal') {
    if (!actor) throw new Error('authenticated actor required for internal report merge');
    candidates = await filterAuthorizedMergeCandidates(
      candidates,
      String(primaryReport.id || ''),
      (reportId) => canReadReport(client, actor, reportId),
    );
  }

  return Promise.all(candidates.map(async (report) => {
    const withSnapshot = await attachLatestSnapshotForComparisonReport(client, report);
    const response = await buildFrozenReportResponse(client, withSnapshot, { audience, actor });
    return {
      report: withSnapshot,
      model: response.model,
      detailModel: response.detailModel,
      issues: response.issues as Row[],
    };
  }));
}
