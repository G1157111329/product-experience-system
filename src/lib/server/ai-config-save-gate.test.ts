import assert from 'node:assert/strict';
import * as gateModule from './ai-config-save-gate';

type ResolveProbeInput = (input: {
  body: Record<string, unknown>;
  existing?: Record<string, unknown> | null;
  decryptExistingKey: (value: string) => string;
}) => { apiUrl: string; apiKey: string; model: string; requestOptions: unknown };

type BuildFinalConfig = (input: {
  body: Record<string, unknown>;
  existing?: Record<string, unknown> | null;
  encryptNewKey: (value: string) => string;
}) => Record<string, unknown>;
type BuildFinalLegacyConfig = (input: {
  body: Record<string, unknown>;
  existing?: Record<string, unknown> | null;
  encryptNewKey: (value: string) => string;
}) => Record<string, unknown>;

function main() {
  const resolveProbeInput = (gateModule as unknown as { resolveAIConfigProbeInput?: ResolveProbeInput }).resolveAIConfigProbeInput;
  assert.equal(typeof resolveProbeInput, 'function', 'model saves must resolve a probe input before persistence');

  const input = resolveProbeInput!({
    body: {
      model: 'new-model',
      custom_api_url: 'https://ai.example.test/v1',
      request_options: { tokenField: 'max_completion_tokens' },
    },
    existing: {
      model: 'old-model',
      custom_api_url: 'https://old.example.test/v1',
      custom_api_key_encrypted: 'encrypted-existing-key',
    },
    decryptExistingKey: (value) => value === 'encrypted-existing-key' ? 'existing-key' : '',
  });

  assert.deepEqual(input, {
    apiUrl: 'https://ai.example.test/v1',
    apiKey: 'existing-key',
    model: 'new-model',
    requestOptions: { tokenField: 'max_completion_tokens' },
  });

  const buildFinalConfig = (gateModule as unknown as { buildFinalAIModelConfig?: BuildFinalConfig }).buildFinalAIModelConfig;
  assert.equal(typeof buildFinalConfig, 'function', 'model saves must build the final persisted object before probing');
  assert.deepEqual(buildFinalConfig!({
    body: { id: 'config-1', name: 'Renamed config', model: 'new-model' },
    existing: {
      name: 'Original config', provider: 'custom', model: 'old-model', temperature: 4, max_tokens: 3200,
      supports_vision: true, custom_api_url: 'https://ai.example.test/v1', custom_api_key_encrypted: 'enc:existing',
      request_options: { tokenField: 'max_completion_tokens' }, is_active: true, created_by: 'creator',
    },
    encryptNewKey: (value) => `enc:${value}`,
  }), {
    name: 'Renamed config', provider: 'custom', model: 'new-model', temperature: 4, max_tokens: 3200,
    supports_vision: true, custom_api_url: 'https://ai.example.test/v1', custom_api_key_encrypted: 'enc:existing',
    request_options: { tokenField: 'max_completion_tokens' }, is_active: true, created_by: 'creator',
  });

  const buildFinalLegacyConfig = (gateModule as unknown as { buildFinalLegacyAIConfig?: BuildFinalLegacyConfig }).buildFinalLegacyAIConfig;
  assert.equal(typeof buildFinalLegacyConfig, 'function', 'legacy AI settings saves must preserve omitted configuration fields');
  assert.deepEqual(buildFinalLegacyConfig!({
    body: { model: 'new-model' },
    existing: {
      provider: 'custom', model: 'old-model', custom_api_url: 'https://ai.example.test/v1',
      custom_api_key: 'enc:existing', request_options: { tokenField: 'max_completion_tokens' },
    },
    encryptNewKey: (value) => `enc:${value}`,
  }), {
    provider: 'custom', model: 'new-model', custom_api_url: 'https://ai.example.test/v1',
    custom_api_key: 'enc:existing', request_options: { tokenField: 'max_completion_tokens' },
  });

  assert.equal(buildFinalConfig!({
    body: { id: 'config-1', custom_api_key: '' },
    existing: { custom_api_key_encrypted: 'enc:existing' },
    encryptNewKey: (value) => `enc:${value}`,
  }).custom_api_key_encrypted, 'enc:existing', 'an empty edit form key retains the stored key');
}

main();
