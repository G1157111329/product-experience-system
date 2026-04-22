import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const task_id = searchParams.get('task_id');
  const keyword = searchParams.get('keyword');
  const library = searchParams.get('library');

  // Library search: search across all tasks (for recipe referencing)
  if (library) {
    let query = client.from('recipes').select('*, recipe_steps(*)').order('created_at', { ascending: true });
    if (keyword) query = query.ilike('name', `%${keyword}%`);
    const { data, error } = await query.limit(50);
    if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
    return NextResponse.json({ code: 0, message: 'success', data });
  }

  if (!task_id) return NextResponse.json({ code: 1, message: '缺少 task_id' }, { status: 400 });

  const { data, error } = await client
    .from('recipes')
    .select('*, recipe_steps(*)')
    .eq('task_id', task_id)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: 'success', data });
}

export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const body = await request.json();

  const { data, error } = await client.from('recipes').insert({
    task_id: body.task_id,
    name: body.name,
    ingredients: body.ingredients || null,
    recipe_type: body.recipe_type || '食谱',
  }).select().single();

  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: '创建成功', data });
}
