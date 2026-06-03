import assert from 'node:assert/strict';
import { resolveAIConfig } from './ai';

function makeClient(fixtures: {
  activeModel?: Record<string, unknown> | null;
  legacy?: Record<string, unknown> | null;
}) {
  return {
    from(table: string) {
      return {
        select() {
          return {
            eq(column: string, value: unknown) {
              return {
                maybeSingle: async () => {
                  if (table === 'ai_model_configs' && column === 'is_active' && value === true) {
                    return { data: fixtures.activeModel ? fixtures.activeModel : null };
                  }
                  if (table === 'platform_settings' && column === 'key' && value === 'ai_config') {
                    return { data: fixtures.legacy ? { value: fixtures.legacy } : null };
                  }
                  return { data: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

async function main() {
  const active = await resolveAIConfig(makeClient({
    activeModel: {
      provider: 'custom',
      model: 'vision-model',
      temperature: 6,
      max_tokens: 3000,
      custom_api_url: 'https://example.com/v1/chat/completions',
      custom_api_key_encrypted: 'secret',
    },
  }));

  assert.deepEqual(active, {
    provider: 'custom',
    model: 'vision-model',
    temperature: 0.6,
    maxTokens: 3000,
    customApiUrl: 'https://example.com/v1/chat/completions',
    customApiKey: 'secret',
  });

  const legacy = await resolveAIConfig(makeClient({
    legacy: {
      provider: 'custom',
      model: 'legacy-model',
      temperature: 0.4,
    },
  }));

  assert.equal(legacy.provider, 'custom');
  assert.equal(legacy.model, 'legacy-model');
  assert.equal(legacy.temperature, 0.4);
  assert.equal(legacy.maxTokens, 2400);

  const fallback = await resolveAIConfig(makeClient({}));

  assert.equal(fallback.provider, 'custom');
  assert.equal(fallback.model, '');
  assert.equal(fallback.temperature, 0.5);
}

main();
