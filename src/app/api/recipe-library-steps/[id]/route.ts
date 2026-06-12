import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { isAuthResponse, requireAdmin } from '@/lib/server/auth';

// PUT: Update a single step
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const admin = await requireAdmin(request, client);
  if (isAuthResponse(admin)) return admin;

  const body = await request.json();

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.operation !== undefined) updates.operation = body.operation;
  if (body.step_number !== undefined) updates.step_number = body.step_number;
  if (body.problem_point !== undefined) updates.problem_point = body.problem_point || null;
  if (body.problem_points !== undefined) updates.problem_points = body.problem_points || [];

  const { data, error } = await client.from('recipe_library_steps').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: '更新成功', data });
}

// DELETE: Delete a step (and its associated materials)
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const admin = await requireAdmin(request, client);
  if (isAuthResponse(admin)) return admin;

  // Unlink materials associated with this step (don't delete them, just remove the association)
  await client.from('materials').update({ recipe_library_step_id: null }).eq('recipe_library_step_id', id);

  const { error } = await client.from('recipe_library_steps').delete().eq('id', id);
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: '删除成功' });
}
