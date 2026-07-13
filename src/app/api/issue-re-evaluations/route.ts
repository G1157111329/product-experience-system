import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canMutateIssueRetest, canReadIssue, isAuthResponse, requireUser } from '@/lib/server/auth';
import { classifyIssueRetestError, createIssueRetest } from '@/lib/server/issue-retest-service';
import type { EvaluationStatus } from '@/lib/evaluation-status';

const RETEST_RESULTS = new Set<EvaluationStatus>(['qualified', 'unqualified', 'pending']);

// GET /api/issue-re-evaluations?issue_id=xxx or ?issue_ids=id1,id2 — list re-evaluations for issue(s)
export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const { searchParams } = new URL(request.url);
  const issueId = searchParams.get('issue_id');
  const issueIds = searchParams.get('issue_ids');

  if (!issueId && !issueIds) {
    return NextResponse.json({ code: 1, message: '缺少 issue_id 或 issue_ids 参数' }, { status: 400 });
  }

  const requestedIssueIds = issueId ? [issueId] : (issueIds || '').split(',').map((id) => id.trim()).filter(Boolean);
  for (const id of requestedIssueIds) {
    if (!(await canReadIssue(client, user, id))) {
      return NextResponse.json({ code: 1, message: '无权访问该问题复评估' }, { status: 403 });
    }
  }

  let query = client
    .from('issue_re_evaluations')
    .select('*');

  if (issueId) {
    query = query.eq('issue_id', issueId);
  } else if (issueIds) {
    query = query.in('issue_id', requestedIssueIds);
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  if (error) {
    console.error('[issue-retest-list] query failed', error);
    return NextResponse.json({ code: 1, message: '查询复测记录失败' }, { status: 500 });
  }

  // Also fetch related materials (by re_evaluation_id)
  const reEvalIds = (data || []).map((r: Record<string, unknown>) => r.id as string);
  const materialsMap: Record<string, unknown[]> = {};
  if (reEvalIds.length > 0) {
    const { data: materials } = await client
      .from('materials')
      .select('*')
      .in('re_evaluation_id', reEvalIds);
    for (const m of (materials || []) as Array<{ re_evaluation_id: string }>) {
      if (!materialsMap[m.re_evaluation_id]) materialsMap[m.re_evaluation_id] = [];
      materialsMap[m.re_evaluation_id].push(m);
    }
  }

  const createdByIds = [...new Set(((data || []) as Array<Record<string, unknown>>)
    .map((row) => row.created_by)
    .filter((value): value is string => typeof value === 'string' && value.length > 0))];
  const creatorNames = new Map<string, string>();
  if (createdByIds.length > 0) {
    const { data: users } = await client
      .from('platform_users')
      .select('id, name, account')
      .in('id', createdByIds);
    for (const userRow of (users || []) as Array<{ id: string; name?: string | null; account?: string | null }>) {
      creatorNames.set(userRow.id, String(userRow.name || userRow.account || '').trim());
    }
  }

  const result = (data || []).map((r: Record<string, unknown>) => ({
    ...r,
    created_by_name: typeof r.created_by === 'string' ? creatorNames.get(r.created_by) || null : null,
    materials: materialsMap[r.id as string] || [],
  }));

  return NextResponse.json({ code: 0, data: result });
}

// POST /api/issue-re-evaluations — create a new re-evaluation
export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: 1, message: '请求格式错误' }, { status: 400 });
  }
  const { issue_id, description, result, material_ids } = body;

  if (typeof issue_id !== 'string' || !issue_id.trim()) {
    return NextResponse.json({ code: 1, message: '缺少 issue_id' }, { status: 400 });
  }

  const { data: issue, error: issueError } = await client
    .from('issues')
    .select('id')
    .eq('id', issue_id)
    .maybeSingle();
  if (issueError) {
    console.error('[issue-retest-create] issue lookup failed', issueError);
    return NextResponse.json({ code: 1, message: '复测操作失败' }, { status: 500 });
  }
  if (!issue) return NextResponse.json({ code: 1, message: '问题不存在' }, { status: 404 });
  if (!(await canMutateIssueRetest(client, user, issue_id))) {
    return NextResponse.json({ code: 1, message: '无权创建该问题复测' }, { status: 403 });
  }

  if (!RETEST_RESULTS.has(result as EvaluationStatus)) {
    return NextResponse.json({ code: 1, message: '复测结果必须为合格、不合格或待定' }, { status: 400 });
  }
  if (typeof description !== 'string' || !description.trim()) {
    return NextResponse.json({ code: 1, message: '请填写复测评价描述' }, { status: 400 });
  }
  if (material_ids !== undefined && (!Array.isArray(material_ids) || material_ids.some((id) => typeof id !== 'string'))) {
    return NextResponse.json({ code: 1, message: '素材参数格式错误' }, { status: 400 });
  }

  try {
    const data = await createIssueRetest(client, {
      issueId: issue_id,
      description,
      result: result as EvaluationStatus,
      materialIds: material_ids as string[] | undefined,
      createdBy: user.id,
    });
    return NextResponse.json({ code: 0, data });
  } catch (error) {
    const classified = classifyIssueRetestError(error);
    if (classified.log) console.error('[issue-retest-create] operation failed', error);
    return NextResponse.json({ code: 1, message: classified.message }, { status: classified.status });
  }
}
