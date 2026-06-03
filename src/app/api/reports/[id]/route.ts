import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { assertAdmin } from '@/lib/server/agent-skills';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const { data, error } = await client.from('reports').select('*').eq('id', id).single();
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 404 });
  return NextResponse.json({ code: 0, message: 'success', data });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const body = await request.json();

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.title !== undefined) updateData.title = body.title;
  if (body.content !== undefined) updateData.content = body.content;
  if (body.status !== undefined) updateData.status = body.status;
  if (body.version !== undefined) updateData.version = body.version;
  if (body.product_model !== undefined) updateData.product_model = body.product_model;

  const { data, error } = await client.from('reports').update(updateData).eq('id', id).select().single();

  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: '更新成功', data });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();

  try {
    await assertAdmin(client, request.nextUrl.searchParams.get('admin_user_id'));
  } catch (err) {
    const message = err instanceof Error ? err.message : '仅管理员可删除报告';
    return NextResponse.json({ code: 1, message }, { status: 403 });
  }

  const { error } = await client.from('reports').delete().eq('id', id);
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: '删除成功' });
}
