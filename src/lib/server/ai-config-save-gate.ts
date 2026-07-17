import { normalizeAIRequestOptions } from './ai';

function hasOwn(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key) && value[key] !== undefined;
}

function readProvided(value: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (hasOwn(value, key)) return value[key];
  }
  return undefined;
}

function resolveStoredKey(input: {
  body: Record<string, unknown>;
  existing?: Record<string, unknown> | null;
  encryptNewKey: (value: string) => string;
  existingKeys: string[];
}) {
  const suppliedKey = readProvided(input.body, ['custom_api_key', 'customApiKey', 'custom_api_key_encrypted']);
  if (suppliedKey !== undefined) {
    const value = String(suppliedKey);
    if (value.trim()) return value.startsWith('enc:v1:') ? value : input.encryptNewKey(value);
  }
  for (const key of input.existingKeys) {
    const value = input.existing?.[key];
    if (value) return String(value);
  }
  return null;
}

/** Builds the exact payload persisted by the model-config endpoint before any provider probe. */
export function buildFinalAIModelConfig(input: {
  body: Record<string, unknown>;
  existing?: Record<string, unknown> | null;
  encryptNewKey: (value: string) => string;
  createdBy?: string;
}) {
  const { body, existing, encryptNewKey } = input;
  const pick = (keys: string[], fallback: unknown) => {
    const supplied = readProvided(body, keys);
    return supplied === undefined ? fallback : supplied;
  };
  const temperature = Number(pick(['temperature'], existing?.temperature ?? 5));
  const maxTokens = Number(pick(['max_tokens', 'maxTokens'], existing?.max_tokens ?? existing?.maxTokens ?? 2400));
  const rawRequestOptions = pick(['request_options', 'requestOptions'], existing?.request_options ?? existing?.requestOptions ?? {});

  const payload: Record<string, unknown> = {
    name: String(pick(['name'], existing?.name ?? 'AI模型配置')),
    provider: String(pick(['provider'], existing?.provider ?? 'custom')),
    model: String(pick(['model'], existing?.model ?? '')),
    temperature: Number.isFinite(temperature) ? (temperature <= 1 ? Math.round(temperature * 10) : Math.min(10, Math.max(0, Math.round(temperature)))) : 5,
    max_tokens: Number.isFinite(maxTokens) && maxTokens > 0 ? Math.floor(maxTokens) : 2400,
    supports_vision: Boolean(pick(['supports_vision', 'supportsVision'], existing?.supports_vision ?? existing?.supportsVision ?? false)),
    custom_api_url: pick(['custom_api_url', 'customApiUrl'], existing?.custom_api_url ?? existing?.customApiUrl ?? null),
    custom_api_key_encrypted: resolveStoredKey({
      body,
      existing,
      encryptNewKey,
      existingKeys: ['custom_api_key_encrypted', 'customApiKeyEncrypted'],
    }),
    request_options: normalizeAIRequestOptions(rawRequestOptions),
  };
  if (existing?.is_active !== undefined) payload.is_active = existing.is_active;
  if (existing?.created_by) payload.created_by = existing.created_by;
  else if (input.createdBy) payload.created_by = input.createdBy;
  return payload;
}

/** Builds the exact value persisted for the legacy platform_settings AI configuration. */
export function buildFinalLegacyAIConfig(input: {
  body: Record<string, unknown>;
  existing?: Record<string, unknown> | null;
  encryptNewKey: (value: string) => string;
}) {
  const payload = { ...(input.existing || {}), ...input.body } as Record<string, unknown>;
  const storedKey = resolveStoredKey({
    body: input.body,
    existing: input.existing,
    encryptNewKey: input.encryptNewKey,
    existingKeys: ['custom_api_key', 'customApiKey', 'custom_api_key_encrypted'],
  });
  if (storedKey) payload.custom_api_key = storedKey;
  else delete payload.custom_api_key;
  delete payload.customApiKey;
  delete payload.custom_api_key_encrypted;
  if (hasOwn(input.body, 'request_options') || hasOwn(input.body, 'requestOptions')) {
    payload.request_options = normalizeAIRequestOptions(input.body.request_options ?? input.body.requestOptions);
    delete payload.requestOptions;
  }
  return payload;
}

export function resolveAIConfigProbeInput(input: {
  body: Record<string, unknown>;
  existing?: Record<string, unknown> | null;
  decryptExistingKey: (value: string) => string;
}) {
  const { body, existing, decryptExistingKey } = input;
  const suppliedKey = body.custom_api_key ?? body.customApiKey ?? body.custom_api_key_encrypted;
  const encryptedExistingKey = String(
    existing?.custom_api_key_encrypted ?? existing?.customApiKeyEncrypted ?? existing?.custom_api_key ?? existing?.customApiKey ?? '',
  );
  const apiKey = suppliedKey ? String(suppliedKey) : encryptedExistingKey ? decryptExistingKey(encryptedExistingKey) : '';
  const apiUrl = String(body.custom_api_url ?? body.customApiUrl ?? existing?.custom_api_url ?? existing?.customApiUrl ?? '');
  const model = String(body.model ?? existing?.model ?? '');
  const requestOptions = normalizeAIRequestOptions(
    body.request_options ?? body.requestOptions ?? existing?.request_options ?? existing?.requestOptions,
  );

  return { apiUrl, apiKey, model, requestOptions };
}
