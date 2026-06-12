import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { randomBytes } from 'crypto';
import { canAccessReport, forbidden, isAuthResponse, requireUser } from '@/lib/server/auth';
import { writeSecurityAudit } from '@/lib/server/security-audit';

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
  const liveIssues = rawIssues || [];

  const reEvaluationsMap: Record<string, unknown[]> = {};
  if (liveIssues.length > 0) {
    const issueIds = liveIssues.map((i: { id: string }) => i.id);
    const { data: reEvals } = await client.from('issue_re_evaluations').select('*').in('issue_id', issueIds).order('created_at', { ascending: false });
    if (reEvals) {
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

  return NextResponse.json({
    code: 0,
    message: 'success',
    data: {
      report,
      liveIssues,
      reEvaluationsMap,
      siblingReports: [],
      siblingIssuesMap: {},
      siblingReEvaluationsMap: {},
      shareInfo: {
        expires_at: share.expires_at,
        created_at: share.created_at,
      },
    },
  });
}
