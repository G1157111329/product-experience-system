import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessAssembly, isAuthResponse, requireUser } from '@/lib/server/auth';
import { deleteAssembly, getAssembly, updateAssemblyStatus } from '@/lib/server/comparison-assembly';

/**
 * GET /api/comparison-assemblies/[id]
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  const { id } = await params;
  const accessible = await canAccessAssembly(client, user, id);
  if (!accessible) {
    return NextResponse.json({ code: 1, message: '无权访问' }, { status: 403 });
  }
  const assembly = await getAssembly(client, id);
  if (!assembly) {
    return NextResponse.json({ code: 1, message: '未找到' }, { status: 404 });
  }
  return NextResponse.json({ code: 0, message: 'success', data: assembly });
}

/**
 * PUT /api/comparison-assemblies/[id]
 * body: { name?, layout_type?, comparison_intent?, status? }
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  const { id } = await params;
  const accessible = await canAccessAssembly(client, user, id);
  if (!accessible) {
    return NextResponse.json({ code: 1, message: '无权访问' }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === 'string') update.name = body.name;
  if (typeof body.layout_type === 'string') update.layout_type = body.layout_type;
  if (typeof body.comparison_intent === 'string') update.comparison_intent = body.comparison_intent;
  if (typeof body.status === 'string') {
    try {
      await updateAssemblyStatus(client, id, body.status as 'draft' | 'ready' | 'published' | 'archived');
    } catch (err) {
      return NextResponse.json({ code: 1, message: err instanceof Error ? err.message : '状态更新失败' }, { status: 400 });
    }
  }
  const { data, error } = await client.from('comparison_assemblies').update(update).eq('id', id).select().single();
  if (error) {
    return NextResponse.json({ code: 1, message: '更新失败' }, { status: 500 });
  }
  return NextResponse.json({ code: 0, message: '更新成功', data });
}

/**
 * DELETE /api/comparison-assemblies/[id]
 * 仅 draft 状态可删
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  const { id } = await params;
  const accessible = await canAccessAssembly(client, user, id);
  if (!accessible) {
    return NextResponse.json({ code: 1, message: '无权访问' }, { status: 403 });
  }
  try {
    await deleteAssembly(client, id);
    return NextResponse.json({ code: 0, message: '删除成功' });
  } catch (err) {
    return NextResponse.json({ code: 1, message: err instanceof Error ? err.message : '删除失败' }, { status: 400 });
  }
}