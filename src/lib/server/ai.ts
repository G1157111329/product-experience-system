import { generatePresignedUrl } from './storage';
import { decryptSecret } from './secret-crypto';
import { writeSecurityAudit } from './security-audit';
import { stripAssistantReasoning } from '../assistant-output';

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
  timeoutMs?: number;
}

export interface ResolvedAIConfig {
  provider: string;
  supportsVision: boolean;
  model: string;
  temperature: number;
  maxTokens: number;
  customApiUrl: string;
  customApiKey: string;
  requestOptions: AIRequestOptions;
}

interface ResolveOptions {
  defaultModel?: string;
  defaultTemperature?: number;
  maxTokens?: number;
}

export type AIRequestOptions = {
  /** Select the provider's token-limit field while keeping the request portable by default. */
  tokenField?: 'max_tokens' | 'max_completion_tokens';
  /** Provider-declared optional request fields, such as structured output or reasoning controls. */
  extraBody?: Record<string, unknown>;
};

export type ChatCompletionRequest = {
  model: string;
  messages: Array<{ role: 'system' | 'user'; content: MessageContent }>;
  temperature: number;
  max_tokens?: number;
  max_completion_tokens?: number;
} & Record<string, unknown>;

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface AIConnectivityProbeInput {
  apiUrl: string;
  apiKey: string;
  model: string;
  requestOptions?: AIRequestOptions;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

export type AIConnectivityFailure = {
  code: 'configuration_incomplete' | 'endpoint_not_allowed' | 'provider_unreachable' | 'upstream_rejected' | 'rate_limited' | 'provider_error' | 'invalid_response' | 'unknown';
  message: string;
  upstreamStatus?: number;
};

const PROTECTED_REQUEST_FIELDS = new Set(['model', 'messages', 'temperature', 'max_tokens', 'max_completion_tokens']);

export function normalizeAIRequestOptions(value: unknown): AIRequestOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const row = value as Record<string, unknown>;
  const tokenField = row.tokenField === 'max_completion_tokens' ? 'max_completion_tokens'
    : row.tokenField === 'max_tokens' ? 'max_tokens'
      : undefined;
  const rawExtraBody = row.extraBody;
  const extraBody = rawExtraBody && typeof rawExtraBody === 'object' && !Array.isArray(rawExtraBody)
    ? Object.fromEntries(Object.entries(rawExtraBody as Record<string, unknown>)
      .filter(([key, item]) => !PROTECTED_REQUEST_FIELDS.has(key) && item !== undefined))
    : undefined;
  return { ...(tokenField ? { tokenField } : {}), ...(extraBody && Object.keys(extraBody).length ? { extraBody } : {}) };
}

