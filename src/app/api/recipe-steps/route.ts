import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const recipe_id = searchParams.get('recipe_id');
  if (!recipe_id) return NextResponse.json({ code: 1, message: '缺少 recipe_id' }, { status: 400 });

  const { data, error } = await client
    .from('recipe_steps')
    .select('*')
    .eq('recipe_id', recipe_id)
    .order('step_number', { ascending: true });

  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: 'success', data });
}

export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const body = await request.json();

  const { data, error } = await client.from('recipe_steps').insert({
    recipe_id: body.recipe_id,
    step_number: body.step_number || 1,
    operation: body.operation,
    problem_point: body.problem_point || null,
    sort_order: body.sort_order || 0,
  }).select().single();

  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: '创建成功', data });
}
