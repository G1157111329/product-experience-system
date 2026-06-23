import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessReport, canReadReport, forbidden, isAuthResponse, requireAdmin, requireUser } from '@/lib/server/auth';
import { writeSecurityAudit } from '@/lib/server/security-audit';
import { attachLatestSnapshotForComparisonReport } from '@/lib/server/report-snapshots';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  if (!(await canReadReport(client, user, id))) return forbidden();

  const { data, error } = await client.from('reports').select('*').eq('id', id).single();
  if (error) return NextResponse.json({ code: 1, message: '报告不存在' }, { status: 404 });
  const report = await attachLatestSnapshotForComparisonReport(client, data as Record<string, unknown>);
  return NextResponse.json({ code: 0, message: 'success', data: report });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  if (!(await canAccessReport(client, user, id))) return forbidden();

  const body = await request.json();
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.title !== undefined) updateData.title = body.title;
  if (body.content !== undefined) updateData.content = body.content;
  if (body.status !== undefined) updateData.status = body.status;
  if (body.version !== undefined) updateData.version = body.version;
  if (body.product_model !== undefined) updateData.product_model = body.product_model;

  const { data, error } = await client.from('reports').update(updateData).eq('id', id).select().single();

  if (error) return NextResponse.json({ code: 1, message: '更新失败' }, { status: 500 });
  return NextResponse.json({ code: 0, message: '更新成功', data });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const admin = await requireAdmin(request, client);
  if (isAuthResponse(admin)) return admin;

  const { error } = await client.from('reports').delete().eq('id', id);
  if (!error) {
    await writeSecurityAudit(client, {
      request,
      actor: admin,
      action: 'report.delete',
      outcome: 'success',
      targetType: 'report',
      targetId: id,
    });
  }
  if (error) return NextResponse.json({ code: 1, message: '删除失败' }, { status: 500 });
  return NextResponse.json({ code: 0, message: '删除成功' });
}
