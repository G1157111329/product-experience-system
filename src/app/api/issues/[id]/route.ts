import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canManageIssue, canMutateIssueRetest, canReadIssue, canReadReport, forbidden, isAuthResponse, isRecipeContextInTask, requireUser, type AuthUser } from '@/lib/server/auth';
import { getDictCodeSet } from '@/lib/server/dictionaries';
import {
  IssueStatusTransitionError,
  type IssueStatus,
  toStoredIssueStatus,
} from '@/lib/server/issue-state-machine';
import { deleteIssueWithMaterialCleanup } from '@/lib/server/issue-delete-service';
import { executeIssueCommand } from '@/lib/server/issue-rectification-service';
import { isContentDeletionForbidden } from '@/lib/server/content-delete-service';

async function requireIssueReadPermission(
  request: NextRequest,
  client: ReturnType<typeof getSupabaseClient>,
  id: string,
) {
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  if (!(await canReadIssue(client, user, id))) return forbidden();
  return user;
}

const TRANSITION_ACTION_FIELDS: Record<string, Set<string>> = {
  triage: new Set(),
  assign: new Set(['responsible_person', 'responsible_dept', 'plan_complete_date']),
  start_rectify: new Set(['improve_plan', 'responsible_person', 'responsible_dept', 'plan_complete_date']),
  submit_verification: new Set(['verification_note', 'actual_complete_date']),
  verify: new Set(['verification_note', 'actual_complete_date']),
  waive: new Set(['is_improve', 'no_improve_reason']),
  return_to_rectifying: new Set(['verification_note', 'improve_plan']),
};

function isTransitionActionPayload(body: Record<string, unknown>) {
  const transition = typeof body.transition === 'string' ? body.transition : '';
  const allowed = TRANSITION_ACTION_FIELDS[transition] ?? new Set<string>();
  return (Boolean(transition) || body.status !== undefined)
    && Object.keys(body).every((key) => key === 'transition' || key === 'status' || key === 'version' || allowed.has(key));
}

type IssueRow = Record<string, unknown> & {
  task_id: string;
  record_id?: string | null;
  source_report_id?: string | null;
  recipe_id?: string | null;
  recipe_step_id?: string | null;
};

