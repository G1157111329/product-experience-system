import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { randomBytes } from 'crypto';

// POST: Create a share link
export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const body = await request.json();
  const { report_id, duration, created_by } = body;

  if (!report_id) {
    return NextResponse.json({ code: 1, message: '缺少报告ID' }, { status: 400 });
  }

  // Verify report exists
  const { data: report } = await client.from('reports').select('id, title, product_model').eq('id', report_id).single();
  if (!report) {
    return NextResponse.json({ code: 1, message: '报告不存在' }, { status: 404 });
  }

  // Generate a secure share token
  const shareToken = randomBytes(24).toString('hex');

  // Calculate expiration
  let expiresAt: string | null = null;
  if (duration === '7d') {
    expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  } else if (duration === '30d') {
    expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  }
  // 'permanent' means no expiration

  const { data, error } = await client.from('report_shares').insert({
    report_id,
    share_token: shareToken,
    expires_at: expiresAt,
    created_by: created_by || null,
  }).select().single();

  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });

  return NextResponse.json({ code: 0, message: '分享链接已创建', data });
}

// GET: Verify share token and return report
export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    return NextResponse.json({ code: 1, message: '缺少分享令牌' }, { status: 400 });
  }

  // Find the share record
  const { data: share, error: shareError } = await client.from('report_shares').select('*').eq('share_token', token).single();
  if (shareError || !share) {
    return NextResponse.json({ code: 1, message: '分享链接无效' }, { status: 404 });
  }

  // Check expiration
  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return NextResponse.json({ code: 1, message: '分享链接已过期' }, { status: 410 });
  }

  // Fetch the report with full content
  const { data: report, error: reportError } = await client.from('reports').select('*').eq('id', share.report_id).single();
  if (reportError || !report) {
    return NextResponse.json({ code: 1, message: '报告不存在' }, { status: 404 });
  }

  // Enrich with task info
  if (report.content?.task?.id || report.task_id) {
    const taskId = report.content?.task?.id || report.task_id;
    const { data: task } = await client.from('experience_tasks').select('*').eq('id', taskId).single();
    if (task && report.content) {
      report.content.task = task;
    }
  }

  // Fetch live issues for the report
  const { data: rawIssues } = await client.from('issues').select('*').eq('source_report_id', report.id);
  const liveIssues = rawIssues || [];

  // Fetch sibling reports for content merge (same logic as report detail page)
  let siblingReports: Record<string, unknown>[] = [];
  if (report.product_model) {
    const { data: allReports } = await client.from('reports').select('id, task_id, product_model, title, created_at, content').eq('product_model', report.product_model);
    if (allReports) {
      const projectType = (report.content?.task as Record<string, unknown>)?.project_type as string;
      if (projectType === '自研' || projectType === '改型/降本/优化') {
        const byTaskId: Record<string, Record<string, unknown>> = {};
        for (const r of allReports) {
          const existing = byTaskId[r.task_id as string];
          if (!existing || (r.created_at as string) > (existing.created_at as string)) {
            byTaskId[r.task_id as string] = r;
          }
        }
        byTaskId[report.task_id] = report;
        siblingReports = Object.values(byTaskId)
          .filter((r: Record<string, unknown>) => r.id !== report.id)
          .sort((a: Record<string, unknown>, b: Record<string, unknown>) => (a.created_at as string).localeCompare(b.created_at as string));
      }
    }
  }

  // Fetch issues for sibling reports
  const siblingIssuesMap: Record<string, unknown[]> = {};
  if (siblingReports.length > 0) {
    const siblingIds = siblingReports.map((r: Record<string, unknown>) => r.id as string);
    const { data: siblingIssues } = await client.from('issues').select('*').in('source_report_id', siblingIds);
    if (siblingIssues) {
      for (const issue of siblingIssues) {
        const rid = issue.source_report_id as string;
        if (!siblingIssuesMap[rid]) siblingIssuesMap[rid] = [];
        siblingIssuesMap[rid].push(issue);
      }
    }
  }

  return NextResponse.json({
    code: 0,
    message: 'success',
    data: {
      report,
      liveIssues,
      siblingReports,
      siblingIssuesMap,
      shareInfo: {
        expires_at: share.expires_at,
        created_at: share.created_at,
      },
    },
  });
}
