import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessTask, forbidden, isAuthResponse, requireUser } from '@/lib/server/auth';

const ISSUE_STATUSES = new Set(['待整改', '整改中', '已验证', '不整改']);
const ISSUE_LEVELS = new Set(['一类', '二类', '三类']);

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

  const body = await request.json();

  if (body.status !== undefined && !ISSUE_STATUSES.has(body.status)) {
    return NextResponse.json({ code: 1, message: '无效的问题状态' }, { status: 400 });
  }

  if (body.level !== undefined && !ISSUE_LEVELS.has(body.level)) {
    return NextResponse.json({ code: 1, message: '无效的问题等级' }, { status: 400 });
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

  const { data, error } = await client.from('issues').update(updateData).eq('id', id).select().single();
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
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
