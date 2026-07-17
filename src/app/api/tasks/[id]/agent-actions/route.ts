import { NextRequest, NextResponse } from 'next/server';
import {
  normalizeAgentActions,
} from '@/lib/agent-actions';
import {
  canAccessTask,
  isAuthResponse,
  requireUser,
} from '@/lib/server/auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { executeTaskActionPlanForUser } from '@/lib/server/hermes/task-action-executor';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: taskId } = await params;
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  if (!(await canAccessTask(client, user, taskId))) {
    return NextResponse.json({ code: 1, message: '无权执行该任务的 AI 动作' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const actions = normalizeAgentActions(body.actions);
  const actionPlanMessageId = typeof body.actionPlanMessageId === 'string' ? body.actionPlanMessageId : null;
  if (actions.length === 0) {
    return NextResponse.json({ code: 1, message: '没有可执行动作' }, { status: 400 });
  }

  const executed = await executeTaskActionPlanForUser({
    taskId,
    user,
    actions,
    actionPlanMessageId,
    request,
  });
  if (executed.conflict) {
    return NextResponse.json({ code: 1, message: executed.message }, { status: 409 });
  }

  return NextResponse.json({
    code: executed.ok ? 0 : 1,
    message: executed.message,
    data: { results: executed.results, actionPlanStatus: executed.actionPlanStatus },
  }, { status: executed.ok ? 200 : 207 });
}
