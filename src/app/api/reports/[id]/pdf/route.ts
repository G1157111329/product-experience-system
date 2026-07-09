import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canReadReport, isAuthResponse, requireUser, type AuthUser } from '@/lib/server/auth';
import { writeSecurityAudit } from '@/lib/server/security-audit';
import { buildReportDetailModel, presignReportMediaUrls } from '@/lib/server/report-detail';
import { renderReportDetailPdfHtml } from '@/lib/server/report-print-renderer';
import { loadLatestReportSnapshot } from '@/lib/server/report-snapshots';

type Row = Record<string, unknown>;

function safeFilename(value: unknown) {
  const base = String(value || 'report')
    .replace(/[\\/:*?"<>|\r\n\t]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120);
  return base || 'report';
}

async function selectRows(
  query: PromiseLike<{ data: Row[] | null; error?: { message?: string } | null }>,
  message: string,
) {
  const { data, error } = await query;
  if (error) throw new Error(error.message || message);
  return Array.isArray(data) ? data : [];
}

async function verifyShareToken(client: ReturnType<typeof getSupabaseClient>, reportId: string, token: string) {
  const { data: share } = await client
    .from('report_shares')
    .select('*')
    .eq('share_token', token)
    .maybeSingle();
  if (!share || share.report_id !== reportId) return false;
  if (share.expires_at && new Date(String(share.expires_at)) < new Date()) return false;
  return true;
}

async function loadReport(client: ReturnType<typeof getSupabaseClient>, reportId: string) {
  const { data: report, error } = await client.from('reports').select('*').eq('id', reportId).maybeSingle();
  if (error || !report) {
    return { response: NextResponse.json({ code: 1, message: 'Report not found' }, { status: 404 }) };
  }
  return { report: report as Row };
}

async function resolveAuthorizedReport(
  request: NextRequest,
  client: ReturnType<typeof getSupabaseClient>,
  reportId: string,
): Promise<{ report?: Row; user?: AuthUser; response?: NextResponse }> {
  const shareToken = request.nextUrl.searchParams.get('share_token');
  if (shareToken) {
    const allowed = await verifyShareToken(client, reportId, shareToken);
    if (!allowed) return { response: NextResponse.json({ code: 1, message: 'Invalid or expired share token' }, { status: 403 }) };
    return loadReport(client, reportId);
  }

  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return { response: user };
  if (!(await canReadReport(client, user, reportId))) {
    return { response: NextResponse.json({ code: 1, message: 'Forbidden' }, { status: 403 }) };
  }
  const result = await loadReport(client, reportId);
  if (result.response) return result;
  return { ...result, user };
}

async function attachReEvaluations(client: ReturnType<typeof getSupabaseClient>, issues: Row[]) {
  if (issues.length === 0) return issues;
  const issueIds = [...new Set(issues.map((issue) => String(issue.id || '')).filter(Boolean))];
  if (issueIds.length === 0) return issues;

  const reEvaluations = await selectRows(
    client.from('issue_re_evaluations').select('*').in('issue_id', issueIds).order('created_at', { ascending: false }) as unknown as PromiseLike<{ data: Row[] | null; error?: { message?: string } | null }>,
    'Failed to load issue re-evaluations',
  );
  const reEvaluationIds = reEvaluations.map((item) => String(item.id || '')).filter(Boolean);
  const reEvaluationMaterials = reEvaluationIds.length
    ? await selectRows(
      client.from('materials').select('*').in('re_evaluation_id', reEvaluationIds) as unknown as PromiseLike<{ data: Row[] | null; error?: { message?: string } | null }>,
      'Failed to load re-evaluation materials',
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

async function buildDetailForReport(client: ReturnType<typeof getSupabaseClient>, report: Row) {
  const reportId = String(report.id || '');
  const reportTaskId = String(report.task_id || '');
  const snapshot = await loadLatestReportSnapshot(client, reportId);
  const [sourceReportIssues, taskIssues, materials, pdfJobs] = await Promise.all([
    selectRows(
      client.from('issues').select('*').eq('source_report_id', reportId) as unknown as PromiseLike<{ data: Row[] | null; error?: { message?: string } | null }>,
      'Failed to load report issues',
    ),
    reportTaskId
      ? selectRows(
        client.from('issues').select('*').eq('task_id', reportTaskId) as unknown as PromiseLike<{ data: Row[] | null; error?: { message?: string } | null }>,
        'Failed to load task issues',
      )
      : Promise.resolve([]),
    reportTaskId
      ? selectRows(
        client.from('materials').select('*').eq('task_id', reportTaskId).order('media_display_order', { ascending: true }) as unknown as PromiseLike<{ data: Row[] | null; error?: { message?: string } | null }>,
        'Failed to load materials',
      )
      : Promise.resolve([]),
    selectRows(
      client.from('pdf_generation_jobs').select('*').eq('report_id', reportId).order('created_at', { ascending: false }) as unknown as PromiseLike<{ data: Row[] | null; error?: { message?: string } | null }>,
      'Failed to load PDF jobs',
    ),
  ]);
  const issueMap = new Map([...sourceReportIssues, ...taskIssues].map((issue) => [String(issue.id || ''), issue]));
  const issuesWithReEvaluations = await attachReEvaluations(client, Array.from(issueMap.values()));
  return {
    snapshot: snapshot as Row | null,
    detail: buildReportDetailModel({
      report,
      snapshot,
      issues: issuesWithReEvaluations,
      materials,
      pdfJobs,
    }),
  };
}

async function createPdfJob(client: ReturnType<typeof getSupabaseClient>, reportId: string, snapshot: Row | null, layoutProfile: string, preflight: unknown, user?: AuthUser) {
  if (!snapshot?.id) return null;
  const { data } = await client
    .from('pdf_generation_jobs')
    .insert({
      report_id: reportId,
      snapshot_id: snapshot.id,
      layout_profile: layoutProfile,
      status: 'rendering',
      preflight_result: preflight,
      created_by: user?.id || null,
      started_at: new Date().toISOString(),
    })
    .select()
    .single();
  return data as Row | null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = getSupabaseClient();
  const { id: reportId } = await params;
  const access = await resolveAuthorizedReport(request, client, reportId);
  if (access.response) return access.response;
  const report = access.report!;
  const { snapshot, detail } = await buildDetailForReport(client, report);
  const delivery = detail.printDelivery;

  if (request.nextUrl.searchParams.get('preflight') === '1') {
    return NextResponse.json({ code: 0, message: 'success', data: delivery });
  }
  if (!delivery.preflight.ok) {
    return NextResponse.json({ code: 1, message: 'PDF导出预检未通过', data: delivery }, { status: 400 });
  }

  const job = await createPdfJob(client, reportId, snapshot, delivery.profile.id, delivery.preflight, access.user);
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage({
      viewport: delivery.profile.paper === 'A3'
        ? { width: 1600, height: 1100 }
        : { width: 900, height: 1200 },
    });
    await page.emulateMedia({ media: 'print' });
    // Server-side PDF render has no /api/materials/presign to call, so resolve
    // storage keys to absolute URLs now. Gray-release aware (local-then-S3).
    const internalMediaBaseUrl = `http://127.0.0.1:${process.env.PORT || '5000'}`;
    await presignReportMediaUrls(detail, { absoluteBaseUrl: internalMediaBaseUrl });
    await page.setContent(renderReportDetailPdfHtml(detail, new Date()), { waitUntil: 'domcontentloaded' });
    // Video metadata requests can keep the page globally "busy" even after every
    // printable image is ready. Wait only for images, with a bounded fallback so
    // one unavailable asset cannot block the whole report.
    await page.waitForFunction(
      () => Array.from(document.images).every((image) => image.complete),
      undefined,
      { timeout: 30_000 },
    ).catch(() => undefined);
    const pdfBuffer = await page.pdf({
      format: delivery.profile.paper,
      landscape: delivery.profile.orientation === 'landscape',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    await browser.close();

    if (job?.id) {
      await client
        .from('pdf_generation_jobs')
        .update({ status: 'completed', file_size: pdfBuffer.length, finished_at: new Date().toISOString() })
        .eq('id', job.id);
    }

    await writeSecurityAudit(client, {
      request,
      actor: access.user,
      action: 'report.pdf.download',
      outcome: 'success',
      targetType: 'report',
      targetId: reportId,
      metadata: { profile: delivery.profile.id, snapshotId: snapshot?.id || null, jobId: job?.id || null },
    });

    const filename = `${safeFilename(report.title)}.pdf`;
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'no-store',
        ...(job?.id ? { 'X-PDF-Job-Id': String(job.id) } : {}),
        'X-PDF-Profile': delivery.profile.id,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PDF render failed';
    if (job?.id) {
      await client
        .from('pdf_generation_jobs')
        .update({ status: 'failed', error_message: message.slice(0, 1000), finished_at: new Date().toISOString() })
        .eq('id', job.id);
    }
    await writeSecurityAudit(client, {
      request,
      actor: access.user,
      action: 'report.pdf.download',
      outcome: 'failed',
      targetType: 'report',
      targetId: reportId,
      metadata: { profile: delivery.profile.id, snapshotId: snapshot?.id || null, jobId: job?.id || null, reason: message.slice(0, 200) },
    });
    return NextResponse.json({ code: 1, message }, { status: 500 });
  }
}
