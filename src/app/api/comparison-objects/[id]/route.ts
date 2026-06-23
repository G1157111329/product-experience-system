import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessAssembly, isAuthResponse, requireUser } from '@/lib/server/auth';

async function getObjectAssemblyId(client: ReturnType<typeof getSupabaseClient>, objectId: string): Promise<string | null> {
  const { data } = await client
    .from('comparison_objects')
    .select('assembly_id')
    .eq('id', objectId)
    .maybeSingle();
  return data?.assembly_id ? String(data.assembly_id) : null;
}

/**
 * GET /api/comparison-objects/[id]
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  const { id } = await params;
  const assemblyId = await getObjectAssemblyId(client, id);
  if (!assemblyId) {
    return NextResponse.json({ code: 1, message: '未找到' }, { status: 404 });
  }
  const accessible = await canAccessAssembly(client, user, assemblyId);
  if (!accessible) {
    return NextResponse.json({ code: 1, message: '无权访问' }, { status: 403 });
  }
  const { data, error } = await client.from('comparison_objects').select('*').eq('id', id).maybeSingle();
  if (error || !data) {
    return NextResponse.json({ code: 1, message: '查询失败' }, { status: 500 });
  }
  return NextResponse.json({ code: 0, message: 'success', data });
}

/**
 * PUT /api/comparison-objects/[id]
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  const { id } = await params;
  const assemblyId = await getObjectAssemblyId(client, id);
  if (!assemblyId) {
    return NextResponse.json({ code: 1, message: '未找到' }, { status: 404 });
  }
  const accessible = await canAccessAssembly(client, user, assemblyId);
  if (!accessible) {
    return NextResponse.json({ code: 1, message: '无权访问' }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const allowed: string[] = [
    'object_name', 'object_type', 'comparison_factor', 'brand', 'model', 'specification',
    'material_structure', 'project_stage', 'sample_batch', 'object_source_type', 'is_competitor',
    'parent_product', 'cover_material_id', 'custom_fields', 'task_id', 'report_id',
  ];
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) update[key] = body[key];
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ code: 1, message: '无更新字段' }, { status: 400 });
  }
  const { data, error } = await client.from('comparison_objects').update(update).eq('id', id).select().single();
  if (error) {
    return NextResponse.json({ code: 1, message: '更新失败' }, { status: 500 });
  }
  return NextResponse.json({ code: 0, message: '更新成功', data });
}

/**
 * DELETE /api/comparison-objects/[id]
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  const { id } = await params;
  const assemblyId = await getObjectAssemblyId(client, id);
  if (!assemblyId) {
    return NextResponse.json({ code: 1, message: '未找到' }, { status: 404 });
  }
  const accessible = await canAccessAssembly(client, user, assemblyId);
  if (!accessible) {
    return NextResponse.json({ code: 1, message: '无权访问' }, { status: 403 });
  }
  const { error } = await client.from('comparison_objects').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ code: 1, message: '删除失败' }, { status: 500 });
  }
  return NextResponse.json({ code: 0, message: '删除成功' });
}