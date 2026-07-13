import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canReadReport, isAuthResponse, requireUser, type AuthUser } from '@/lib/server/auth';
import { writeSecurityAudit } from '@/lib/server/security-audit';
import { buildFrozenReportResponse } from '@/lib/server/report-frozen-view';
import {
  buildPrintReportViewModel,
  printReportMedia,
  renderPrintReportHtml,
  type PrintReportViewModel,
} from '@/lib/server/report-print-renderer';
import { buildReportFilename } from '@/lib/report-filename';

type Row = Record<string, unknown>;

async function verifyShareToken(client: ReturnType<typeof getSupabaseClient>, reportId: string, token: string) {
  const { data: share } = await client.from('report_shares').select('*').eq('share_token', token).maybeSingle();
  if (!share || share.report_id !== reportId) return false;
  if (share.expires_at && new Date(String(share.expires_at)) < new Date()) return false;
  return true;
}

async function loadReport(client: ReturnType<typeof getSupabaseClient>, reportId: string) {
  const { data: report, error } = await client.from('reports').select('*').eq('id', reportId).maybeSingle();
  if (error || !report) return { response: NextResponse.json({ code: 1, message: 'Report not found' }, { status: 404 }) };
  return { report: report as Row };
}

async function resolveAuthorizedReport(
  request: NextRequest,
  client: ReturnType<typeof getSupabaseClient>,
  reportId: string,
): Promise<{ report?: Row; user?: AuthUser; response?: NextResponse }> {
  const shareToken = request.nextUrl.searchParams.get('share_token');
  if (shareToken) {
    if (!(await verifyShareToken(client, reportId, shareToken))) {
      return { response: NextResponse.json({ code: 1, message: 'Invalid or expired share token' }, { status: 403 }) };
    }
    return loadReport(client, reportId);
  }
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return { response: user };
  if (!(await canReadReport(client, user, reportId))) {
    return { response: NextResponse.json({ code: 1, message: 'Forbidden' }, { status: 403 }) };
  }
  const result = await loadReport(client, reportId);
  return result.response ? result : { ...result, user };
}

async function createPdfJob(
  client: ReturnType<typeof getSupabaseClient>,
  reportId: string,
  snapshot: Row | null,
  layoutProfile: string,
  preflight: unknown,
  user?: AuthUser,
) {
  if (!snapshot?.id) return null;
  const { data } = await client.from('pdf_generation_jobs').insert({
    report_id: reportId,
    snapshot_id: snapshot.id,
    layout_profile: layoutProfile,
    status: 'rendering',
    preflight_result: preflight,
    created_by: user?.id || null,
    started_at: new Date().toISOString(),
  }).select().single();
  return data as Row | null;
}

async function presignPrintReportMediaUrls(
  printModel: PrintReportViewModel,
  options: { absoluteBaseUrl: string; concurrency?: number },
) {
  const { generatePresignedUrl } = await import('@/lib/server/storage');
  const concurrency = Math.max(1, Math.min(12, options.concurrency ?? 6));
  const byUrl = new Map<string, ReturnType<typeof printReportMedia>>();
  for (const item of printReportMedia(printModel)) {
    if (item.type.toLowerCase().includes('video') || !item.url || item.url.startsWith('http') || item.url.startsWith('data:')) continue;
    byUrl.set(item.url, [...(byUrl.get(item.url) ?? []), item]);
  }
  const entries = [...byUrl.entries()];
  for (let offset = 0; offset < entries.length; offset += concurrency) {
    await Promise.all(entries.slice(offset, offset + concurrency).map(async ([sourceUrl, items]) => {
      try {
        const signedUrl = await generatePresignedUrl({ key: sourceUrl, expireTime: 30 * 60, absoluteUrl: true });
        const parsed = new URL(signedUrl);
        const resolved = `${options.absoluteBaseUrl.replace(/\/+$/, '')}${parsed.pathname}${parsed.search}`;
        for (const item of items) item.url = resolved;
      } catch (error) {
        console.error('[report-pdf] presign failed for media url:', sourceUrl, error);
      }
    }));
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = getSupabaseClient();
  const { id: reportId } = await params;
  const access = await resolveAuthorizedReport(request, client, reportId);
  if (access.response) return access.response;
  const report = access.report!;
  const frozen = await buildFrozenReportResponse(client, report, { audience: access.user ? 'internal' : 'share' });
  const printModel = buildPrintReportViewModel(frozen.model);
  const delivery = frozen.detailModel.printDelivery;
  const snapshot = frozen.snapshot;

  if (request.nextUrl.searchParams.get('preflight') === '1') {
    return NextResponse.json({ code: 0, message: 'success', data: { ...delivery, page: printModel.page } });
  }
  if (!delivery.preflight.ok) {
    return NextResponse.json({ code: 1, message: 'PDF导出预检未通过', data: delivery }, { status: 400 });
  }

  const job = await createPdfJob(client, reportId, snapshot, delivery.profile.id, delivery.preflight, access.user);
  let browser: Awaited<ReturnType<(typeof import('playwright'))['chromium']['launch']>> | null = null;
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage({
      viewport: printModel.page.orientation === 'landscape' ? { width: 1600, height: 1100 } : { width: 900, height: 1200 },
    });
    await page.emulateMedia({ media: 'print' });
    const internalMediaBaseUrl = `http://127.0.0.1:${process.env.PORT || '5000'}`;
    await presignPrintReportMediaUrls(printModel, { absoluteBaseUrl: internalMediaBaseUrl });
    await page.setContent(renderPrintReportHtml(printModel, new Date()), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete), undefined, { timeout: 30_000 }).catch(() => undefined);
    const pdfBuffer = await page.pdf({
      format: printModel.page.paper,
      landscape: printModel.page.orientation === 'landscape',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    await browser.close();
    browser = null;

    if (job?.id) {
      await client.from('pdf_generation_jobs').update({ status: 'completed', file_size: pdfBuffer.length, finished_at: new Date().toISOString() }).eq('id', job.id);
    }
    await writeSecurityAudit(client, {
      request, actor: access.user, action: 'report.pdf.download', outcome: 'success', targetType: 'report', targetId: reportId,
      metadata: { profile: delivery.profile.id, snapshotId: snapshot?.id || null, jobId: job?.id || null },
    });
    const filename = buildReportFilename(report.title);
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="report.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'no-store',
        ...(job?.id ? { 'X-PDF-Job-Id': String(job.id) } : {}),
        'X-PDF-Profile': delivery.profile.id,
      },
    });
  } catch (error) {
    await browser?.close().catch(() => undefined);
    const message = error instanceof Error ? error.message : 'PDF render failed';
    if (job?.id) {
      await client.from('pdf_generation_jobs').update({ status: 'failed', error_message: message.slice(0, 1000), finished_at: new Date().toISOString() }).eq('id', job.id);
    }
    await writeSecurityAudit(client, {
      request, actor: access.user, action: 'report.pdf.download', outcome: 'failed', targetType: 'report', targetId: reportId,
      metadata: { profile: delivery.profile.id, snapshotId: snapshot?.id || null, jobId: job?.id || null, reason: message.slice(0, 200) },
    });
    return NextResponse.json({ code: 1, message }, { status: 500 });
  }
}
