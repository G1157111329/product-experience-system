import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET: Get a platform setting by key
export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const key = request.nextUrl.searchParams.get('key');
  if (!key) return NextResponse.json({ code: 1, message: '缺少 key 参数' }, { status: 400 });

  const { data, error } = await client.from('platform_settings').select('value').eq('key', key).maybeSingle();
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: 'success', data: data?.value || null });
}

// PUT: Update a platform setting (admin only)
export async function PUT(request: NextRequest) {
  const client = getSupabaseClient();
  const body = await request.json();
  const { key, value, admin_user_id } = body;

  if (!key || !value) return NextResponse.json({ code: 1, message: '参数不完整' }, { status: 400 });

  // Verify admin
  if (admin_user_id) {
    const { data: admin } = await client.from('platform_users').select('role').eq('id', admin_user_id).maybeSingle();
    if (!admin || admin.role !== 'admin') return NextResponse.json({ code: 1, message: '无权限' }, { status: 403 });
  }

  const { error } = await client.from('platform_settings').upsert({
    key, value, updated_at: new Date().toISOString(),
  }, { onConflict: 'key' });

  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: '设置已保存' });
}
