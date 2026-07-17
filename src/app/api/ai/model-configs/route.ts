import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { isAuthResponse, requireAdmin } from '@/lib/server/auth';
import { probeAIConfiguration } from '@/lib/server/ai';
import { decryptSecret, encryptSecret, isEncryptedSecret } from '@/lib/server/secret-crypto';
import { buildFinalAIModelConfig, resolveAIConfigProbeInput } from '@/lib/server/ai-config-save-gate';
import { writeSecurityAudit } from '@/lib/server/security-audit';

function sanitizeAIConfig(item: Record<string, unknown>) {
  const { custom_api_key_encrypted: customApiKeyEncrypted, customApiKeyEncrypted: camelCustomApiKeyEncrypted, ...rest } = item;
  return { ...rest, has_custom_api_key: Boolean(customApiKeyEncrypted || camelCustomApiKeyEncrypted) };
}

async function probeFinalModelConfig(payload: Record<string, unknown>) {
  const probeInput = resolveAIConfigProbeInput({ body: payload, decryptExistingKey: decryptSecret });
  await probeAIConfiguration({
    ...probeInput,
    apiKey: isEncryptedSecret(probeInput.apiKey) ? decryptSecret(probeInput.apiKey) : probeInput.apiKey,
  });
}

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const admin = await requireAdmin(request, client);
  if (isAuthResponse(admin)) return admin;

  const { data, error } = await client.from('ai_model_configs').select('*').order('created_at', { ascending: false });
  if (error) return NextResponse.json({ code: 1, message: '查询失败' }, { status: 500 });
  return NextResponse.json({ code: 0, message: 'success', data: (data || []).map((item: Record<string, unknown>) => sanitizeAIConfig(item)) });
}

export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const admin = await requireAdmin(request, client);
  if (isAuthResponse(admin)) return admin;

  const body = await request.json() as Record<string, unknown>;
  let existing: Record<string, unknown> | null = null;
  if (body.id) {
    const { data, error } = await client.from('ai_model_configs').select('*').eq('id', body.id).maybeSingle();
    if (error) return NextResponse.json({ code: 1, message: '读取现有模型配置失败' }, { status: 500 });
    if (!data) return NextResponse.json({ code: 1, message: '模型配置不存在' }, { status: 404 });
    existing = data as Record<string, unknown>;
  }

  // This single object is both probed and persisted. Omitted edit fields remain intact.
  const payload = buildFinalAIModelConfig({
    body,
    existing,
    encryptNewKey: (value) => encryptSecret(value) || '',
    createdBy: admin.id,
  });
  try {
    await probeFinalModelConfig(payload);
  } catch {
    await writeSecurityAudit(client, {
      request,
      actor: admin,
      action: body.id ? 'ai_model_config.connectivity_probe.update' : 'ai_model_config.connectivity_probe.create',
      outcome: 'failed',
      targetType: 'ai_model_config',
      targetId: body.id ? String(body.id) : null,
      metadata: { provider: payload.provider, model: payload.model },
    });
    return NextResponse.json({ code: 1, message: 'AI 连通性测试失败：请检查调用地址、模型、API Key 和网络后重试' }, { status: 422 });
  }

  payload.updated_at = new Date().toISOString();
  const { data, error } = body.id
    ? await client.from('ai_model_configs').update(payload).eq('id', body.id).select().single()
    : await client.from('ai_model_configs').insert(payload).select().single();
  if (error) return NextResponse.json({ code: 1, message: '保存失败' }, { status: 500 });

  await writeSecurityAudit(client, {
    request,
    actor: admin,
    action: body.id ? 'ai_model_config.update' : 'ai_model_config.create',
    outcome: 'success',
    targetType: 'ai_model_config',
    targetId: data?.id ? String(data.id) : null,
    metadata: { provider: payload.provider, model: payload.model, hasApiKey: Boolean(payload.custom_api_key_encrypted) },
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
  const { data, error } = await client.from('ai_model_configs').update({ is_active: true, updated_at: new Date().toISOString() }).eq('id', body.id).select().single();
  if (error) return NextResponse.json({ code: 1, message: '启用失败' }, { status: 500 });
  await writeSecurityAudit(client, { request, actor: admin, action: 'ai_model_config.activate', outcome: 'success', targetType: 'ai_model_config', targetId: String(body.id) });
  return NextResponse.json({ code: 0, message: '模型配置已启用', data: sanitizeAIConfig(data as Record<string, unknown>) });
}

export async function DELETE(request: NextRequest) {
  const client = getSupabaseClient();
  const admin = await requireAdmin(request, client);
  if (isAuthResponse(admin)) return admin;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ code: 1, message: '缺少配置 ID' }, { status: 400 });
  const { error } = await client.from('ai_model_configs').delete().eq('id', id);
  if (error) return NextResponse.json({ code: 1, message: '删除失败' }, { status: 500 });
  await writeSecurityAudit(client, { request, actor: admin, action: 'ai_model_config.delete', outcome: 'success', targetType: 'ai_model_config', targetId: id });
  return NextResponse.json({ code: 0, message: '已删除' });
}
