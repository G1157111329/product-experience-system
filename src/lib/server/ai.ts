import { generatePresignedUrl } from './storage';
import { decryptSecret } from './secret-crypto';
import { writeSecurityAudit } from './security-audit';

type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: unknown) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null }>;
      };
    };
  };
};

export type MessageContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'high' | 'low' } };

export type MessageContent =
  | string
  | MessageContentPart[];

interface InvokeOptions {
  client: SupabaseLike;
  messages: Array<{ role: 'system' | 'user'; content: MessageContent }>;
  defaultModel?: string;
  defaultTemperature?: number;
  maxTokens?: number;
}

export interface ResolvedAIConfig {
  provider: string;
  model: string;
  temperature: number;
  maxTokens: number;
  customApiUrl: string;
  customApiKey: string;
}

interface ResolveOptions {
  defaultModel?: string;
  defaultTemperature?: number;
  maxTokens?: number;
}

const DEFAULT_API_URL = process.env.AI_API_URL || process.env.AI_API_BASE_URL || '';
const DEFAULT_API_KEY = process.env.AI_API_KEY || '';
const DEFAULT_MODEL = process.env.AI_MODEL || '';

export function normalizeChatCompletionsUrl(apiUrl: string): string {
  const trimmed = apiUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (trimmed.endsWith('/chat/completions')) return trimmed;
  return `${trimmed}/chat/completions`;
}

export function assertSafeAIEndpoint(apiUrl: string) {
  const url = new URL(apiUrl);
  const hostname = url.hostname.toLowerCase();
  const allowedHosts = (process.env.AI_ALLOWED_HOSTS || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (allowedHosts.length > 0 && !allowedHosts.includes(hostname)) {
    throw new Error('AI 服务地址不在允许的域名白名单内');
  }
}

export async function resolveAIConfig(
  client: SupabaseLike,
  {
    defaultModel = DEFAULT_MODEL,
    defaultTemperature = 0.5,
    maxTokens = 2400,
  }: ResolveOptions = {},
): Promise<ResolvedAIConfig> {
  const { data: activeModel } = await client
    .from('ai_model_configs')
    .select('*')
    .eq('is_active', true)
    .maybeSingle();

  if (activeModel) {
    return {
      provider: String(activeModel.provider || 'custom'),
      model: String(activeModel.model || defaultModel),
      temperature: normalizeTemperature(activeModel.temperature, defaultTemperature),
      maxTokens: normalizePositiveInt(activeModel.max_tokens ?? activeModel.maxTokens, maxTokens),
      customApiUrl: normalizeChatCompletionsUrl(String(activeModel.custom_api_url || activeModel.customApiUrl || DEFAULT_API_URL)),
      customApiKey: decryptSecret(String(activeModel.custom_api_key_encrypted || activeModel.customApiKeyEncrypted || DEFAULT_API_KEY)),
    };
  }

  const { data: aiConfigData } = await client
    .from('platform_settings')
    .select('value')
    .eq('key', 'ai_config')
    .maybeSingle();

  const legacyValue = (aiConfigData?.value || {}) as Record<string, unknown>;
  return {
    provider: String(legacyValue.provider || 'custom'),
    model: String(legacyValue.model || defaultModel),
    temperature: normalizeTemperature(legacyValue.temperature, defaultTemperature),
    maxTokens,
    customApiUrl: normalizeChatCompletionsUrl(String(legacyValue.custom_api_url || DEFAULT_API_URL)),
    customApiKey: decryptSecret(String(legacyValue.custom_api_key || DEFAULT_API_KEY)),
  };
}

export async function invokeConfiguredAI({
  client,
  messages,
  defaultModel = DEFAULT_MODEL,
  defaultTemperature = 0.5,
  maxTokens = 2400,
}: InvokeOptions): Promise<string> {
  const aiConfig = await resolveAIConfig(client, { defaultModel, defaultTemperature, maxTokens });
  const model = aiConfig.model;
  const temperature = aiConfig.temperature;

  const apiUrl = normalizeChatCompletionsUrl(aiConfig.customApiUrl || DEFAULT_API_URL);
  const apiKey = aiConfig.customApiKey || DEFAULT_API_KEY;

  if (!model.trim() || !apiUrl.trim() || !apiKey.trim()) {
    throw new Error('AI配置未完成，请先在设置页或运行环境中配置 AI 接入信息');
  }
  assertSafeAIEndpoint(apiUrl);
  const aiHost = new URL(apiUrl).hostname;

  let response: Response;
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      signal: AbortSignal.timeout(60000),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: aiConfig.maxTokens,
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'network error';
    await writeSecurityAudit(client, {
      action: 'ai.invoke',
      outcome: 'failed',
      targetType: 'ai_endpoint',
      targetId: aiHost,
      metadata: { model, reason: message.slice(0, 200) },
    });
    throw new Error(`AI服务连接失败: ${message}`);
  }

  if (!response.ok) {
    await writeSecurityAudit(client, {
      action: 'ai.invoke',
      outcome: 'failed',
      targetType: 'ai_endpoint',
      targetId: aiHost,
      metadata: { model, status: response.status },
    });
    throw new Error(`AI服务调用失败(${response.status})`);
  }

  const result = await response.json();
  await writeSecurityAudit(client, {
    action: 'ai.invoke',
    outcome: 'success',
    targetType: 'ai_endpoint',
    targetId: aiHost,
    metadata: { model, maxTokens: aiConfig.maxTokens },
  });
  return result.choices?.[0]?.message?.content || '';
}

export function extractJsonObject<T extends object>(content: string, fallback: T): T {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return fallback;
    return { ...fallback, ...JSON.parse(jsonMatch[0]) } as T;
  } catch {
    return fallback;
  }
}

function normalizeTemperature(value: unknown, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(num)) return fallback;
  if (num > 1) return Math.min(1, Math.max(0, num / 10));
  return Math.min(1, Math.max(0, num));
}

function normalizePositiveInt(value: unknown, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.floor(num);
}

/**
 * Presign S3 keys to HTTP URLs for AI vision models.
 */
export async function presignMaterialUrls(
  materials: Array<{ file_url?: string | null; file_path?: string | null; material_type: string }>,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();

  const toPresign: string[] = [];
  for (const mat of materials) {
    const path = mat.file_path || mat.file_url;
    if (path && !path.startsWith('http')) {
      toPresign.push(path);
    }
  }

  if (toPresign.length === 0) return result;

  try {
    const presignedResults = await Promise.allSettled(
      toPresign.map(async (path) => {
        const url = await generatePresignedUrl({ key: path, expireTime: 86400, absoluteUrl: true });
        return { path, url };
      }),
    );

    for (const r of presignedResults) {
      if (r.status === 'fulfilled' && r.value.url) {
        result.set(r.value.path, r.value.url);
      }
    }
  } catch (err) {
    console.error('[presignMaterialUrls] Error:', err);
  }

  return result;
}

/**
 * Extract presigned image URLs for AI vision models.
 */
export async function getImageUrlsForAI(
  materials: Array<{ file_url?: string | null; file_path?: string | null; material_type: string }>,
): Promise<string[]> {
  const imageMaterials = materials.filter(m => m.material_type === 'image');
  if (imageMaterials.length === 0) return [];

  const presignedMap = await presignMaterialUrls(imageMaterials);

  return imageMaterials.map(mat => {
    const path = mat.file_path || mat.file_url;
    if (path && !path.startsWith('http')) {
      return presignedMap.get(path) || path;
    }
    return path || '';
  }).filter(Boolean);
}