async function enrichIssueProjection(
  client: ReturnType<typeof getSupabaseClient>,
  user: AuthUser,
  issue: IssueRow,
) {
  const stepResult = issue.recipe_step_id
    ? await client.from('recipe_steps').select('id, recipe_id, step_number, operation').eq('id', issue.recipe_step_id).maybeSingle()
    : { data: null };
  const recipeId = issue.recipe_id || stepResult.data?.recipe_id || null;
  const canReadSourceReport = issue.source_report_id
    ? await canReadReport(client, user, String(issue.source_report_id))
    : false;
  const [taskResult, recordResult, reportResult, recipeResult] = await Promise.all([
    client.from('experience_tasks').select('id, task_name, task_no').eq('id', issue.task_id).maybeSingle(),
    issue.record_id
      ? client.from('check_records').select('id, task_id, check_item, evaluation_result').eq('id', issue.record_id).maybeSingle()
      : Promise.resolve({ data: null }),
    canReadSourceReport
      ? client.from('reports').select('id, title, report_no').eq('id', issue.source_report_id).maybeSingle()
      : Promise.resolve({ data: null }),
    recipeId
      ? client.from('recipes').select('id, task_id, name').eq('id', recipeId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return {
    ...issue,
    provenance: {
      task: taskResult.data,
      record: recordResult.data,
      report: reportResult.data,
      recipe: recipeResult.data,
      recipe_step: stepResult.data,
    },
  };
}

async function enrichIssueProjectionSafely(
  client: ReturnType<typeof getSupabaseClient>,
  user: AuthUser,
  issue: IssueRow,
) {
  try {
    return await enrichIssueProjection(client, user, issue);
  } catch (error) {
    console.error('[issues] issue projection enrichment failed after mutation', {
      issueId: issue.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return issue;
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const auth = await requireIssueReadPermission(request, client, id);
  if (isAuthResponse(auth)) return auth;

  const { data, error } = await client.from('issues').select('*').eq('id', id).single();
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 404 });
  return NextResponse.json({
    code: 0,
    message: 'success',
    data: await enrichIssueProjection(client, auth, data),
  });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const auth = await requireUser(request, client);
  if (isAuthResponse(auth)) return auth;
  const user = auth;

  const body = await request.json() as Record<string, unknown>;
  const canUpdate = isTransitionActionPayload(body)
    ? await canMutateIssueRetest(client, user, id)
    : await canManageIssue(client, user, id);
  if (!canUpdate) return forbidden();

  if (body.recipe_id !== undefined || body.recipe_step_id !== undefined) {
    const { data: currentIssue } = await client
      .from('issues')
      .select('task_id, recipe_id, recipe_step_id')
      .eq('id', id)
      .maybeSingle();
    const recipeId = body.recipe_id === undefined ? currentIssue?.recipe_id : body.recipe_id;
    const recipeStepId = body.recipe_step_id === undefined ? currentIssue?.recipe_step_id : body.recipe_step_id;
    if (!currentIssue?.task_id || !(await isRecipeContextInTask(
      client,
      String(currentIssue.task_id),
      recipeId as string | null | undefined,
      recipeStepId as string | null | undefined,
    ))) {
      return NextResponse.json({ code: 1, message: '食谱或步骤不属于当前体验计划' }, { status: 400 });
    }
  }

  if (body.level !== undefined) {
    const allowed = await getDictCodeSet('issue_severity_dict');
    if (!allowed.has(String(body.level))) {
      return NextResponse.json({ code: 1, message: '无效的问题等级' }, { status: 400 });
    }
  }

  // V3.1.1 §27.2.6: validate against server-side dictionaries with frozen fallback.
  // V4.0: transitions are validated against the state machine.
  if (body.status !== undefined || body.transition !== undefined) {
    const allowed = await getDictCodeSet('issue_status_dict');
    const requestedStatus = body.status === undefined ? undefined : toStoredIssueStatus(String(body.status));
    // 字典异常时仍只允许四个权威状态，避免旧八态重新写回数据库。
    const machineStatuses: IssueStatus[] = ['open', 'rectifying', 'verified_closed', 'waived'];
    const isAllowed = !requestedStatus || allowed.has(requestedStatus) || machineStatuses.includes(requestedStatus);
    if (!isAllowed) {
      return NextResponse.json({ code: 1, message: '无效的问题状态' }, { status: 400 });
    }

    if (typeof body.transition !== 'string') {
      return NextResponse.json({ code: 1, message: 'An explicit transition command is required to change issue status' }, { status: 422 });
    }
    try {
      await executeIssueCommand({
        issueId: id,
        actorId: user.id,
        command: body.transition as Parameters<typeof executeIssueCommand>[0]['command'],
        requestedStatus,
        expectedVersion: typeof body.version === 'number' ? body.version : undefined,
        fields: body,
      });
      const { data, error } = await client.from('issues').select('*').eq('id', id).single();
      if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
      return NextResponse.json({ code: 0, message: '更新成功', data: await enrichIssueProjectionSafely(client, user, data) });
    } catch (error) {
      if (error instanceof IssueStatusTransitionError) {
        return NextResponse.json({ code: 1, message: error.message }, { status: 422 });
      }
      return NextResponse.json(
        { code: 1, message: error instanceof Error ? error.message : '问题状态事务失败' },
        { status: error instanceof Error && error.message === 'issue version conflict' ? 409 : 500 },
      );
    }
  }

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const allowedFields = [
    'title', 'category', 'sub_category', 'severity', 'priority', 'level',
    'source', 'source_report_id', 'source_type',
    'description',
    'is_improve', 'no_improve_reason', 'improve_plan', 'responsible_dept',
    'responsible_person', 'plan_complete_date', 'actual_complete_date',
    'is_closed', 'verification_note', 'product_model',
    'recipe_id', 'recipe_step_id',
  ];

  for (const field of allowedFields) {
    if (body[field] !== undefined) updateData[field] = body[field];
  }
  const { data, error } = await client.from('issues').update(updateData).eq('id', id).select().single();
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });

  return NextResponse.json({ code: 0, message: '更新成功', data: await enrichIssueProjection(client, user, data) });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const auth = await requireUser(request, client);
  if (isAuthResponse(auth)) return auth;
  if (!(await canManageIssue(client, auth, id))) return forbidden();

  try {
    const deleted = await deleteIssueWithMaterialCleanup(id, auth.id);
    if (!deleted) return NextResponse.json({ code: 1, message: '问题不存在' }, { status: 404 });
  } catch (error) {
    if (isContentDeletionForbidden(error)) return NextResponse.json({ code: 1, message: error.message }, { status: 403 });
    return NextResponse.json(
      { code: 1, message: error instanceof Error ? error.message : '问题删除事务失败' },
      { status: 500 },
    );
  }
  return NextResponse.json({ code: 0, message: '删除成功' });
}
