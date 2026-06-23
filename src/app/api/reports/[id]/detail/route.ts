import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canReadReport, forbidden, isAuthResponse, requireUser } from '@/lib/server/auth';
import { loadLatestReportSnapshot } from '@/lib/server/report-snapshots';
import { buildReportDetailModel } from '@/lib/server/report-detail';

type Row = Record<string, unknown>;

async function selectRows(
  query: PromiseLike<{ data: Row[] | null; error?: { message?: string } | null }>,
  message: string,
) {
  const { data, error } = await query;
  if (error) throw new Error(error.message || message);
  return Array.isArray(data) ? data : [];
}

async function attachReEvaluations(client: ReturnType<typeof getSupabaseClient>, issues: Row[]) {
  if (issues.length === 0) return issues;
  const issueIds = [...new Set(issues.map((issue) => String(issue.id || '')).filter(Boolean))];
  if (issueIds.length === 0) return issues;

  const reEvaluations = await selectRows(
    client.from('issue_re_evaluations').select('*').in('issue_id', issueIds).order('created_at', { ascending: false }) as unknown as PromiseLike<{ data: Row[] | null; error?: { message?: string } | null }>,
    '加载复评估失败',
  );
  const reEvaluationIds = reEvaluations.map((item) => String(item.id || '')).filter(Boolean);
  const reEvaluationMaterials = reEvaluationIds.length
    ? await selectRows(
      client.from('materials').select('*').in('re_evaluation_id', reEvaluationIds) as unknown as PromiseLike<{ data: Row[] | null; error?: { message?: string } | null }>,
      '加载复评估素材失败',
    )
    : [];

  const materialsByReEvaluation = new Map<string, Row[]>();
  for (const material of reEvaluationMaterials) {
    const key = String(material.re_evaluation_id || '');
    if (!materialsByReEvaluation.has(key)) materialsByReEvaluation.set(key, []);
    materialsByReEvaluation.get(key)?.push(material);
  }

  const reEvaluationsByIssue = new Map<string, Row[]>();
  for (const item of reEvaluations) {
    const key = String(item.issue_id || '');
    if (!reEvaluationsByIssue.has(key)) reEvaluationsByIssue.set(key, []);
    reEvaluationsByIssue.get(key)?.push({
      ...item,
      materials: materialsByReEvaluation.get(String(item.id || '')) || [],
    });
  }

  return issues.map((issue) => ({
    ...issue,
    _reEvaluations: reEvaluationsByIssue.get(String(issue.id || '')) || [],
  }));
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  if (!(await canReadReport(client, user, id))) return forbidden();

  const { data: report, error } = await client.from('reports').select('*').eq('id', id).single();
  if (error || !report) return NextResponse.json({ code: 1, message: '报告不存在' }, { status: 404 });

  try {
    const snapshot = await loadLatestReportSnapshot(client, id);
    const reportRow = report as Row;
    const reportTaskId = String(reportRow.task_id || '');
    const [
      sourceReportIssues,
      taskIssues,
      materials,
      pdfJobs,
    ] = await Promise.all([
      selectRows(
        client.from('issues').select('*').eq('source_report_id', id) as unknown as PromiseLike<{ data: Row[] | null; error?: { message?: string } | null }>,
        '加载报告问题失败',
      ),
      reportTaskId
        ? selectRows(
          client.from('issues').select('*').eq('task_id', reportTaskId) as unknown as PromiseLike<{ data: Row[] | null; error?: { message?: string } | null }>,
          '加载任务问题失败',
        )
        : Promise.resolve([]),
      reportTaskId
        ? selectRows(
          client.from('materials').select('*').eq('task_id', reportTaskId).order('media_display_order', { ascending: true }) as unknown as PromiseLike<{ data: Row[] | null; error?: { message?: string } | null }>,
          '加载素材失败',
        )
        : Promise.resolve([]),
      selectRows(
        client.from('pdf_generation_jobs').select('*').eq('report_id', id).order('created_at', { ascending: false }) as unknown as PromiseLike<{ data: Row[] | null; error?: { message?: string } | null }>,
        '加载 PDF 任务失败',
      ),
    ]);

    const issueMap = new Map([...sourceReportIssues, ...taskIssues].map((issue) => [String(issue.id || ''), issue]));
    const issuesWithReEvaluations = await attachReEvaluations(client, Array.from(issueMap.values()));
    const detail = buildReportDetailModel({
      report: reportRow,
      snapshot,
      issues: issuesWithReEvaluations,
      materials,
      pdfJobs,
    });

    return NextResponse.json({ code: 0, message: 'success', data: detail });
  } catch (detailError) {
    return NextResponse.json({
      code: 1,
      message: detailError instanceof Error ? detailError.message : '报告详情加载失败',
    }, { status: 500 });
  }
}
