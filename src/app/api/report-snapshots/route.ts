import { NextRequest, NextResponse } from 'next/server';
import { canAccessAssembly, canAccessReport, canReadReport, forbidden, isAuthResponse, requireUser } from '@/lib/server/auth';
import { buildComparisonReportSnapshot } from '@/lib/server/comparison-assembly';
import { getSupabaseClient } from '@/storage/database/supabase-client';

type SnapshotData = {
  report_type: string;
  layout_profile: string;
  primary_task_id: string;
  source_task_ids: string[];
  source_report_ids: string[];
  assembly?: { id?: string; name?: string } & Record<string, unknown>;
};

async function nextSnapshotVersion(client: ReturnType<typeof getSupabaseClient>, reportId: string) {
  const { data } = await client
    .from('report_snapshots')
    .select('version')
    .eq('report_id', reportId)
    .order('version', { ascending: false })
    .limit(1);
  const latest = Array.isArray(data) ? data[0] as { version?: number | null } | undefined : undefined;
  return Number(latest?.version || 0) + 1;
}

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const id = request.nextUrl.searchParams.get('id');
  const reportId = request.nextUrl.searchParams.get('report_id');
  if (!id && !reportId) {
    return NextResponse.json({ code: 1, message: '请提供 id 或 report_id' }, { status: 400 });
  }

  let query = client.from('report_snapshots').select('*');
  if (id) {
    query = query.eq('id', id);
  } else if (reportId) {
    query = query.eq('report_id', reportId).order('version', { ascending: false }).limit(1);
  }

  const { data, error } = await query.maybeSingle();
  if (error) return NextResponse.json({ code: 1, message: error.message || '读取快照失败' }, { status: 500 });
  if (!data) return NextResponse.json({ code: 1, message: '快照不存在' }, { status: 404 });
  if (!(await canReadReport(client, user, String(data.report_id || '')))) return forbidden();

  return NextResponse.json({ code: 0, message: 'success', data });
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

  const snapshot = await buildComparisonReportSnapshot(client, assemblyId, { snapshotStatus: 'draft' }) as SnapshotData;
  if (!snapshot.primary_task_id) {
    return NextResponse.json({ code: 1, message: '该对比组装缺少可用于创建草稿报告的来源任务' }, { status: 400 });
  }

  const title = typeof body.title === 'string' && body.title.trim()
    ? body.title.trim()
    : `${String(snapshot.assembly?.name || '对比报告')} - 草稿`;
  let reportId = typeof body.report_id === 'string' ? body.report_id : '';

  if (reportId) {
    if (!(await canAccessReport(client, user, reportId))) return forbidden();
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
  }

  const version = await nextSnapshotVersion(client, reportId);
  const { data: savedSnapshot, error: snapshotError } = await client
    .from('report_snapshots')
    .insert({
      report_id: reportId,
      report_type: 'comparison_report',
      version,
      snapshot_json: snapshot,
      layout_profile: snapshot.layout_profile,
      created_by: user.id,
    })
    .select()
    .single();
  if (snapshotError || !savedSnapshot) {
    return NextResponse.json({ code: 1, message: snapshotError?.message || '创建报告快照失败' }, { status: 500 });
  }

  const { data: report } = await client
    .from('reports')
    .update({
      snapshot_id: savedSnapshot.id,
      report_type: 'comparison_report',
      assembly_id: assemblyId,
      layout_profile: snapshot.layout_profile,
      updated_at: new Date().toISOString(),
    })
    .eq('id', reportId)
    .select()
    .single();

  return NextResponse.json({
    code: 0,
    message: 'comparison_report 草稿快照已生成',
    data: {
      report,
      snapshot: savedSnapshot,
    },
  });
}
