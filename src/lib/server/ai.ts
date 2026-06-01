import { NextRequest } from 'next/server';
import { Config, HeaderUtils, LLMClient, S3Storage } from 'coze-coding-dev-sdk';

type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: unknown) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null }>;
      };
    };
  };
};

type MessageContent =
  | string
  | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string; detail?: 'high' | 'low' } }>;

interface InvokeOptions {
  request: NextRequest;
  client: SupabaseLike;
  messages: Array<{ role: 'system' | 'user'; content: MessageContent }>;
  defaultModel?: string;
  defaultTemperature?: number;
  maxTokens?: number;
  /** 强制使用的内置SDK模型名，忽略用户ai_config中的model设置（仅对内置SDK调用生效） */
  forceBuiltInModel?: string;
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

export async function resolveAIConfig(
  client: SupabaseLike,
  {
    defaultModel = 'doubao-seed-2-0-pro-260215',
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
      provider: String(activeModel.provider || 'builtin'),
      model: String(activeModel.model || defaultModel),
      temperature: normalizeTemperature(activeModel.temperature, defaultTemperature),
      maxTokens: normalizePositiveInt(activeModel.max_tokens ?? activeModel.maxTokens, maxTokens),
      customApiUrl: String(activeModel.custom_api_url || activeModel.customApiUrl || ''),
      customApiKey: String(activeModel.custom_api_key_encrypted || activeModel.customApiKeyEncrypted || ''),
    };
  }

  const { data: aiConfigData } = await client
    .from('platform_settings')
    .select('value')
    .eq('key', 'ai_config')
    .maybeSingle();

  const legacyValue = (aiConfigData?.value || {}) as Record<string, unknown>;
  return {
    provider: String(legacyValue.provider || 'builtin'),
    model: String(legacyValue.model || defaultModel),
    temperature: normalizeTemperature(legacyValue.temperature, defaultTemperature),
    maxTokens,
    customApiUrl: String(legacyValue.custom_api_url || ''),
    customApiKey: String(legacyValue.custom_api_key || ''),
  };
}

export async function invokeConfiguredAI({
  request,
  client,
  messages,
  defaultModel = 'doubao-seed-2-0-pro-260215',
  defaultTemperature = 0.5,
  maxTokens = 2400,
  forceBuiltInModel,
}: InvokeOptions): Promise<string> {
  const aiConfig = await resolveAIConfig(client, { defaultModel, defaultTemperature, maxTokens });
  const model = aiConfig.provider === 'builtin' && forceBuiltInModel ? forceBuiltInModel : aiConfig.model;
  const temperature = aiConfig.temperature;

  if (aiConfig.provider === 'custom' && aiConfig.customApiUrl && aiConfig.customApiKey) {
    const response = await fetch(aiConfig.customApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aiConfig.customApiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: aiConfig.maxTokens,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI服务调用失败(${response.status})`);
    }

    const result = await response.json();
    return result.choices?.[0]?.message?.content || '';
  }

  const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
  const llmClient = new LLMClient(new Config(), customHeaders);
  const response = await llmClient.invoke(messages, { model, temperature });
  return response.content || '';
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
 * 为素材列表生成预签名 URL（服务端用）
 * AI 视觉模型要求 image_url 必须是 http/https URL，
 * 但 file_url 现在存的是 S3 Key，需要先签名
 */
export async function presignMaterialUrls(
  materials: Array<{ file_url?: string | null; file_path?: string | null; material_type: string }>,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();

  // Collect file paths that need presigning (not already http URLs)
  const toPresign: string[] = [];
  for (const mat of materials) {
    const path = mat.file_path || mat.file_url;
    if (path && !path.startsWith('http')) {
      toPresign.push(path);
    }
  }

  if (toPresign.length === 0) return result;

  try {
    const storage = new S3Storage();
    const presignedResults = await Promise.allSettled(
      toPresign.map(async (path) => {
        const url = await storage.generatePresignedUrl({ key: path, expireTime: 86400 });
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
 * 从素材列表中提取图片的预签名 URL，供 AI 视觉模型使用
 * @returns 图片 URL 数组（均为 http/https 格式）
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
