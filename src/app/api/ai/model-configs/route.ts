import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { isAuthResponse, requireAdmin } from '@/lib/server/auth';
import { assertSafeAIEndpoint, normalizeChatCompletionsUrl } from '@/lib/server/ai';
import { encryptSecret, isEncryptedSecret } from '@/lib/server/secret-crypto';
import { writeSecurityAudit } from '@/lib/server/security-audit';

function sanitizeAIConfig(item: Record<string, unknown>) {
  const { custom_api_key_encrypted: customApiKeyEncrypted, customApiKeyEncrypted: camelCustomApiKeyEncrypted, ...rest } = item;
  return {
    ...rest,
    has_custom_api_key: Boolean(customApiKeyEncrypted || camelCustomApiKeyEncrypted),
  };
}

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const admin = await requireAdmin(request, client);
  if (isAuthResponse(admin)) return admin;

  const { data, error } = await client
    .from('ai_model_configs')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ code: 1, message: '查询失败' }, { status: 500 });
  const sanitized = (data || []).map((item: Record<string, unknown>) => sanitizeAIConfig(item));
  return NextResponse.json({ code: 0, message: 'success', data: sanitized });
}

export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const admin = await requireAdmin(request, client);
  if (isAuthResponse(admin)) return admin;

  const body = await request.json();
  const customApiKey = body.custom_api_key || body.customApiKey || body.custom_api_key_encrypted;
  const customApiUrl = body.custom_api_url || body.customApiUrl || null;
  if (customApiUrl) assertSafeAIEndpoint(normalizeChatCompletionsUrl(String(customApiUrl)));

  const payload: Record<string, unknown> = {
    name: body.name || 'AI模型配置',
    provider: body.provider || 'custom',
    model: body.model || '',
    temperature: normalizeTemperatureScale(body.temperature),
    max_tokens: Number(body.max_tokens || body.maxTokens || 2400),
    supports_vision: Boolean(body.supports_vision ?? body.supportsVision),
    custom_api_url: customApiUrl,
    created_by: admin.id,
    updated_at: new Date().toISOString(),
  };
  if (!body.id || customApiKey) {
    payload.custom_api_key_encrypted = customApiKey
      ? (isEncryptedSecret(customApiKey) ? customApiKey : encryptSecret(String(customApiKey)))
      : null;
  }

  const query = body.id
    ? client.from('ai_model_configs').update(payload).eq('id', body.id).select().single()
    : client.from('ai_model_configs').insert(payload).select().single();

  const { data, error } = await query;
  if (error) return NextResponse.json({ code: 1, message: '保存失败' }, { status: 500 });
  await writeSecurityAudit(client, {
    request,
    actor: admin,
    action: body.id ? 'ai_model_config.update' : 'ai_model_config.create',
    outcome: 'success',
    targetType: 'ai_model_config',
    targetId: data?.id ? String(data.id) : null,
    metadata: { provider: payload.provider, model: payload.model, hasApiKey: Boolean(customApiKey) },
  });
  return NextResponse.json({ code: 0, message: '模型配置已保存', data: sanitizeAIConfig(data as Record<string, unknown>) });
}

export async function PUT(request: NextRequest) {
  const client = getSupabaseClient();
  const admin = await requireAdmin(request, client);
  if (isAuthResponse(admin)) return admin;

  const body = await request.json();
  if (!body.id) return NextResponse.json({ code: 1, message: '缺少配置 ID' }, { status: 400 });

  await client.from('ai_model_configs').update({ is_active: false, updated_at: new Date().toISOString() }).neq('id', body.id);
  const { data, error } = await client
    .from('ai_model_configs')
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq('id', body.id)
    .select()
    .single();

  if (error) return NextResponse.json({ code: 1, message: '启用失败' }, { status: 500 });
  await writeSecurityAudit(client, {
    request,
    actor: admin,
    action: 'ai_model_config.activate',
    outcome: 'success',
    targetType: 'ai_model_config',
    targetId: String(body.id),
  });
  return NextResponse.json({ code: 0, message: '模型配置已启用', data: sanitizeAIConfig(data as Record<string, unknown>) });
}

export async function DELETE(request: NextRequest) {
  const client = getSupabaseClient();
  const admin = await requireAdmin(request, client);
  if (isAuthResponse(admin)) return admin;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) return NextResponse.json({ code: 1, message: '缺少配置 ID' }, { status: 400 });

  const { error } = await client.from('ai_model_configs').delete().eq('id', id);
  if (error) return NextResponse.json({ code: 1, message: '删除失败' }, { status: 500 });
  await writeSecurityAudit(client, {
    request,
    actor: admin,
    action: 'ai_model_config.delete',
    outcome: 'success',
    targetType: 'ai_model_config',
    targetId: id,
  });
  return NextResponse.json({ code: 0, message: '已删除' });
}

function normalizeTemperatureScale(value: unknown) {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return 5;
  if (num <= 1) return Math.round(num * 10);
  return Math.min(10, Math.max(0, Math.round(num)));
}
