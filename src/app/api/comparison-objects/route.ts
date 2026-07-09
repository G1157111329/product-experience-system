import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessAssembly, canAccessTask, canReadReport, isAuthResponse, requireUser } from '@/lib/server/auth';
import { ensureComparisonMatrixCells } from '@/lib/server/comparison-matrix-cells';

/**
 * GET /api/comparison-objects?assembly_id=xxx
 * 列出某组装下的所有对象（按 sort_order 排序）
 */
export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const { searchParams } = new URL(request.url);
  const assemblyId = searchParams.get('assembly_id');
  if (!assemblyId) {
    return NextResponse.json({ code: 1, message: '请提供 assembly_id' }, { status: 400 });
  }

  const accessible = await canAccessAssembly(client, user, assemblyId);
  if (!accessible) {
    return NextResponse.json({ code: 1, message: '无权访问' }, { status: 403 });
  }

  const { data, error } = await client
    .from('comparison_objects')
    .select('*')
    .eq('assembly_id', assemblyId)
    .order('sort_order', { ascending: true });

  if (error) {
    return NextResponse.json({ code: 1, message: '查询失败' }, { status: 500 });
  }
  return NextResponse.json({ code: 0, message: 'success', data });
}

/**
 * POST /api/comparison-objects
 * 添加对比对象
 * body: {
 *   assembly_id: string,
 *   task_id?: string,
 *   report_id?: string,
 *   object_name: string,
 *   object_type: string,
 *   comparison_factor?, brand?, model?, specification?, material_structure?,
 *   project_stage?, sample_batch?, object_source_type?, is_competitor?,
 *   parent_product?, cover_material_id?, custom_fields?
 * }
 */
export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const body = await request.json();
  if (!body.assembly_id || typeof body.object_name !== 'string' || !body.object_name.trim()) {
    return NextResponse.json({ code: 1, message: '缺少必填字段 assembly_id 或 object_name' }, { status: 400 });
  }

  const accessible = await canAccessAssembly(client, user, body.assembly_id);
  if (!accessible) {
    return NextResponse.json({ code: 1, message: '无权访问组装' }, { status: 403 });
  }

  // 校验 task_id / report_id 归属（若提供）
  if (body.task_id) {
    const canTask = await canAccessTask(client, user, String(body.task_id));
    if (!canTask) {
      return NextResponse.json({ code: 1, message: '无权绑定该任务' }, { status: 403 });
    }
  }
  if (body.report_id) {
    const canReport = await canReadReport(client, user, String(body.report_id));
    if (!canReport) {
      return NextResponse.json({ code: 1, message: '无权绑定该报告' }, { status: 403 });
    }
  }

  // 计算 sort_order（追加到末尾）
  const { data: existing } = await client
    .from('comparison_objects')
    .select('sort_order')
    .eq('assembly_id', body.assembly_id)
    .order('sort_order', { ascending: false })
    .maybeSingle();
  const nextSort = (existing?.sort_order ?? -1) + 1;

  const insertRow: Record<string, unknown> = {
    assembly_id: body.assembly_id,
    task_id: body.task_id ?? null,
    report_id: body.report_id ?? null,
    object_name: body.object_name,
    object_type: body.object_type || 'product_model',
    comparison_factor: body.comparison_factor ?? null,
    brand: body.brand ?? null,
    model: body.model ?? null,
    specification: body.specification ?? null,
    material_structure: body.material_structure ?? null,
    project_stage: body.project_stage ?? null,
    sample_batch: body.sample_batch ?? null,
    object_source_type: body.object_source_type ?? null,
    is_competitor: body.is_competitor ?? false,
    parent_product: body.parent_product ?? null,
    cover_material_id: body.cover_material_id ?? null,
    custom_fields: body.custom_fields ?? {},
    sort_order: nextSort,
  };

  const { data, error } = await client.from('comparison_objects').insert(insertRow).select().single();
  if (error) {
    return NextResponse.json({ code: 1, message: `创建失败: ${error.message}` }, { status: 500 });
  }

  // PRD §10.1 — 新增对象后即时生成可编辑单元格
  const ensured = await ensureComparisonMatrixCells(client, body.assembly_id);
  if (ensured.error) {
    return NextResponse.json({
      code: 0,
      message: '对象已创建，但补齐单元格失败，请刷新后重试',
      data: { ...data, cells_warning: ensured.error },
    });
  }

  return NextResponse.json({
    code: 0,
    message: '创建成功',
    data: { ...data, cells_created: ensured.created.length },
  });
}