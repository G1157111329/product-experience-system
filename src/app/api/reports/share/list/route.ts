import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessReport, forbidden, isAuthResponse, requireUser } from '@/lib/server/auth';
import { writeSecurityAudit } from '@/lib/server/security-audit';

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const { searchParams } = new URL(request.url);
  const report_id = searchParams.get('report_id');

  if (!report_id) {
    return NextResponse.json({ code: 1, message: '缺少报告ID' }, { status: 400 });
  }
  if (!(await canAccessReport(client, user, report_id))) return forbidden();

  const { data, error } = await client.from('report_shares')
    .select('id, share_token, expires_at, created_by, created_at')
    .eq('report_id', report_id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ code: 1, message: '查询失败' }, { status: 500 });

  const now = new Date();
  const enriched = (data || []).map((s: Record<string, unknown>) => ({
    ...s,
    is_expired: s.expires_at ? new Date(s.expires_at as string) < now : false,
  }));

  return NextResponse.json({ code: 0, message: 'success', data: enriched });
}

export async function DELETE(request: NextRequest) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ code: 1, message: '缺少分享ID' }, { status: 400 });
  }

  const { data: share } = await client
    .from('report_shares')
    .select('id, report_id')
    .eq('id', id)
    .maybeSingle();
  if (!share) return NextResponse.json({ code: 1, message: '分享链接不存在' }, { status: 404 });
  if (!(await canAccessReport(client, user, String(share.report_id)))) return forbidden();

  const { error } = await client.from('report_shares').delete().eq('id', id);
  if (!error) {
    await writeSecurityAudit(client, {
      request,
      actor: user,
      action: 'report_share.revoke',
      outcome: 'success',
      targetType: 'report_share',
      targetId: id,
      metadata: { reportId: share.report_id },
    });
  }
  if (error) return NextResponse.json({ code: 1, message: '撤销失败' }, { status: 500 });

  return NextResponse.json({ code: 0, message: '分享链接已撤销' });
}
