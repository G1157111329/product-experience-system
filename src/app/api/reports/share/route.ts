import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { randomBytes } from 'crypto';
import { canAccessReport, forbidden, isAuthResponse, requireUser } from '@/lib/server/auth';
import { writeSecurityAudit } from '@/lib/server/security-audit';
import {
  getReportMergeModel,
  isMergeableReportProjectType,
  pickLatestReportPerTask,
  sortReportsByCreatedAtAsc,
} from '@/lib/report-merge';
import { attachLatestSnapshotForComparisonReport } from '@/lib/server/report-snapshots';
import { loadLatestReportSnapshot } from '@/lib/server/report-snapshots';
import { buildReportDetailModel } from '@/lib/server/report-detail';

type IssueRow = Record<string, unknown> & { id: string };
type ReportRow = Record<string, unknown> & {
  id: string;
  task_id: string;
  product_model: string | null;
  created_at: string;
  content?: { task?: Record<string, unknown> } | null;
};

async function loadRows(
  query: PromiseLike<{ data: Array<Record<string, unknown>> | null; error?: { message?: string } | null }>,
) {
  const { data } = await query;
  return Array.isArray(data) ? data : [];
}

async function buildPublicDetailModel(client: ReturnType<typeof getSupabaseClient>, report: ReportRow) {
  const reportId = String(report.id || '');
  const taskId = String(report.task_id || '');
  const [snapshot, sourceIssues, taskIssues, materials, pdfJobs] = await Promise.all([
    reportId ? loadLatestReportSnapshot(client, reportId) : Promise.resolve(null),
    reportId
      ? loadRows(client.from('issues').select('*').eq('source_report_id', reportId) as unknown as PromiseLike<{ data: Array<Record<string, unknown>> | null }>)
      : Promise.resolve([]),
    taskId
      ? loadRows(client.from('issues').select('*').eq('task_id', taskId) as unknown as PromiseLike<{ data: Array<Record<string, unknown>> | null }>)
      : Promise.resolve([]),
    taskId
      ? loadRows(client.from('materials').select('*').eq('task_id', taskId).order('media_display_order', { ascending: true }) as unknown as PromiseLike<{ data: Array<Record<string, unknown>> | null }>)
      : Promise.resolve([]),
    reportId
      ? loadRows(client.from('pdf_generation_jobs').select('*').eq('report_id', reportId).order('created_at', { ascending: false }) as unknown as PromiseLike<{ data: Array<Record<string, unknown>> | null }>)
      : Promise.resolve([]),
  ]);

  const issueMap = new Map([...sourceIssues, ...taskIssues].map((issue) => [String(issue.id || ''), issue]));
  const issueRows = Array.from(issueMap.values()) as IssueRow[];
  const reEvaluationsMap = await loadReEvaluationsMap(client, issueRows);
  const issuesWithReEvaluations = issueRows.map((issue) => ({
    ...issue,
    _reEvaluations: reEvaluationsMap[issue.id] || [],
  }));
  return buildReportDetailModel({
    report,
    snapshot,
    issues: issuesWithReEvaluations,
    materials,
    pdfJobs,
  });
}

async function loadReEvaluationsMap(client: ReturnType<typeof getSupabaseClient>, issues: IssueRow[]) {
  const reEvaluationsMap: Record<string, unknown[]> = {};
  if (issues.length === 0) return reEvaluationsMap;

  const issueIds = issues.map((i) => i.id);
  const { data: reEvals } = await client
    .from('issue_re_evaluations')
    .select('*')
    .in('issue_id', issueIds)
    .order('created_at', { ascending: false });

  if (!reEvals) return reEvaluationsMap;

  const reEvalIds = reEvals.map((re: { id: string }) => re.id);
  const { data: reEvalMats } = reEvalIds.length > 0
    ? await client.from('materials').select('*').in('re_evaluation_id', reEvalIds)
    : { data: [] };
  const matsByReEvalId: Record<string, unknown[]> = {};
  for (const m of (reEvalMats || []) as Array<Record<string, unknown>>) {
    const rid = m.re_evaluation_id as string;
    if (!matsByReEvalId[rid]) matsByReEvalId[rid] = [];
    matsByReEvalId[rid].push(m);
  }
  for (const re of reEvals) {
    const iid = re.issue_id as string;
    if (!reEvaluationsMap[iid]) reEvaluationsMap[iid] = [];
    reEvaluationsMap[iid].push({ ...re, materials: matsByReEvalId[re.id as string] || [] });
  }

  return reEvaluationsMap;
}

