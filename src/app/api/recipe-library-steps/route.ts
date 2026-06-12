import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { isAuthResponse, requireAdmin, requireUser } from '@/lib/server/auth';

// GET: List steps for a recipe library item
export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const { searchParams } = new URL(request.url);
  const recipe_library_id = searchParams.get('recipe_library_id');

  if (!recipe_library_id) {
    return NextResponse.json({ code: 1, message: 'recipe_library_id required' }, { status: 400 });
  }

  const { data, error } = await client.from('recipe_library_steps')
    .select('*').eq('recipe_library_id', recipe_library_id).order('step_number', { ascending: true });

  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: 'success', data });
}

// POST: Create a step for a recipe library item
export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const admin = await requireAdmin(request, client);
  if (isAuthResponse(admin)) return admin;

  const body = await request.json();
  const { recipe_library_id, step_number, operation, problem_point, problem_points } = body;

  if (!recipe_library_id || !operation) {
    return NextResponse.json({ code: 1, message: '参数不完整' }, { status: 400 });
  }

  const { data, error } = await client.from('recipe_library_steps').insert({
    recipe_library_id,
    step_number: step_number || 1,
    operation,
    problem_point: problem_point || null,
    problem_points: problem_points || [],
  }).select().single();

  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: '创建成功', data });
}

// PUT: Batch update step ordering, or update a single step
export async function PUT(request: NextRequest) {
  const client = getSupabaseClient();
  const admin = await requireAdmin(request, client);
  if (isAuthResponse(admin)) return admin;

  const body = await request.json();

  // Batch reorder: { steps: [{ id, step_number }] }
  if (body.steps && Array.isArray(body.steps)) {
    for (const s of body.steps) {
      await client.from('recipe_library_steps').update({ step_number: s.step_number }).eq('id', s.id);
    }
    return NextResponse.json({ code: 0, message: '排序已更新' });
  }

  return NextResponse.json({ code: 1, message: '无效请求' }, { status: 400 });
}
