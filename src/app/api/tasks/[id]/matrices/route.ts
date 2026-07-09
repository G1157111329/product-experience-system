/**
 * Task matrices API — V2 user-designed model (PRD §12.2).
 *
 * GET  /api/tasks/[id]/matrices  — list task matrices
 * POST /api/tasks/[id]/matrices  — create new matrix (status=designing)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessTask, isAuthResponse, requireUser } from '@/lib/server/auth';
import { writeSecurityAudit } from '@/lib/server/security-audit';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const { id: taskId } = await params;
  if (!(await canAccessTask(client, user, taskId))) {
    return NextResponse.json({ code: 1, message: '无权访问该任务' }, { status: 403 });
  }

  const { data, error } = await client
    .from('task_matrices')
    .select('id,task_id,name,description,status,current_design_version_id,comparability_status,comparability_statement,created_by,created_at,updated_at,version')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });

  const matrices = ((data ?? []) as Record<string, unknown>[]).map((m) => ({
    id: m.id,
    taskId: m.task_id,
    name: m.name,
    description: m.description,
    status: m.status,
    currentDesignVersionId: m.current_design_version_id,
    comparabilityStatus: m.comparability_status,
    comparabilityStatement: m.comparability_statement,
    createdBy: m.created_by,
    createdAt: m.created_at,
    updatedAt: m.updated_at,
    version: m.version,
  }));

  return NextResponse.json({ code: 0, message: 'success', data: matrices });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const { id: taskId } = await params;
  if (!(await canAccessTask(client, user, taskId))) {
    return NextResponse.json({ code: 1, message: '无权访问该任务' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { name: string; description?: string };
  if (!body.name?.trim()) {
    return NextResponse.json({ code: 1, message: '矩阵名称不能为空' }, { status: 400 });
  }

  const { data, error } = await client
    .from('task_matrices')
    .insert({
      task_id: taskId,
      name: body.name.trim(),
      description: body.description?.trim() ?? null,
      status: 'designing',
      comparability_status: 'not_applicable',
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
      return NextResponse.json({ code: 1, message: '该任务中已存在同名矩阵' }, { status: 409 });
    }
    return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  }

  await writeSecurityAudit(client, {
    request,
    actor: user,
    action: 'task_matrix.created',
    outcome: 'success',
    targetType: 'task_matrix',
    targetId: data.id,
    metadata: { taskId, name: body.name },
  });

  const m = data as Record<string, unknown>;
  return NextResponse.json({
    code: 0,
    message: '矩阵创建成功',
    data: {
      id: m.id,
      taskId: m.task_id,
      name: m.name,
      description: m.description,
      status: m.status,
      createdAt: m.created_at,
    },
  }, { status: 201 });
}