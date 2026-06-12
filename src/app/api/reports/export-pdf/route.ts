import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canReadReport, forbidden, isAuthResponse, requireUser } from '@/lib/server/auth';
import { writeSecurityAudit } from '@/lib/server/security-audit';

export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const body = await request.json();
  const { report_id } = body;

  if (!report_id) {
    return NextResponse.json({ code: 1, message: '缺少report_id' }, { status: 400 });
  }
  if (!(await canReadReport(client, user, report_id))) return forbidden();

  const { data: report, error } = await client.from('reports').select('*').eq('id', report_id).single();
  if (error || !report) {
    return NextResponse.json({ code: 1, message: '报告不存在' }, { status: 404 });
  }

  const content = report.content as Record<string, unknown> | null;
  if (!content) {
    return NextResponse.json({ code: 1, message: '报告内容为空' }, { status: 400 });
  }

  await writeSecurityAudit(client, {
    request,
    actor: user,
    action: 'report.export_pdf',
    outcome: 'success',
    targetType: 'report',
    targetId: report_id,
  });

  return NextResponse.json({
    code: 0,
    message: 'success',
    data: report,
  });
}
