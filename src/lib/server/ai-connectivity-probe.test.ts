import assert from 'node:assert/strict';
import * as ai from './ai';

type Probe = (input: {
  apiUrl: string;
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
}) => Promise<void>;

type ProbeWithTokenFallback = (input: {
  apiUrl: string;
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
}) => Promise<{ tokenField?: 'max_tokens' | 'max_completion_tokens' }>;

type DescribeFailure = (error: unknown) => {
  code: string;
  message: string;
  upstreamStatus?: number;
};

async function main() {
  const probe = (ai as unknown as { probeAIConfiguration?: Probe }).probeAIConfiguration;
  assert.equal(typeof probe, 'function', 'AI configuration must expose a connectivity probe before it can be saved');
  const probeWithTokenFallback = (ai as unknown as { probeAIConfigurationWithTokenFallback?: ProbeWithTokenFallback }).probeAIConfigurationWithTokenFallback;
  assert.equal(typeof probeWithTokenFallback, 'function', 'model saves must retry the modern completion-token field when the default field is rejected');
  const describeFailure = (ai as unknown as { describeAIConnectivityFailure?: DescribeFailure }).describeAIConnectivityFailure;
  assert.equal(typeof describeFailure, 'function', 'model saves must expose a safe connectivity failure diagnostic');

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
  assert.match(observedBody, /"max_tokens":16/);

  await assert.doesNotReject(() => probe!({
    apiUrl: 'https://ai.example.test/v1',
    apiKey: 'secret-that-must-never-be-persisted',
    model: 'reasoning-model',
    fetchImpl: async () => new Response(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: null, reasoning_content: 'thinking' } }],
    }), { status: 200 }),
  }), 'a successful reasoning-model probe must not require visible answer content');

  const requestBodies: string[] = [];
  const compatibleOptions = await probeWithTokenFallback!({
    apiUrl: 'https://ai.example.test/v1',
    apiKey: 'secret-that-must-never-be-persisted',
    model: 'modern-token-model',
    fetchImpl: async (_input, init) => {
      const request = String(init?.body);
      requestBodies.push(request);
      if (request.includes('"max_tokens"')) return new Response('unsupported token field', { status: 422 });
      return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'ok' } }] }), { status: 200 });
    },
  });
  assert.deepEqual(compatibleOptions, { tokenField: 'max_completion_tokens' });
  assert.equal(requestBodies.length, 2, 'only one compatibility retry is allowed');
  assert.match(requestBodies[0], /"max_tokens":16/);
  assert.match(requestBodies[1], /"max_completion_tokens":16/);

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
      fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: null } }] }), { status: 200 }),
    }),
    /invalid Chat Completions response/,
  );

  let upstreamFailure: unknown;
  try {
    await probe!({
      apiUrl: 'https://ai.example.test/v1',
      apiKey: 'secret-that-must-never-be-persisted',
      model: 'test-model',
      fetchImpl: async () => new Response('invalid token secret-that-must-never-be-persisted', { status: 422 }),
    });
  } catch (error) {
    upstreamFailure = error;
  }
  const diagnostic = describeFailure!(upstreamFailure);
  assert.deepEqual(diagnostic, {
    code: 'upstream_rejected',
    message: '模型服务返回 HTTP 422：请检查模型名称及该服务要求的请求参数。',
    upstreamStatus: 422,
  });
  assert.doesNotMatch(diagnostic.message, /secret-that-must-never-be-persisted/);
}

main();
