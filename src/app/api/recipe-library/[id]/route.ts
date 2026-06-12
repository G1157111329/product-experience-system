import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { isAuthResponse, requireAdmin } from '@/lib/server/auth';

type IdRow = { id: string };

// PUT: Update a recipe library item (name, product_category, product, ingredients, recipe_type)
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const admin = await requireAdmin(request, client);
  if (isAuthResponse(admin)) return admin;

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

// DELETE: Delete a recipe library item (steps cascade delete)
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const admin = await requireAdmin(request, client);
  if (isAuthResponse(admin)) return admin;

  // Get all step IDs for this recipe
  const { data: steps } = await client.from('recipe_library_steps').select('id').eq('recipe_library_id', id);
  const stepIds = ((steps || []) as IdRow[]).map((s) => s.id);

  // Unlink materials associated with these steps (don't delete them, just remove the association)
  if (stepIds.length > 0) {
    await client.from('materials').update({ recipe_library_step_id: null }).in('recipe_library_step_id', stepIds);
  }

  // Delete steps
  await client.from('recipe_library_steps').delete().eq('recipe_library_id', id);

  const { error } = await client.from('recipe_library').delete().eq('id', id);
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: '删除成功' });
}
