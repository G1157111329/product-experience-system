import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessIssueReEvaluation, isAuthResponse, requireUser } from '@/lib/server/auth';

// PUT /api/issue-re-evaluations/[id] — update a re-evaluation
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  if (!(await canAccessIssueReEvaluation(client, user, id))) {
    return NextResponse.json({ code: 1, message: '无权更新该问题复评估' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { description, ai_result } = body;

    const updateData: Record<string, unknown> = {};
    if (description !== undefined) updateData.description = description;
    if (ai_result !== undefined) updateData.ai_result = ai_result;

    const { data, error } = await client
      .from('issue_re_evaluations')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ code: 1, message: '更新失败: ' + error.message }, { status: 500 });
    }

    return NextResponse.json({ code: 0, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '更新失败';
    return NextResponse.json({ code: 1, message }, { status: 500 });
  }
}

// DELETE /api/issue-re-evaluations/[id] — delete a re-evaluation
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  if (!(await canAccessIssueReEvaluation(client, user, id))) {
    return NextResponse.json({ code: 1, message: '无权删除该问题复评估' }, { status: 403 });
  }

  try {
    // Disassociate materials (set re_evaluation_id to null) instead of deleting them
    await client
      .from('materials')
      .update({ re_evaluation_id: null })
      .eq('re_evaluation_id', id);

    const { error } = await client
      .from('issue_re_evaluations')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ code: 1, message: '删除失败: ' + error.message }, { status: 500 });
    }

    return NextResponse.json({ code: 0, message: '删除成功' });
  } catch (err) {
    const message = err instanceof Error ? err.message : '删除失败';
    return NextResponse.json({ code: 1, message }, { status: 500 });
  }
}
