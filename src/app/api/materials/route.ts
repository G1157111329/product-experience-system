import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { deleteFile } from '@/lib/server/storage';

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const task_id = searchParams.get('task_id');
  const record_id = searchParams.get('record_id');
  const recipe_step_id = searchParams.get('recipe_step_id');
  const recipe_library_step_id = searchParams.get('recipe_library_step_id');
  const recipe_id = searchParams.get('recipe_id');
  const issue_id = searchParams.get('issue_id');
  const limit = parseInt(searchParams.get('limit') || '100', 10);

  let query = client.from('materials').select('*');
  if (task_id) query = query.eq('task_id', task_id);
  if (record_id) query = query.eq('record_id', record_id);
  if (recipe_step_id) query = query.eq('recipe_step_id', recipe_step_id);
  if (recipe_library_step_id) query = query.eq('recipe_library_step_id', recipe_library_step_id);
  if (recipe_id) query = query.eq('recipe_id', recipe_id);
  if (issue_id) query = query.eq('issue_id', issue_id);

  query = query.order('created_at', { ascending: false }).limit(limit);
  const { data, error } = await query;
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });

  return NextResponse.json({ code: 0, message: 'success', data });
}

export async function PUT(request: NextRequest) {
  const client = getSupabaseClient();
  const body = await request.json();
  const { id, file_name, record_id, recipe_step_id, recipe_id, issue_id, re_evaluation_id } = body;

  if (!id) {
    return NextResponse.json({ code: 1, message: '缺少必要参数' }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};
  if (file_name !== undefined) updateData.file_name = file_name;
  if (record_id !== undefined) updateData.record_id = record_id;
  if (recipe_step_id !== undefined) updateData.recipe_step_id = recipe_step_id;
  if (recipe_id !== undefined) updateData.recipe_id = recipe_id;
  if (issue_id !== undefined) updateData.issue_id = issue_id;
  if (re_evaluation_id !== undefined) updateData.re_evaluation_id = re_evaluation_id;

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ code: 1, message: '没有需要更新的字段' }, { status: 400 });
  }

  const { data, error } = await client
    .from('materials')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: '更新成功', data });
}

export async function DELETE(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) return NextResponse.json({ code: 1, message: '缺少id' }, { status: 400 });

  const { data: material } = await client
    .from('materials')
    .select('file_path, file_url')
    .eq('id', id)
    .single();

  const { error } = await client.from('materials').delete().eq('id', id);
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });

  try {
    const fileKey = (material as { file_path?: string | null; file_url?: string | null } | null)?.file_path
      || (material as { file_path?: string | null; file_url?: string | null } | null)?.file_url;
    await deleteFile(fileKey);
  } catch (storageError) {
    console.error('[materials] Physical file delete failed:', storageError);
    return NextResponse.json({ code: 0, message: '删除成功', warning: 'physical_file_delete_failed' });
  }

  return NextResponse.json({ code: 0, message: '删除成功' });
}
