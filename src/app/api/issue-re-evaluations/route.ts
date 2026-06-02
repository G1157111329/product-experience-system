import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/issue-re-evaluations?issue_id=xxx or ?issue_ids=id1,id2 — list re-evaluations for issue(s)
export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const issueId = searchParams.get('issue_id');
  const issueIds = searchParams.get('issue_ids');

  if (!issueId && !issueIds) {
    return NextResponse.json({ code: 1, message: '缺少 issue_id 或 issue_ids 参数' }, { status: 400 });
  }

  let query = client
    .from('issue_re_evaluations')
    .select('*');

  if (issueId) {
    query = query.eq('issue_id', issueId);
  } else if (issueIds) {
    query = query.in('issue_id', issueIds.split(','));
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ code: 1, message: '查询失败: ' + error.message }, { status: 500 });
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

  const result = (data || []).map((r: Record<string, unknown>) => ({
    ...r,
    materials: materialsMap[r.id as string] || [],
  }));

  return NextResponse.json({ code: 0, data: result });
}

// POST /api/issue-re-evaluations — create a new re-evaluation
export async function POST(request: NextRequest) {
  const client = getSupabaseClient();

  try {
    const body = await request.json();
    const { issue_id, description, created_by } = body;

    if (!issue_id) {
      return NextResponse.json({ code: 1, message: '缺少 issue_id' }, { status: 400 });
    }

    const { data, error } = await client
      .from('issue_re_evaluations')
      .insert({
        issue_id,
        description: description || '',
        created_by: created_by || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ code: 1, message: '创建失败: ' + error.message }, { status: 500 });
    }

    return NextResponse.json({ code: 0, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '创建失败';
    return NextResponse.json({ code: 1, message }, { status: 500 });
  }
}
