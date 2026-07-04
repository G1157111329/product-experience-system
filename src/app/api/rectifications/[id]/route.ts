import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessTask, forbidden, isAuthResponse, requireUser } from '@/lib/server/auth';
import {
  getRectificationHistory,
  updateRectificationAction,
} from '@/lib/server/issue-lifecycle';

async function requireRectificationAccess(
  request: NextRequest,
  client: ReturnType<typeof getSupabaseClient>,
  id: string,
) {
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  const { data: action } = await client
    .from('rectification_actions')
    .select('issue_id')
    .eq('id', id)
    .maybeSingle();
  if (!action?.issue_id) return forbidden();
  const { data: issue } = await client
    .from('issues')
    .select('task_id')
    .eq('id', action.issue_id)
    .maybeSingle();
  if (!issue?.task_id || !(await canAccessTask(client, user, String(issue.task_id)))) {
    return forbidden();
  }
  return user;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const client = getSupabaseClient();
  const auth = await requireRectificationAccess(request, client, id);
  if (isAuthResponse(auth)) return auth;

  try {
    const { data: action } = await client
      .from('rectification_actions')
      .select('issue_id')
      .eq('id', id)
      .single();
    const history = await getRectificationHistory(client, action.issue_id);
    const item = history.find((item) => item.id === id) || null;
    return NextResponse.json({ code: 0, message: 'success', data: item });
  } catch (err) {
    const message = err instanceof Error ? err.message : '加载整改记录失败';
    return NextResponse.json({ code: 1, message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const client = getSupabaseClient();
  const auth = await requireRectificationAccess(request, client, id);
  if (isAuthResponse(auth)) return auth;

  const body = await request.json();
  const { data, error } = await updateRectificationAction(client, id, {
    actionPlan: body.action_plan,
    responsiblePerson: body.responsible_person,
    responsibleDept: body.responsible_dept,
    planCompleteDate: body.plan_complete_date,
    actualCompleteDate: body.actual_complete_date,
    status: body.status,
    note: body.note,
  });

  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: '更新成功', data });
}
