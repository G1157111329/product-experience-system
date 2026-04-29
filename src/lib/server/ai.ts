import { NextRequest } from 'next/server';
import { Config, HeaderUtils, LLMClient } from 'coze-coding-dev-sdk';

type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: { value?: unknown } | null }>;
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

export async function invokeConfiguredAI({
  request,
  client,
  messages,
  defaultModel = 'doubao-seed-2-0-lite-260215',
  defaultTemperature = 0.5,
  maxTokens = 2400,
  forceBuiltInModel,
}: InvokeOptions): Promise<string> {
  const { data: aiConfigData } = await client
    .from('platform_settings')
    .select('value')
    .eq('key', 'ai_config')
    .maybeSingle();

  const aiConfig = (aiConfigData?.value || {}) as {
    provider?: string;
    model?: string;
    temperature?: number;
    custom_api_url?: string;
    custom_api_key?: string;
  };

  const model = forceBuiltInModel || aiConfig.model || defaultModel;
  const temperature = aiConfig.temperature ?? defaultTemperature;

  if (aiConfig.provider === 'custom' && aiConfig.custom_api_url && aiConfig.custom_api_key) {
    const response = await fetch(aiConfig.custom_api_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aiConfig.custom_api_key}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
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
