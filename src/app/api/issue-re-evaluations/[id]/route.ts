import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canMutateIssueReEvaluation, isAuthResponse, requireUser } from '@/lib/server/auth';
import { classifyIssueRetestError, deleteIssueRetest, updateIssueRetest } from '@/lib/server/issue-retest-service';
import type { EvaluationStatus } from '@/lib/evaluation-status';

const RETEST_RESULTS = new Set<EvaluationStatus>(['qualified', 'unqualified', 'pending']);

// PUT /api/issue-re-evaluations/[id] — update a re-evaluation
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  const { data: existing, error: lookupError } = await client
    .from('issue_re_evaluations')
    .select('id, issue_id')
    .eq('id', id)
    .maybeSingle();
  if (lookupError) {
    console.error('[issue-retest-update] lookup failed', lookupError);
    return NextResponse.json({ code: 1, message: '复测操作失败' }, { status: 500 });
  }
  if (!existing) return NextResponse.json({ code: 1, message: '复测记录不存在' }, { status: 404 });
  if (!(await canMutateIssueReEvaluation(client, user, id))) {
    return NextResponse.json({ code: 1, message: '无权更新该问题复测' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: 1, message: '请求格式错误' }, { status: 400 });
  }
  const { description, result, material_ids } = body;
  if (result !== undefined && !RETEST_RESULTS.has(result as EvaluationStatus)) {
    return NextResponse.json({ code: 1, message: '复测结果必须为合格、不合格或待定' }, { status: 400 });
  }
  if (description !== undefined && (typeof description !== 'string' || !description.trim())) {
    return NextResponse.json({ code: 1, message: '请填写复测评价描述' }, { status: 400 });
  }
  if (material_ids !== undefined && (!Array.isArray(material_ids) || material_ids.some((materialId) => typeof materialId !== 'string'))) {
    return NextResponse.json({ code: 1, message: '素材参数格式错误' }, { status: 400 });
  }
  try {
    const data = await updateIssueRetest(client, id, {
      ...(typeof description === 'string' ? { description } : {}),
      ...(result !== undefined ? { result: result as EvaluationStatus } : {}),
      ...(material_ids !== undefined ? { materialIds: material_ids as string[] } : {}),
    });
    return NextResponse.json({ code: 0, data });
  } catch (error) {
    const classified = classifyIssueRetestError(error);
    if (classified.log) console.error('[issue-retest-update] operation failed', error);
    return NextResponse.json({ code: 1, message: classified.message }, { status: classified.status });
  }
}

// DELETE /api/issue-re-evaluations/[id] — delete a re-evaluation
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  const { data: existing, error: lookupError } = await client
    .from('issue_re_evaluations')
    .select('id, issue_id')
    .eq('id', id)
    .maybeSingle();
  if (lookupError) {
    console.error('[issue-retest-delete] lookup failed', lookupError);
    return NextResponse.json({ code: 1, message: '复测操作失败' }, { status: 500 });
  }
  if (!existing) return NextResponse.json({ code: 1, message: '复测记录不存在' }, { status: 404 });
  if (!(await canMutateIssueReEvaluation(client, user, id))) {
    return NextResponse.json({ code: 1, message: '无权删除该问题复测' }, { status: 403 });
  }

  try {
    const data = await deleteIssueRetest(client, id);
    return NextResponse.json({ code: 0, message: '删除成功', data });
  } catch (error) {
    const classified = classifyIssueRetestError(error);
    if (classified.log) console.error('[issue-retest-delete] operation failed', error);
    return NextResponse.json({ code: 1, message: classified.message }, { status: classified.status });
  }
}
