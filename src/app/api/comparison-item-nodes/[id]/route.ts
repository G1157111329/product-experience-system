import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessAssembly, isAuthResponse, requireUser } from '@/lib/server/auth';

async function getNodeAssemblyId(client: ReturnType<typeof getSupabaseClient>, nodeId: string): Promise<string | null> {
  const { data } = await client
    .from('comparison_item_nodes')
    .select('assembly_id')
    .eq('id', nodeId)
    .maybeSingle();
  return data?.assembly_id ? String(data.assembly_id) : null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  const { id } = await params;
  const assemblyId = await getNodeAssemblyId(client, id);
  if (!assemblyId) {
    return NextResponse.json({ code: 1, message: '未找到' }, { status: 404 });
  }
  const accessible = await canAccessAssembly(client, user, assemblyId);
  if (!accessible) {
    return NextResponse.json({ code: 1, message: '无权访问' }, { status: 403 });
  }
  const { data, error } = await client.from('comparison_item_nodes').select('*').eq('id', id).maybeSingle();
  if (error || !data) {
    return NextResponse.json({ code: 1, message: '查询失败' }, { status: 500 });
  }
  return NextResponse.json({ code: 0, message: 'success', data });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  const { id } = await params;
  const assemblyId = await getNodeAssemblyId(client, id);
  if (!assemblyId) {
    return NextResponse.json({ code: 1, message: '未找到' }, { status: 404 });
  }
  const accessible = await canAccessAssembly(client, user, assemblyId);
  if (!accessible) {
    return NextResponse.json({ code: 1, message: '无权访问' }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const allowed: string[] = ['node_label', 'node_type', 'shared_recipe', 'config', 'is_collapsed', 'parent_id'];
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (body[key] !== undefined) update[key] = body[key];
  }
  // 若修改 parent_id 需重新计算 depth
  if (body.parent_id !== undefined) {
    if (body.parent_id) {
      const { data: parent } = await client
        .from('comparison_item_nodes')
        .select('depth')
        .eq('id', body.parent_id)
        .maybeSingle();
      update.depth = (parent?.depth ?? -1) + 1;
    } else {
      update.depth = 0;
    }
  }
  const { data, error } = await client.from('comparison_item_nodes').update(update).eq('id', id).select().single();
  if (error) {
    return NextResponse.json({ code: 1, message: '更新失败' }, { status: 500 });
  }
  return NextResponse.json({ code: 0, message: '更新成功', data });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  const { id } = await params;
  const assemblyId = await getNodeAssemblyId(client, id);
  if (!assemblyId) {
    return NextResponse.json({ code: 1, message: '未找到' }, { status: 404 });
  }
  const accessible = await canAccessAssembly(client, user, assemblyId);
  if (!accessible) {
    return NextResponse.json({ code: 1, message: '无权访问' }, { status: 403 });
  }
  // 删除节点会级联删除子节点（FK ON DELETE CASCADE）
  const { error } = await client.from('comparison_item_nodes').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ code: 1, message: '删除失败' }, { status: 500 });
  }
  return NextResponse.json({ code: 0, message: '删除成功' });
}