import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { isAuthResponse, requireAdmin, requireUser } from '@/lib/server/auth';
import { createApiTimer } from '@/lib/server/api-performance';

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.min(Math.floor(num), max);
}

// GET: List recipe library items, optionally filter by product_category/product, or search by keyword
export async function GET(request: NextRequest) {
  const finishTimer = createApiTimer('recipe-library.GET');
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const { searchParams } = new URL(request.url);
  const product_category = searchParams.get('product_category');
  const product = searchParams.get('product');
  const keyword = searchParams.get('keyword');
  const limit = parsePositiveInt(searchParams.get('limit'), 100, 200);
  const offset = Math.max(0, Number(searchParams.get('offset') || '0') || 0);
  const includeSteps = searchParams.get('include_steps') !== '0';

  const selectFields = includeSteps ? '*, recipe_library_steps(*)' : '*';
  let query = client
    .from('recipe_library')
    .select(selectFields, { count: 'exact' })
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1);

  if (product_category) query = query.eq('product_category', product_category);
  if (product) query = query.eq('product', product);
  if (keyword) query = query.ilike('name', `%${keyword}%`);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });

  // Sort steps by step_number
  const result = (data || []).map((item: Record<string, unknown>) => ({
    ...item,
    recipe_library_steps: ((item.recipe_library_steps || []) as Array<Record<string, unknown>>)
      .sort((a, b) => (a.step_number as number) - (b.step_number as number)),
  }));

  finishTimer({ rows: result.length, total: count, limit, offset, includeSteps });
  return NextResponse.json({
    code: 0,
    message: 'success',
    data: result,
    meta: { limit, offset, total: count || 0, has_more: offset + result.length < (count || 0) },
  });
}

// POST: Create a recipe library item (with optional steps)
export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const admin = await requireAdmin(request, client);
  if (isAuthResponse(admin)) return admin;

  const body = await request.json();
  const { name, product_category, product, ingredients, recipe_type, steps } = body;

  if (!name) return NextResponse.json({ code: 1, message: '食谱名称不能为空' }, { status: 400 });

  // Check uniqueness: same name (regardless of category/product)
  const { data: existing } = await client.from('recipe_library').select('id').eq('name', name);
  if (existing && existing.length > 0) {
    return NextResponse.json({ code: 1, message: '已存在同名食谱' }, { status: 400 });
  }

  const { data, error } = await client.from('recipe_library').insert({
    name, product_category: product_category || null, product: product || null,
    ingredients: ingredients || null, recipe_type: recipe_type || '食谱',
  }).select().single();

  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });

  // Insert steps if provided
  if (data && steps && Array.isArray(steps) && steps.length > 0) {
    const stepInserts = steps.map((s: Record<string, unknown>, i: number) => ({
      recipe_library_id: data.id,
      step_number: i + 1,
      operation: s.operation,
      problem_point: s.problem_point || null,
      problem_points: s.problem_points || [],
    }));
    await client.from('recipe_library_steps').insert(stepInserts);
  }

  return NextResponse.json({ code: 0, message: '创建成功', data });
}
