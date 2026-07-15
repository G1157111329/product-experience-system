import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessRecipeStep, isAuthResponse, requireUser } from '@/lib/server/auth';
import { normalizeStepParameters } from '@/lib/task-context-contract';
import { deleteRecipeStepAtomically, isContentDeletionForbidden } from '@/lib/server/content-delete-service';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  if (!(await canAccessRecipeStep(client, user, id))) {
    return NextResponse.json({ code: 1, message: '无权更新该食谱步骤' }, { status: 403 });
  }

  const body = await request.json();

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.step_number !== undefined) updateData.step_number = body.step_number;
  if (body.operation !== undefined) updateData.operation = body.operation;
  if (body.sort_order !== undefined) updateData.sort_order = body.sort_order;
  if (body.parameters !== undefined) updateData.parameters = normalizeStepParameters(body.parameters);

  const { data, error } = await client.from('recipe_steps').update(updateData).eq('id', id).select().single();

  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: '更新成功', data });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  if (!(await canAccessRecipeStep(client, user, id))) {
    return NextResponse.json({ code: 1, message: '无权删除该食谱步骤' }, { status: 403 });
  }

  try {
    const deleted = await deleteRecipeStepAtomically({ stepId: id, actorId: user.id });
    if (!deleted) return NextResponse.json({ code: 1, message: '食谱步骤不存在' }, { status: 404 });
  } catch (error) {
    if (isContentDeletionForbidden(error)) return NextResponse.json({ code: 1, message: error.message }, { status: 403 });
    return NextResponse.json({ code: 1, message: error instanceof Error ? error.message : '食谱步骤删除事务失败' }, { status: 500 });
  }
  return NextResponse.json({ code: 0, message: '删除成功' });
}
