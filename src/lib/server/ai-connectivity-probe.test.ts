import assert from 'node:assert/strict';
import * as ai from './ai';

type Probe = (input: {
  apiUrl: string;
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
}) => Promise<void>;

async function main() {
  const probe = (ai as unknown as { probeAIConfiguration?: Probe }).probeAIConfiguration;
  assert.equal(typeof probe, 'function', 'AI configuration must expose a connectivity probe before it can be saved');

  let observedAuthorization = '';
  let observedBody = '';
  await probe!({
    apiUrl: 'https://ai.example.test/v1',
    apiKey: 'secret-that-must-never-be-persisted',
    model: 'test-model',
    fetchImpl: async (_input, init) => {
      observedAuthorization = String((init?.headers as Record<string, string>).Authorization);
      observedBody = String(init?.body);
      return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'ok' } }] }), { status: 200 });
    },
  });

  assert.equal(observedAuthorization, 'Bearer secret-that-must-never-be-persisted');
  assert.match(observedBody, /"model":"test-model"/);
  assert.match(observedBody, /"max_tokens":1/);

  await assert.rejects(
    () => probe!({
      apiUrl: 'https://ai.example.test/v1',
      apiKey: 'secret-that-must-never-be-persisted',
      model: 'test-model',
      fetchImpl: async () => new Response('denied', { status: 401 }),
    }),
    /AI connection test failed \(HTTP 401\)/,
  );

  await assert.rejects(
    () => probe!({
      apiUrl: 'https://ai.example.test/v1',
      apiKey: 'secret-that-must-never-be-persisted',
      model: 'test-model',
      fetchImpl: async () => { throw new Error('provider echoed secret-that-must-never-be-persisted'); },
    }),
    (error: Error) => {
      assert.match(error.message, /provider is unreachable or timed out/);
      assert.doesNotMatch(error.message, /secret-that-must-never-be-persisted/);
      return true;
    },
  );

  await assert.rejects(
    () => probe!({
      apiUrl: 'https://ai.example.test/v1',
      apiKey: 'secret-that-must-never-be-persisted',
      model: 'test-model',
      fetchImpl: async () => new Response('<html>ok</html>', { status: 200 }),
    }),
    /invalid Chat Completions response/,
  );

  await assert.rejects(
    () => probe!({
      apiUrl: 'https://ai.example.test/v1',
      apiKey: 'secret-that-must-never-be-persisted',
      model: 'test-model',
      fetchImpl: async () => new Response(JSON.stringify({ choices: [] }), { status: 200 }),
    }),
    /invalid Chat Completions response/,
  );

  await assert.rejects(
    () => probe!({
      apiUrl: 'https://ai.example.test/v1',
      apiKey: 'secret-that-must-never-be-persisted',
      model: 'test-model',
      fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: '   ' } }] }), { status: 200 }),
    }),
    /invalid Chat Completions response/,
  );
}

main();
