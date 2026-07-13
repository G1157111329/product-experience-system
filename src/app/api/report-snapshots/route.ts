import { NextRequest, NextResponse } from 'next/server';
import { canAccessAssembly, canAccessReport, canReadReport, forbidden, isAuthResponse, requireUser } from '@/lib/server/auth';
import { buildComparisonReportSnapshot } from '@/lib/server/comparison-assembly';
import { hasPermission, Permission } from '@/lib/server/rbac';
import {
  IdempotencyConflictError,
  IdempotencySupersededError,
  persistExistingReportSnapshotAtomic,
  serializeReportSnapshotDto,
} from '@/lib/server/report-snapshot-persistence';
import {
  loadAnchoredReportSnapshot,
  loadNextReportSnapshotVersion,
  persistAnchoredReportSnapshot,
} from '@/lib/server/report-snapshots';
import { getSupabaseClient } from '@/storage/database/supabase-client';

type SnapshotData = {
  report_type: string;
  layout_profile: string;
  primary_task_id: string;
  source_task_ids: string[];
  source_report_ids: string[];
  assembly?: { id?: string; name?: string } & Record<string, unknown>;
};

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const id = request.nextUrl.searchParams.get('id');
  const reportId = request.nextUrl.searchParams.get('report_id');
  if (!id && !reportId) {
    return NextResponse.json({ code: 1, message: '请提供 id 或 report_id' }, { status: 400 });
  }

  if (id) {
    const { data, error } = await client.from('report_snapshots').select('*').eq('id', id).maybeSingle();
    if (error) return NextResponse.json({ code: 1, message: error.message || '读取快照失败' }, { status: 500 });
    if (!data) return NextResponse.json({ code: 1, message: '快照不存在' }, { status: 404 });
    if (!(await canReadReport(client, user, String(data.report_id || '')))) return forbidden();
    return NextResponse.json({ code: 0, message: 'success', data });
  }

  const { data: report, error: reportError } = await client
    .from('reports')
    .select('id, snapshot_id')
    .eq('id', reportId!)
    .maybeSingle();
  if (reportError) return NextResponse.json({ code: 1, message: reportError.message || '读取报告失败' }, { status: 500 });
  if (!report) return NextResponse.json({ code: 1, message: '报告不存在' }, { status: 404 });
  if (!(await canReadReport(client, user, String(report.id || '')))) return forbidden();

  try {
    const { snapshot } = await loadAnchoredReportSnapshot(client, report);
    if (!snapshot) return NextResponse.json({ code: 1, message: '快照不存在' }, { status: 404 });
    return NextResponse.json({ code: 0, message: 'success', data: snapshot });
  } catch (error) {
    return NextResponse.json({
      code: 1,
      message: error instanceof Error ? error.message : '读取快照失败',
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const body = await request.json().catch(() => ({}));
  const reportType = body.report_type || 'comparison_report';
  const assemblyId = typeof body.assembly_id === 'string' ? body.assembly_id : '';
  if (reportType !== 'comparison_report') {
    return NextResponse.json({ code: 1, message: 'T5a 当前仅支持 comparison_report' }, { status: 400 });
  }
  if (!assemblyId) {
    return NextResponse.json({ code: 1, message: '请提供 assembly_id' }, { status: 400 });
  }
  if (!(await canAccessAssembly(client, user, assemblyId))) return forbidden();

  let snapshot: SnapshotData;
  try {
    snapshot = await buildComparisonReportSnapshot(client, assemblyId, { snapshotStatus: 'draft' }) as SnapshotData;
  } catch (error) {
    if (error instanceof Error && error.name === 'ArchivedAssemblyError') {
      return NextResponse.json({ code: 1, message: error.message }, { status: 409 });
    }
    if (error instanceof Error && error.message.startsWith('Assembly not found:')) {
      return NextResponse.json({ code: 1, message: '对比矩阵不存在' }, { status: 404 });
    }
    throw error;
  }
  if (!snapshot.primary_task_id) {
    return NextResponse.json({ code: 1, message: '该对比组装缺少可用于创建草稿报告的来源任务' }, { status: 400 });
  }

  const title = typeof body.title === 'string' && body.title.trim()
    ? body.title.trim()
    : `${String(snapshot.assembly?.name || '对比报告')} - 草稿`;
  let reportId = typeof body.report_id === 'string' ? body.report_id : '';
  let createdNewReport = false;

  if (reportId) {
    if (!(await canAccessReport(client, user, reportId))) return forbidden();
    try {
      const persisted = await persistExistingReportSnapshotAtomic(client, {
        reportId,
        reportType: 'comparison_report',
        snapshotJson: snapshot,
        layoutProfile: snapshot.layout_profile,
        actorId: user.id,
        allowAll: user.role === 'admin' || hasPermission(user.role, Permission.REPORT_VIEW_ALL),
        requestKey: typeof body.idempotency_key === 'string'
          ? body.idempotency_key
          : typeof body.request_key === 'string' ? body.request_key : undefined,
        reportUpdate: { assembly_id: assemblyId },
      });
      return NextResponse.json({
        code: 0,
        message: 'comparison_report 草稿快照已生成',
        data: persisted,
      });
    } catch (snapshotError) {
      const status = snapshotError instanceof IdempotencyConflictError
        || snapshotError instanceof IdempotencySupersededError ? 409 : 500;
      return NextResponse.json({
        code: 1,
        message: snapshotError instanceof Error ? snapshotError.message : '创建报告快照失败',
      }, { status });
    }
  } else {
    const { data: report, error } = await client
      .from('reports')
      .insert({
        task_id: snapshot.primary_task_id,
        title,
        content: null,
        status: '草稿',
        version: 1,
        report_type: 'comparison_report',
        source_task_ids: snapshot.source_task_ids,
        source_report_ids: snapshot.source_report_ids,
        assembly_id: assemblyId,
        layout_profile: snapshot.layout_profile,
        ai_confirmation_status: 'pending',
      })
      .select()
      .single();
    if (error || !report) {
      return NextResponse.json({ code: 1, message: error?.message || '创建草稿报告失败' }, { status: 500 });
    }
    reportId = String(report.id);
    createdNewReport = true;
  }

  try {
    const version = await loadNextReportSnapshotVersion(client, reportId, {
      deleteReportOnFailure: createdNewReport,
    });
    const { report, snapshot: savedSnapshot } = await persistAnchoredReportSnapshot(client, reportId, {
      report_id: reportId,
      report_type: 'comparison_report',
      version,
      snapshot_json: snapshot,
      layout_profile: snapshot.layout_profile,
      created_by: user.id,
    }, {
      deleteReportOnFailure: createdNewReport,
      reportUpdate: {
        report_type: 'comparison_report',
        assembly_id: assemblyId,
        layout_profile: snapshot.layout_profile,
      },
    });
    if (!report) throw new Error('Report snapshot anchor update returned no report');

    return NextResponse.json({
      code: 0,
      message: 'comparison_report 草稿快照已生成',
      data: {
        report,
        snapshot: serializeReportSnapshotDto(savedSnapshot),
      },
    });
  } catch (snapshotError) {
    return NextResponse.json({
      code: 1,
      message: snapshotError instanceof Error ? snapshotError.message : '创建报告快照失败',
    }, { status: 500 });
  }
}
