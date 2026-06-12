import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { forbidden, isAuthResponse, requireAdmin, requireUser } from '@/lib/server/auth';
import { assertSafeAIEndpoint, normalizeChatCompletionsUrl } from '@/lib/server/ai';
import { encryptSecret, isEncryptedSecret } from '@/lib/server/secret-crypto';
import { writeSecurityAudit } from '@/lib/server/security-audit';

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const key = request.nextUrl.searchParams.get('key');
  if (!key) return NextResponse.json({ code: 1, message: '缺少 key 参数' }, { status: 400 });
  if (key === 'ai_config' && user.role !== 'admin') return forbidden();

  const { data, error } = await client.from('platform_settings').select('value').eq('key', key).maybeSingle();
  if (error) return NextResponse.json({ code: 1, message: '查询失败' }, { status: 500 });
  if (key === 'ai_config' && data?.value && typeof data.value === 'object') {
    const { custom_api_key: customApiKey, customApiKey: camelCustomApiKey, ...rest } = data.value as Record<string, unknown>;
    return NextResponse.json({
      code: 0,
      message: 'success',
      data: { ...rest, has_custom_api_key: Boolean(customApiKey || camelCustomApiKey) },
    });
  }
  return NextResponse.json({ code: 0, message: 'success', data: data?.value || null });
}

export async function PUT(request: NextRequest) {
  const client = getSupabaseClient();
  const admin = await requireAdmin(request, client);
  if (isAuthResponse(admin)) return admin;

  const body = await request.json();
  const { key } = body;
  let { value } = body;

  if (!key || value === undefined || value === null) {
    return NextResponse.json({ code: 1, message: '参数不完整' }, { status: 400 });
  }

  if (key === 'ai_config' && value && typeof value === 'object') {
    const nextValue = { ...(value as Record<string, unknown>) };
    const apiUrl = nextValue.custom_api_url || nextValue.customApiUrl;
    if (apiUrl) assertSafeAIEndpoint(normalizeChatCompletionsUrl(String(apiUrl)));
    const apiKey = nextValue.custom_api_key || nextValue.customApiKey;
    if (apiKey) {
      nextValue.custom_api_key = isEncryptedSecret(apiKey) ? apiKey : encryptSecret(String(apiKey));
      delete nextValue.customApiKey;
    }
    value = nextValue;
  }

  const { error } = await client.from('platform_settings').upsert({
    key,
    value,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' });

  if (error) return NextResponse.json({ code: 1, message: '保存失败' }, { status: 500 });
  await writeSecurityAudit(client, {
    request,
    actor: admin,
    action: 'platform_setting.update',
    outcome: 'success',
    targetType: 'platform_setting',
    targetId: key,
    metadata: { key, containsSecret: key === 'ai_config' },
  });
  return NextResponse.json({ code: 0, message: '设置已保存' });
}
