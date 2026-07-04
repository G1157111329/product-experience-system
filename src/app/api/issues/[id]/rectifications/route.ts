import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessTask, forbidden, isAuthResponse, requireUser } from '@/lib/server/auth';
import { createRectificationAction, getRectificationHistory } from '@/lib/server/issue-lifecycle';

async function requireIssueAccess(
  request: NextRequest,
  client: ReturnType<typeof getSupabaseClient>,
  id: string,
) {
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  const { data: issue } = await client.from('issues').select('task_id').eq('id', id).maybeSingle();
  if (!issue?.task_id || !(await canAccessTask(client, user, String(issue.task_id)))) return forbidden();
  return user;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const client = getSupabaseClient();
  const auth = await requireIssueAccess(request, client, id);
  if (isAuthResponse(auth)) return auth;

  try {
    const history = await getRectificationHistory(client, id);
    return NextResponse.json({ code: 0, message: 'success', data: history });
  } catch (err) {
    const message = err instanceof Error ? err.message : '加载整改历史失败';
    return NextResponse.json({ code: 1, message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const client = getSupabaseClient();
  const auth = await requireIssueAccess(request, client, id);
  if (isAuthResponse(auth)) return auth;

  const body = await request.json();
  if (!body.action_plan) {
    return NextResponse.json({ code: 1, message: '整改方案不能为空' }, { status: 400 });
  }

  const { data, error } = await createRectificationAction(client, {
    issueId: id,
    actionPlan: body.action_plan,
    responsiblePerson: body.responsible_person ?? null,
    responsibleDept: body.responsible_dept ?? null,
    planCompleteDate: body.plan_complete_date ?? null,
    note: body.note ?? null,
    createdBy: auth.id,
  });

  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: '创建成功', data });
}
