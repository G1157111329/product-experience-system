import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const body = await request.json();

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.step_number !== undefined) updateData.step_number = body.step_number;
  if (body.operation !== undefined) updateData.operation = body.operation;
  if (body.problem_point !== undefined) updateData.problem_point = body.problem_point;
  if (body.sort_order !== undefined) updateData.sort_order = body.sort_order;

  const { data, error } = await client.from('recipe_steps').update(updateData).eq('id', id).select().single();

  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: '更新成功', data });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const { error } = await client.from('recipe_steps').delete().eq('id', id);
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: '删除成功' });
}
