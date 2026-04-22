import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// PUT: Update a recipe library item (name, product_category, product, ingredients, recipe_type)
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const body = await request.json();

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.product_category !== undefined) updates.product_category = body.product_category || null;
  if (body.product !== undefined) updates.product = body.product || null;
  if (body.ingredients !== undefined) updates.ingredients = body.ingredients || null;
  if (body.recipe_type !== undefined) updates.recipe_type = body.recipe_type;

  // Check name uniqueness if name is being changed
  if (body.name) {
    const { data: existing } = await client.from('recipe_library').select('id').eq('name', body.name);
    if (existing && existing.length > 0 && existing[0].id !== id) {
      return NextResponse.json({ code: 1, message: '已存在同名食谱' }, { status: 400 });
    }
  }

  const { data, error } = await client.from('recipe_library').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: '更新成功', data });
}
