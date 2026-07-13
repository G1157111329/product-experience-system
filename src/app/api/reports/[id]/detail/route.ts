import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canReadReport, forbidden, isAuthResponse, requireUser } from '@/lib/server/auth';
import { buildFrozenReportResponse } from '@/lib/server/report-frozen-view';

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
    const { model, detailModel } = await buildFrozenReportResponse(
      client,
      report as Row,
      { audience: 'internal' },
    );
    return NextResponse.json({
      code: 0,
      message: 'success',
      data: {
        ...detailModel,
        frozenViewModel: model,
      },
    });
  } catch (detailError) {
    return NextResponse.json({
      code: 1,
      message: detailError instanceof Error ? detailError.message : '报告详情加载失败',
    }, { status: 500 });
  }
}
