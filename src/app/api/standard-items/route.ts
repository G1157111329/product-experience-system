import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const standard_id = searchParams.get('standard_id');

  if (!standard_id) {
    return NextResponse.json({ code: 1, message: '缺少 standard_id' }, { status: 400 });
  }

  const { data, error } = await client
    .from('standard_items')
    .select('*')
    .eq('standard_id', standard_id)
    .order('sort_order', { ascending: true });

  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: 'success', data });
}

export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const body = await request.json();

  // 批量插入支持
  if (Array.isArray(body)) {
    const { data, error } = await client.from('standard_items').insert(body).select();
    if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
    return NextResponse.json({ code: 0, message: '批量创建成功', data });
  }

  const { data, error } = await client.from('standard_items').insert({
    standard_id: body.standard_id,
    sort_order: body.sort_order || 0,
    sensory_dimension: body.sensory_dimension,
    test_phase: body.test_phase,
    check_dimension: body.check_dimension,
    check_item: body.check_item,
    check_requirement: body.check_requirement,
    measurement_position: body.measurement_position,
    check_tool: body.check_tool,
    standard_a: body.standard_a,
    standard_b: body.standard_b,
    standard_c: body.standard_c,
    problem_level: body.problem_level,
  }).select().single();

  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: '创建成功', data });
}