/** Build the portable OpenAI-compatible request shared by every configured model. */
export function buildChatCompletionRequest(input: {
  model: string;
  messages: Array<{ role: 'system' | 'user'; content: MessageContent }>;
  temperature: number;
  maxTokens: number;
  requestOptions?: AIRequestOptions;
}): ChatCompletionRequest {
  const options = normalizeAIRequestOptions(input.requestOptions);
  const request: ChatCompletionRequest = {
    model: input.model,
    messages: input.messages,
    temperature: input.temperature,
  };
  request[options.tokenField || 'max_tokens'] = input.maxTokens;
  Object.assign(request, options.extraBody || {});
  return request;
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

/**
 * Converts a probe error into an actionable, credential-safe diagnostic for
 * administrators. Provider response bodies are intentionally never exposed.
 */
export function describeAIConnectivityFailure(error: unknown): AIConnectivityFailure {
  const raw = error instanceof Error ? error.message : '';
  const httpMatch = raw.match(/HTTP (\d{3})/);
  if (httpMatch) {
    const upstreamStatus = Number(httpMatch[1]);
    if (upstreamStatus === 401 || upstreamStatus === 403) {
      return { code: 'upstream_rejected', message: `模型服务返回 HTTP ${upstreamStatus}：请检查 API Key 是否有效且具备该模型权限。`, upstreamStatus };
    }
    if (upstreamStatus === 404) {
      return { code: 'upstream_rejected', message: '模型服务返回 HTTP 404：请检查调用地址是否为 Chat Completions 地址。', upstreamStatus };
    }
    if (upstreamStatus === 422) {
      return { code: 'upstream_rejected', message: '模型服务返回 HTTP 422：请检查模型名称及该服务要求的请求参数。', upstreamStatus };
    }
    if (upstreamStatus === 429) {
      return { code: 'rate_limited', message: '模型服务返回 HTTP 429：当前请求受限，请稍后重试或检查服务配额。', upstreamStatus };
    }
    if (upstreamStatus >= 500) {
      return { code: 'provider_error', message: `模型服务返回 HTTP ${upstreamStatus}：服务端暂时不可用，请稍后重试。`, upstreamStatus };
    }
    return { code: 'upstream_rejected', message: `模型服务返回 HTTP ${upstreamStatus}：请检查调用地址、模型和服务端策略。`, upstreamStatus };
  }
  if (raw.includes('允许的域名白名单')) {
    return { code: 'endpoint_not_allowed', message: '调用地址不在 AI_ALLOWED_HOSTS 白名单内，请将该内网主机加入部署环境后重启服务。' };
  }
  if (raw.includes('endpoint, model, and API key are required')) {
    return { code: 'configuration_incomplete', message: '调用地址、模型名和 API Key 均为必填项。' };
  }
  if (raw.includes('provider is unreachable or timed out')) {
    return { code: 'provider_unreachable', message: '无法连接模型服务或请求超时：请检查内网路由、DNS、端口和 TLS 配置。' };
  }
  if (raw.includes('invalid Chat Completions response')) {
    return { code: 'invalid_response', message: '模型服务未返回兼容的 Chat Completions 响应，请检查网关协议。' };
  }
  return { code: 'unknown', message: 'AI 连通性测试失败：请检查调用地址、模型、API Key 和网络后重试。' };
}

/**
 * Performs a minimal OpenAI-compatible chat request before a configuration is persisted.
 * The caller owns persistence; this helper never writes a configuration or logs credentials.
 */
export async function probeAIConfiguration({
  apiUrl,
  apiKey,
  model,
  requestOptions,
  fetchImpl = fetch,
  timeoutMs = 10_000,
}: AIConnectivityProbeInput): Promise<void> {
  const endpoint = normalizeChatCompletionsUrl(apiUrl);
  if (!endpoint || !apiKey.trim() || !model.trim()) {
    throw new Error('AI connection test failed: endpoint, model, and API key are required');
  }
  assertSafeAIEndpoint(endpoint);

  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(buildChatCompletionRequest({
        model,
        messages: [{ role: 'user', content: 'ping' }],
        temperature: 0,
        maxTokens: 16,
        requestOptions,
      })),
    });
  } catch {
    throw new Error('AI connection test failed: provider is unreachable or timed out');
  }

  if (!response.ok) {
    throw new Error(`AI connection test failed (HTTP ${response.status})`);
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error('AI connection test failed: invalid Chat Completions response');
  }
  const firstChoice = (result as { choices?: unknown[] } | null)?.choices?.[0] as {
    message?: { role?: unknown; content?: unknown; reasoning_content?: unknown };
  } | undefined;
  if (
    !firstChoice
    || firstChoice.message?.role !== 'assistant'
    || (
      typeof firstChoice.message.content !== 'string'
      && typeof firstChoice.message.reasoning_content !== 'string'
    )
  ) {
    throw new Error('AI connection test failed: invalid Chat Completions response');
  }
}

/**
 * OpenAI-compatible gateways do not uniformly accept the legacy max_tokens
 * field. Retry once with max_completion_tokens only when the default field is
 * rejected, then return the successful selection for persistence.
 */
export async function probeAIConfigurationWithTokenFallback(input: AIConnectivityProbeInput): Promise<AIRequestOptions> {
  const requestOptions = normalizeAIRequestOptions(input.requestOptions);
  try {
    await probeAIConfiguration({ ...input, requestOptions });
    return requestOptions;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const mayBeTokenFieldMismatch = /HTTP (400|422)/.test(message);
    if (requestOptions.tokenField || !mayBeTokenFieldMismatch) throw error;

    const compatibleOptions: AIRequestOptions = { ...requestOptions, tokenField: 'max_completion_tokens' };
    await probeAIConfiguration({ ...input, requestOptions: compatibleOptions });
    return compatibleOptions;
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
      supportsVision: Boolean(activeModel.supports_vision),
      temperature: normalizeTemperature(activeModel.temperature, defaultTemperature),
      maxTokens: normalizePositiveInt(activeModel.max_tokens ?? activeModel.maxTokens, maxTokens),
      customApiUrl: normalizeChatCompletionsUrl(String(activeModel.custom_api_url || activeModel.customApiUrl || DEFAULT_API_URL)),
      customApiKey: decryptSecret(String(activeModel.custom_api_key_encrypted || activeModel.customApiKeyEncrypted || DEFAULT_API_KEY)),
      requestOptions: normalizeAIRequestOptions(activeModel.request_options ?? activeModel.requestOptions),
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
    supportsVision: true, // legacy: assume vision supported
    temperature: normalizeTemperature(legacyValue.temperature, defaultTemperature),
    maxTokens,
    customApiUrl: normalizeChatCompletionsUrl(String(legacyValue.custom_api_url || DEFAULT_API_URL)),
    customApiKey: decryptSecret(String(legacyValue.custom_api_key || DEFAULT_API_KEY)),
    requestOptions: normalizeAIRequestOptions(legacyValue.request_options ?? legacyValue.requestOptions),
  };
}

