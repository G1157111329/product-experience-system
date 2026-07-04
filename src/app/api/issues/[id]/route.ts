import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessTask, forbidden, isAuthResponse, requireUser } from '@/lib/server/auth';
import { getDictCodeSet } from '@/lib/server/dictionaries';
import {
  applyTransition,
  canTransition,
  type IssueStatus,
  normalizeIssueStatus,
} from '@/lib/server/issue-state-machine';
import { createRectificationAction } from '@/lib/server/issue-lifecycle';

async function requireIssueAccess(request: NextRequest, client: ReturnType<typeof getSupabaseClient>, id: string) {
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  const { data: issue } = await client.from('issues').select('task_id').eq('id', id).maybeSingle();
  if (!issue?.task_id || !(await canAccessTask(client, user, String(issue.task_id)))) return forbidden();
  return user;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const auth = await requireIssueAccess(request, client, id);
  if (isAuthResponse(auth)) return auth;

  const { data, error } = await client.from('issues').select('*').eq('id', id).single();
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 404 });
  return NextResponse.json({ code: 0, message: 'success', data });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const auth = await requireIssueAccess(request, client, id);
  if (isAuthResponse(auth)) return auth;
  const user = auth;

  const body = await request.json();

  // V3.1.1 §27.2.6: validate against server-side dictionaries with frozen fallback.
  // V4.0: transitions are validated against the state machine.
  let targetStatus: IssueStatus | undefined;
  if (body.status !== undefined) {
    const allowed = await getDictCodeSet('issue_status_dict');
    targetStatus = normalizeIssueStatus(body.status);
    // 字典校验失败时，回退到状态机合法状态集合（8 个英文枚举），避免字典表异常阻断业务
    const machineStatuses: IssueStatus[] = ['open', 'triaged', 'assigned', 'rectifying', 'pending_verification', 'verified_closed', 'waived', 'reopened'];
    const isAllowed = allowed.has(targetStatus) || machineStatuses.includes(targetStatus);
    if (!isAllowed) {
      return NextResponse.json({ code: 1, message: '无效的问题状态' }, { status: 400 });
    }

    const { data: current } = await client.from('issues').select('status').eq('id', id).single();
    const currentStatus = normalizeIssueStatus(current?.status);
    if (currentStatus !== targetStatus) {
      const transition = body.transition;
      if (transition) {
        // 显式指定转换：严格校验状态机
        if (!canTransition(currentStatus, transition, user.role)) {
          return NextResponse.json(
            { code: 1, message: `当前状态「${currentStatus}」不允许转换为「${targetStatus}」` },
            { status: 400 },
          );
        }
        targetStatus = applyTransition(currentStatus, transition);
      }
      // 未指定 transition：视为用户手动直接设置状态（如标记"已整改"），允许合法状态间自由切换
    }
  }

  if (body.level !== undefined) {
    const allowed = await getDictCodeSet('issue_severity_dict');
    if (!allowed.has(body.level)) {
      return NextResponse.json({ code: 1, message: '无效的问题等级' }, { status: 400 });
    }
  }

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const allowedFields = [
    'title', 'category', 'sub_category', 'severity', 'priority', 'level',
    'source', 'source_report_id', 'source_type',
    'description',
    'is_improve', 'no_improve_reason', 'improve_plan', 'responsible_dept',
    'responsible_person', 'plan_complete_date', 'actual_complete_date',
    'is_closed', 'status', 'verification_note', 'product_model',
  ];

  for (const field of allowedFields) {
    if (body[field] !== undefined) updateData[field] = body[field];
  }
  if (targetStatus !== undefined) updateData.status = targetStatus;

  const { data, error } = await client.from('issues').update(updateData).eq('id', id).select().single();
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });

  if (targetStatus === 'rectifying') {
    await createRectificationAction(client, {
      issueId: id,
      actionPlan: body.improve_plan || body.action_plan || '开始整改',
      responsiblePerson: body.responsible_person ?? null,
      responsibleDept: body.responsible_dept ?? null,
      planCompleteDate: body.plan_complete_date ?? null,
      note: body.note ?? null,
      createdBy: user.id,
    });
  }

  return NextResponse.json({ code: 0, message: '更新成功', data });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const auth = await requireIssueAccess(request, client, id);
  if (isAuthResponse(auth)) return auth;

  const { error } = await client.from('issues').delete().eq('id', id);
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: '删除成功' });
}