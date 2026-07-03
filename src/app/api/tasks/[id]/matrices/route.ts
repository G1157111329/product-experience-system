import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessTask, isAuthResponse, requireUser } from '@/lib/server/auth';
import { writeSecurityAudit } from '@/lib/server/security-audit';

/**
 * 数据矩阵 - 任务级实例 API (Task 6 / Data Matrix Input View)
 *
 * GET  /api/tasks/[id]/matrices        列出任务关联的 data_matrix 实例
 * POST /api/tasks/[id]/matrices        应用已发布模式版本，创建 data_matrix 实例
 *
 * 实例即 comparison_assemblies 中 matrix_role='data_matrix' 的行，通过
 * source_task_ids 关联到任务。
 */

/**
 * GET /api/tasks/[id]/matrices
 * 返回当前任务下所有数据矩阵实例（matrix_role='data_matrix' 且 source_task_ids 包含 taskId）。
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const { id: taskId } = await params;
  if (!(await canAccessTask(client, user, taskId))) {
    return NextResponse.json({ code: 1, message: '无权访问该任务' }, { status: 403 });
  }

  // 复用 findAssemblyForTask 的查询方式：拉取全部后按 source_task_ids 过滤。
  // 这里额外按 matrix_role='data_matrix' 过滤，避免误返回对比组装实例。
  const { data, error } = await client
    .from('comparison_assemblies')
    .select(
      'id,name,matrix_role,matrix_schema_version_id,status,comparability_status,created_at,source_task_ids',
    )
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });

  const matrices = (data || []).filter(
    (a: any) =>
      a.matrix_role === 'data_matrix' &&
      Array.isArray(a.source_task_ids) &&
      a.source_task_ids.includes(taskId),
  );

  // 响应中剥离 source_task_ids，保持载荷干净，字段转为 camelCase。
  const cleaned = matrices.map((a: any) => ({
    id: a.id,
    name: a.name,
    matrixRole: a.matrix_role,
    matrixSchemaVersionId: a.matrix_schema_version_id,
    status: a.status,
    comparabilityStatus: a.comparability_status,
    createdAt: a.created_at,
  }));

  return NextResponse.json({ code: 0, message: 'success', data: cleaned });
}

/**
 * POST /api/tasks/[id]/matrices
 * 应用已发布模式版本到当前任务，创建一个 data_matrix 实例。
 *
 * Body: { schemaVersionId: string; name?: string }
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const { id: taskId } = await params;
  if (!(await canAccessTask(client, user, taskId))) {
    return NextResponse.json({ code: 1, message: '无权访问该任务' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const schemaVersionId = body?.schemaVersionId;
  if (!schemaVersionId) {
    return NextResponse.json({ code: 1, message: '缺少 schemaVersionId' }, { status: 400 });
  }

  // 1. 取模式版本，校验必须为 published 状态。
  const { data: sv, error: svErr } = await client
    .from('matrix_schema_versions')
    .select('id,schema_id,version_no,status,schema_json')
    .eq('id', schemaVersionId)
    .maybeSingle();
  if (svErr) return NextResponse.json({ code: 1, message: svErr.message }, { status: 500 });
  if (!sv) return NextResponse.json({ code: 1, message: '未找到模式版本' }, { status: 404 });
  if (sv.status !== 'published') {
    return NextResponse.json({ code: 1, message: '模式版本未发布，不能应用' }, { status: 409 });
  }

  // 2. 取任务，用于命名与 created_by。
  const { data: task, error: taskErr } = await client
    .from('experience_tasks')
    .select('id,task_name,created_by')
    .eq('id', taskId)
    .maybeSingle();
  if (taskErr) return NextResponse.json({ code: 1, message: taskErr.message }, { status: 500 });
  if (!task) return NextResponse.json({ code: 1, message: '未找到任务' }, { status: 404 });

  // 3. 写入组装行（matrix_role='data_matrix'）。
  const schemaName =
    (sv.schema_json &&
      typeof sv.schema_json === 'object' &&
      (sv.schema_json as any).title) ||
    '数据矩阵';
  const name = body?.name || `${task.task_name} - ${schemaName}`;
  const insertPayload = {
    name,
    assembly_type: 'task_comparison',
    source_type: 'manual',
    status: 'draft',
    matrix_role: 'data_matrix',
    matrix_schema_version_id: schemaVersionId,
    comparability_status: 'unknown',
    layout_type: 'metric_table',
    source_task_ids: [taskId],
    source_report_ids: [],
    created_by: task.created_by,
  };
  const { data: inserted, error: insErr } = await client
    .from('comparison_assemblies')
    .insert(insertPayload)
    .select()
    .single();
  if (insErr) return NextResponse.json({ code: 1, message: insErr.message }, { status: 500 });
  const assemblyId = inserted.id;

  // 4. 安全审计日志（沿用仓库既有的 writeSecurityAudit 助手约定）。
  await writeSecurityAudit(client, {
    request,
    actor: user,
    action: 'task_matrix.applied',
    outcome: 'success',
    targetType: 'comparison_assembly',
    targetId: assemblyId,
    metadata: { taskId, schemaVersionId, matrixRole: 'data_matrix' },
  });

  return NextResponse.json({
    code: 0,
    message: '应用数据矩阵成功',
    data: { assemblyId, matrixSchemaVersionId: schemaVersionId },
  });
}