export async function invokeConfiguredAI({
  client,
  messages,
  defaultModel = DEFAULT_MODEL,
  defaultTemperature = 0.5,
  maxTokens = 2400,
  timeoutMs = 120000,
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
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(buildChatCompletionRequest({
        model,
        messages,
        temperature,
        maxTokens: aiConfig.maxTokens,
        requestOptions: aiConfig.requestOptions,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'network error';
    const isTimeout = message.includes('timeout') || message.includes('aborted') || message.includes('Timeout');
    await writeSecurityAudit(client, {
      action: 'ai.invoke',
      outcome: 'failed',
      targetType: 'ai_endpoint',
      targetId: aiHost,
      metadata: { model, reason: message.slice(0, 200) },
    });
    if (isTimeout) {
      throw new Error(`AI服务响应超时(${timeoutMs / 1000}秒)，模型「${model}」处理时间过长或服务不可达，请稍后重试或检查AI配置`);
    }
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
    // Vision call failed, retry without image parts if present
    const hasImageParts = messages.some(m => Array.isArray(m.content) ? m.content.some((c: MessageContentPart) => c.type === "image_url") : false);
    if (hasImageParts) {
      await writeSecurityAudit(client, {
        action: "ai.invoke",
        outcome: "failed",
        targetType: "ai_endpoint",
        targetId: aiHost,
        metadata: { model, status: response.status, reason: "vision_fallback_retry" },
      });
      // Retry without image parts
      const textOnlyMessages = messages.map(m => {
        if (Array.isArray(m.content)) {
          const textParts = m.content.filter((c: MessageContentPart) => c.type === "text");
          return { ...m, content: textParts.length === 1 ? textParts[0].text : textParts };
        }
        return m;
      });
      const retryRes = await fetch(apiUrl, {
        method: "POST",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(buildChatCompletionRequest({
          model,
          messages: textOnlyMessages,
          temperature,
          maxTokens: aiConfig.maxTokens,
          requestOptions: aiConfig.requestOptions,
        })),
      });
      if (retryRes.ok) {
        const retryResult = await retryRes.json();
        await writeSecurityAudit(client, {
          action: "ai.invoke",
          outcome: "success",
          targetType: "ai_endpoint",
          targetId: aiHost,
          metadata: { model, maxTokens: aiConfig.maxTokens, fallback: "text_only" },
        });
        return retryResult.choices?.[0]?.message?.content || "";
      }
      await writeSecurityAudit(client, {
        action: "ai.invoke",
        outcome: "failed",
        targetType: "ai_endpoint",
        targetId: aiHost,
        metadata: { model, status: retryRes.status, reason: "text_only_retry_failed" },
      });
    }
    await writeSecurityAudit(client, {
      action: "ai.invoke",
      outcome: "failed",
      targetType: "ai_endpoint",
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
    const jsonMatch = stripAssistantReasoning(content).match(/\{[\s\S]*\}/);
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

  // 对 local 存储的图片，优先读取文件转 base64 data URL（大图用 ImageMagick 压缩）
  // 限制最多5张图片（压缩后每张约100KB base64≈130KB，5张约650KB）
  const maxImages = 5;
  const result: string[] = [];

  for (const mat of imageMaterials.slice(0, maxImages)) {
    const path = mat.file_path || mat.file_url;
    if (!path) continue;

    // 如果已经是完整 HTTP URL（S3 模式或已签名），直接用
    if (path.startsWith('http')) {
      result.push(path);
      continue;
    }

    // local 模式：尝试读取文件转 base64
    try {
      const { readLocalImageAsDataUrl } = await import('@/lib/server/storage');
      const dataUrl = await readLocalImageAsDataUrl(path);
      if (dataUrl) {
        result.push(dataUrl);
      } else {
        // 文件读取失败，回退到 presigned URL
        const url = await generatePresignedUrl({ key: path, expireTime: 86400, absoluteUrl: true });
        if (url) result.push(url);
      }
    } catch {
      // 回退到 presigned URL
      try {
        const url = await generatePresignedUrl({ key: path, expireTime: 86400, absoluteUrl: true });
        if (url) result.push(url);
      } catch { /* skip */ }
    }
  }

  return result;
}
