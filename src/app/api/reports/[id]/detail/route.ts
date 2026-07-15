import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canReadReport, forbidden, isAuthResponse, requireUser } from '@/lib/server/auth';
import { loadMergedFrozenReportMembers } from '@/lib/server/report-merge-read';
import { reportSnapshotErrorStatus } from '@/lib/server/report-snapshots';

type Row = Record<string, unknown>;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  if (!(await canReadReport(client, user, id))) return forbidden();

  const { data: report, error } = await client.from('reports').select('*').eq('id', id).single();
  if (error || !report) {
    return NextResponse.json({ code: 1, message: '报告不存在' }, { status: 404 });
  }

  try {
    const members = await loadMergedFrozenReportMembers(client, report as Row, 'internal', user);
    const primary = members.find((member) => String(member.report.id || '') === id) ?? members[0];
    if (!primary) throw new Error('冻结报告不存在');
    const siblings = members.filter((member) => member !== primary);
    return NextResponse.json({
      code: 0,
      message: 'success',
      data: {
        ...primary.detailModel,
        frozenViewModel: primary.model,
        siblingReports: siblings.map((member) => member.report),
        siblingDetailModels: Object.fromEntries(siblings.map((member) => [String(member.report.id), member.detailModel])),
        siblingFrozenViewModels: Object.fromEntries(siblings.map((member) => [String(member.report.id), member.model])),
        mergedReportOrder: members.map((member) => String(member.report.id)),
      },
    });
  } catch (detailError) {
    return NextResponse.json({
      code: 1,
      message: detailError instanceof Error ? detailError.message : '报告详情加载失败',
    }, { status: reportSnapshotErrorStatus(detailError) });
  }
}
