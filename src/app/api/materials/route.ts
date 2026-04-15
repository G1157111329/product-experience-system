import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const task_id = searchParams.get('task_id');
  const record_id = searchParams.get('record_id');

  let query = client.from('materials').select('*');
  if (task_id) query = query.eq('task_id', task_id);
  if (record_id) query = query.eq('record_id', record_id);

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });

  // 动态生成签名URL
  return NextResponse.json({ code: 0, message: 'success', data });
}

export async function DELETE(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) return NextResponse.json({ code: 1, message: '缺少id' }, { status: 400 });

  const { error } = await client.from('materials').delete().eq('id', id);
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: '删除成功' });
}
