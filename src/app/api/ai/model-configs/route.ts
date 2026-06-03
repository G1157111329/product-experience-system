import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { assertAdmin } from '@/lib/server/agent-skills';

export async function GET() {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('ai_model_configs')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  const sanitized = (data || []).map((item: Record<string, unknown>) => {
    const { custom_api_key_encrypted: customApiKeyEncrypted, customApiKeyEncrypted: camelCustomApiKeyEncrypted, ...rest } = item;
    return {
      ...rest,
      has_custom_api_key: Boolean(customApiKeyEncrypted || camelCustomApiKeyEncrypted),
    };
  });
  return NextResponse.json({ code: 0, message: 'success', data: sanitized });
}

export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const body = await request.json();

  try {
    await assertAdmin(client, body.admin_user_id);
  } catch (err) {
    const message = err instanceof Error ? err.message : '无权限';
    return NextResponse.json({ code: 1, message }, { status: 403 });
  }

  const customApiKey = body.custom_api_key || body.customApiKey || body.custom_api_key_encrypted;
  const payload: Record<string, unknown> = {
    name: body.name || 'AI模型配置',
    provider: body.provider || 'custom',
    model: body.model || '',
    temperature: normalizeTemperatureScale(body.temperature),
    max_tokens: Number(body.max_tokens || body.maxTokens || 2400),
    supports_vision: Boolean(body.supports_vision ?? body.supportsVision),
    custom_api_url: body.custom_api_url || body.customApiUrl || null,
    created_by: body.admin_user_id || null,
    updated_at: new Date().toISOString(),
  };
  if (!body.id || customApiKey) {
    payload.custom_api_key_encrypted = customApiKey || null;
  }

  const query = body.id
    ? client.from('ai_model_configs').update(payload).eq('id', body.id).select().single()
    : client.from('ai_model_configs').insert(payload).select().single();

  const { data, error } = await query;
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: '模型配置已保存', data });
}

export async function PUT(request: NextRequest) {
  const client = getSupabaseClient();
  const body = await request.json();

  try {
    await assertAdmin(client, body.admin_user_id);
  } catch (err) {
    const message = err instanceof Error ? err.message : '无权限';
    return NextResponse.json({ code: 1, message }, { status: 403 });
  }

  if (!body.id) return NextResponse.json({ code: 1, message: '缺少配置 ID' }, { status: 400 });

  await client.from('ai_model_configs').update({ is_active: false, updated_at: new Date().toISOString() }).neq('id', body.id);
  const { data, error } = await client
    .from('ai_model_configs')
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq('id', body.id)
    .select()
    .single();

  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: '模型配置已启用', data });
}

export async function DELETE(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const adminUserId = searchParams.get('admin_user_id');

  if (!id) return NextResponse.json({ code: 1, message: '缺少配置 ID' }, { status: 400 });

  try {
    await assertAdmin(client, adminUserId);
  } catch (err) {
    const message = err instanceof Error ? err.message : '无权限';
    return NextResponse.json({ code: 1, message }, { status: 403 });
  }

  const { error } = await client.from('ai_model_configs').delete().eq('id', id);
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: '已删除' });
}

function normalizeTemperatureScale(value: unknown) {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return 5;
  if (num <= 1) return Math.round(num * 10);
  return Math.min(10, Math.max(0, Math.round(num)));
}
