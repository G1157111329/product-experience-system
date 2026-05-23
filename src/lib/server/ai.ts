import { NextRequest } from 'next/server';
import { Config, HeaderUtils, LLMClient } from 'coze-coding-dev-sdk';

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
    defaultModel = 'kimi-k2-5-260127',
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
  defaultModel = 'kimi-k2-5-260127',
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
