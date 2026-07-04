import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessTask, forbidden, isAuthResponse, requireUser } from '@/lib/server/auth';
import { createIssueOccurrence, getIssueOccurrenceTimeline } from '@/lib/server/issue-lifecycle';

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
    const timeline = await getIssueOccurrenceTimeline(client, id);
    return NextResponse.json({ code: 0, message: 'success', data: timeline });
  } catch (err) {
    const message = err instanceof Error ? err.message : '加载出现记录失败';
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
  const { data, error } = await createIssueOccurrence(client, {
    issueId: id,
    reportId: body.report_id ?? null,
    taskId: body.task_id ?? null,
    projectPhase: body.project_phase ?? null,
    occurredOn: body.occurred_on ?? null,
    occurrenceNote: body.occurrence_note ?? null,
    evidenceRefs: body.evidence_refs ?? null,
  });

  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: '创建成功', data });
}