export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const body = await request.json();
  const { report_id, duration } = body;

  if (!report_id) {
    return NextResponse.json({ code: 1, message: '缺少报告ID' }, { status: 400 });
  }
  if (!(await canAccessReport(client, user, report_id))) return forbidden();

  const { data: report } = await client.from('reports').select('id, title, product_model').eq('id', report_id).single();
  if (!report) {
    return NextResponse.json({ code: 1, message: '报告不存在' }, { status: 404 });
  }

  const shareToken = randomBytes(24).toString('hex');
  let expiresAt: string | null = null;
  if (duration === '7d') {
    expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  } else if (duration === '30d') {
    expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  }

  const { data, error } = await client.from('report_shares').insert({
    report_id,
    share_token: shareToken,
    expires_at: expiresAt,
    created_by: user.id,
  }).select().single();
  if (!error && data) {
    await writeSecurityAudit(client, {
      request,
      actor: user,
      action: 'report_share.create',
      outcome: 'success',
      targetType: 'report',
      targetId: report_id,
      metadata: { duration: duration || null, shareId: data.id },
    });
  }

  if (error) return NextResponse.json({ code: 1, message: '分享链接创建失败' }, { status: 500 });

  return NextResponse.json({ code: 0, message: '分享链接已创建', data });
}

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    return NextResponse.json({ code: 1, message: '缺少分享令牌' }, { status: 400 });
  }

  const { data: share, error: shareError } = await client.from('report_shares').select('*').eq('share_token', token).single();
  if (shareError || !share) {
    return NextResponse.json({ code: 1, message: '分享链接无效' }, { status: 404 });
  }

  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return NextResponse.json({ code: 1, message: '分享链接已过期' }, { status: 410 });
  }

  const { data: report, error: reportError } = await client.from('reports').select('*').eq('id', share.report_id).single();
  if (reportError || !report) {
    return NextResponse.json({ code: 1, message: '报告不存在' }, { status: 404 });
  }

  if (report.content?.task?.id || report.task_id) {
    const taskId = report.content?.task?.id || report.task_id;
    const { data: task } = await client.from('experience_tasks').select('*').eq('id', taskId).single();
    if (task && report.content) {
      report.content.task = task;
    }
  }

  const { data: rawIssues } = await client.from('issues').select('*').eq('source_report_id', report.id);
  const liveIssues = (rawIssues || []) as IssueRow[];
  const reEvaluationsMap = await loadReEvaluationsMap(client, liveIssues);

  const siblingReports: ReportRow[] = [];
  const siblingIssuesMap: Record<string, IssueRow[]> = {};
  let siblingReEvaluationsMap: Record<string, unknown[]> = {};
  const mergeModel = getReportMergeModel(report.product_model);
  const currentProjectType = report.content?.task?.project_type;
  if (mergeModel && isMergeableReportProjectType(currentProjectType)) {
    const { data: sameModelReports } = await client
      .from('reports')
      .select('*')
      .eq('product_model', report.product_model)
      .neq('status', 'archived');
    const candidates = ((sameModelReports || []) as ReportRow[]).filter((candidate) => (
      getReportMergeModel(candidate.product_model) === mergeModel
    ));
    const taskIds = [...new Set(candidates.map((candidate) => String(candidate.task_id || '')).filter(Boolean))];
    const { data: tasks } = taskIds.length > 0
      ? await client.from('experience_tasks').select('*').in('id', taskIds)
      : { data: [] };
    const taskMap = new Map<string, Record<string, unknown>>(
      (tasks || []).map((task: Record<string, unknown>) => [String(task.id), task]),
    );
    for (const candidate of candidates) {
      const task = taskMap.get(String(candidate.task_id || ''));
      if (task && candidate.content) candidate.content.task = task;
    }
    const mergeableCandidates = candidates.filter((candidate) => (
      isMergeableReportProjectType(
        taskMap.get(String(candidate.task_id || ''))?.project_type || candidate.content?.task?.project_type,
      )
    ));
    const latestByTask = pickLatestReportPerTask(mergeableCandidates);
    const currentIndex = latestByTask.findIndex((candidate) => candidate.task_id === report.task_id);
    if (currentIndex >= 0) latestByTask[currentIndex] = report as ReportRow;
    else latestByTask.push(report as ReportRow);
    siblingReports.push(...sortReportsByCreatedAtAsc(latestByTask).filter((candidate) => candidate.id !== report.id));

    if (siblingReports.length > 0) {
      const siblingReportIds = siblingReports.map((candidate) => candidate.id);
      const { data: siblingIssues } = await client.from('issues').select('*').in('source_report_id', siblingReportIds);
      const allSiblingIssues = (siblingIssues || []) as IssueRow[];
      for (const issue of allSiblingIssues) {
        const reportId = String(issue.source_report_id || '');
        if (!siblingIssuesMap[reportId]) siblingIssuesMap[reportId] = [];
        siblingIssuesMap[reportId].push(issue);
      }
      siblingReEvaluationsMap = await loadReEvaluationsMap(client, allSiblingIssues);
    }
  }

  await writeSecurityAudit(client, {
    request,
    action: 'report_share.view',
    outcome: 'success',
    targetType: 'report',
    targetId: String(report.id),
    metadata: { shareId: share.id },
  });

  const reportWithSnapshot = await attachLatestSnapshotForComparisonReport(client, report as Record<string, unknown>);
  const detailModel = await buildPublicDetailModel(client, reportWithSnapshot as ReportRow);
  const siblingDetailModels: Record<string, unknown> = {};
  await Promise.all(siblingReports.map(async (sibling) => {
    siblingDetailModels[sibling.id] = await buildPublicDetailModel(client, sibling);
  }));

  return NextResponse.json({
    code: 0,
    message: 'success',
    data: {
      report: reportWithSnapshot,
      detailModel,
      liveIssues,
      reEvaluationsMap,
      siblingReports,
      siblingDetailModels,
      siblingIssuesMap,
      siblingReEvaluationsMap,
      shareInfo: {
        expires_at: share.expires_at,
        created_at: share.created_at,
      },
    },
  });
}
