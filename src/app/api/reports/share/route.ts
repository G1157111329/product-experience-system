import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { randomBytes } from 'crypto';
import { canAccessReport, forbidden, isAuthResponse, requireUser } from '@/lib/server/auth';
import { writeSecurityAudit } from '@/lib/server/security-audit';
import {
  attachLatestSnapshotForComparisonReport,
  reportSnapshotErrorStatus,
} from '@/lib/server/report-snapshots';
import { buildFrozenReportResponse } from '@/lib/server/report-frozen-view';

type IssueRow = Record<string, unknown> & { id: string };
type ReportRow = Record<string, unknown> & {
  id: string;
  task_id: string;
  product_model: string | null;
  created_at: string;
  snapshot_id?: string | null;
  content?: { task?: Record<string, unknown> } | null;
};

async function buildPublicDetailModel(client: ReturnType<typeof getSupabaseClient>, report: ReportRow) {
  return buildFrozenReportResponse(client, report, { audience: 'share' });
}

function compatibilityReEvaluations(issues: Array<Record<string, unknown>>) {
  return Object.fromEntries(issues.map((issue) => [
    String(issue.id || ''),
    Array.isArray(issue._reEvaluations) ? issue._reEvaluations : [],
  ]));
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

  const siblingReports: ReportRow[] = [];
  const siblingIssuesMap: Record<string, IssueRow[]> = {};
  const siblingReEvaluationsMap: Record<string, unknown[]> = {};
  // A public token authorizes exactly the report recorded in report_shares.
  // Same-model reports can belong to a different task owner and must never be
  // inferred into the public response without an explicit share grant.

  await writeSecurityAudit(client, {
    request,
    action: 'report_share.view',
    outcome: 'success',
    targetType: 'report',
    targetId: String(report.id),
    metadata: { shareId: share.id },
  });

  try {
  const reportWithSnapshot = await attachLatestSnapshotForComparisonReport(client, report as Record<string, unknown>);
  const primaryFrozenResponse = await buildPublicDetailModel(client, reportWithSnapshot as ReportRow);
  const detailModel = primaryFrozenResponse.detailModel;
  const frozenViewModel = primaryFrozenResponse.model;
  const liveIssues = primaryFrozenResponse.issues.filter((issue) => (
    String(issue.source_report_id || '') === String(report.id)
  )) as IssueRow[];
  const reEvaluationsMap = compatibilityReEvaluations(liveIssues);
  const siblingDetailModels: Record<string, unknown> = {};
  const siblingFrozenViewModels: Record<string, unknown> = {};
  await Promise.all(siblingReports.map(async (sibling) => {
    const response = await buildPublicDetailModel(client, sibling);
    siblingDetailModels[sibling.id] = response.detailModel;
    siblingFrozenViewModels[sibling.id] = response.model;
    const siblingIssues = response.issues.filter((issue) => (
      String(issue.source_report_id || '') === String(sibling.id)
    )) as IssueRow[];
    siblingIssuesMap[sibling.id] = siblingIssues;
    Object.assign(siblingReEvaluationsMap, compatibilityReEvaluations(siblingIssues));
  }));

  return NextResponse.json({
    code: 0,
    message: 'success',
    data: {
      report: reportWithSnapshot,
      detailModel,
      frozenViewModel,
      liveIssues,
      reEvaluationsMap,
      siblingReports,
      mergedReportOrder: [String(report.id)],
      siblingDetailModels,
      siblingFrozenViewModels,
      siblingIssuesMap,
      siblingReEvaluationsMap,
      shareInfo: {
        expires_at: share.expires_at,
        created_at: share.created_at,
      },
    },
  });
  } catch (detailError) {
    return NextResponse.json({
      code: 1,
      message: detailError instanceof Error ? detailError.message : 'Report detail failed to load',
    }, { status: reportSnapshotErrorStatus(detailError) });
  }
}
