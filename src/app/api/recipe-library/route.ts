import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET: List recipe library items, optionally filter by product_category/product, or search by keyword
export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const product_category = searchParams.get('product_category');
  const product = searchParams.get('product');
  const keyword = searchParams.get('keyword');

  let query = client.from('recipe_library').select('*, recipe_library_steps(*)').order('created_at', { ascending: true });

  if (product_category) query = query.eq('product_category', product_category);
  if (product) query = query.eq('product', product);
  if (keyword) query = query.ilike('name', `%${keyword}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });

  // Sort steps by step_number
  const result = (data || []).map((item: Record<string, unknown>) => ({
    ...item,
    recipe_library_steps: ((item.recipe_library_steps || []) as Array<Record<string, unknown>>)
      .sort((a, b) => (a.step_number as number) - (b.step_number as number)),
  }));

  return NextResponse.json({ code: 0, message: 'success', data: result });
}

// POST: Create a recipe library item (with optional steps)
export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const body = await request.json();
  const { name, product_category, product, ingredients, recipe_type, steps } = body;

  if (!name) return NextResponse.json({ code: 1, message: '食谱名称不能为空' }, { status: 400 });

  // Check uniqueness: same product_category + product + name
  let dupQuery = client.from('recipe_library').select('id').eq('name', name);
  if (product_category) dupQuery = dupQuery.eq('product_category', product_category);
  else dupQuery = dupQuery.is('product_category', null);
  if (product) dupQuery = dupQuery.eq('product', product);
  else dupQuery = dupQuery.is('product', null);

  const { data: existing } = await dupQuery;
  if (existing && existing.length > 0) {
    return NextResponse.json({ code: 1, message: '该品类-产品下已存在同名食谱' }, { status: 400 });
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
