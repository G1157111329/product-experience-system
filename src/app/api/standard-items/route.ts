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
    experience_flow: body.experience_flow,
    touch_point: body.touch_point,
    check_dimension: body.check_dimension,
    sub_check_dimension: body.sub_check_dimension,
    check_item: body.check_item,
    check_requirement: body.check_requirement,
    experience_standard: body.experience_standard,
    check_standard: body.check_standard,
    measurement_position: body.measurement_position,
    check_tool: body.check_tool,
    problem_level: body.problem_level,
    evaluation_prep: body.evaluation_prep,
    subjective_score: body.subjective_score,
    subjective_rating: body.subjective_rating,
    reference_images: body.reference_images,
  }).select().single();

  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: '创建成功', data });
}
