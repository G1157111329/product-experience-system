/**
 * Hermes Agent Runtime — embedded execution engine (PRD V3.1.2.4 §11, ADR-03).
 *
 * Hermes is NOT a separate service: it runs in-process and reuses the existing
 * AI infrastructure (`resolveAIConfig` + `invokeConfiguredAI`). Model config is
 * read from `ai_model_configs` — there are no `hermes_*` config columns.
 *
 * A run = create an `agent_runs` row, invoke the model, persist the result.
 * On failure the run is marked `failed` with a stable `error_code`
 * (PRD §11.8: no silent fallback, no model switching, no retry cascade).
 */

import crypto from 'node:crypto';
import { sql } from 'drizzle-orm';
import { getDb } from '@/storage/database/pg-db';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { resolveAIConfig, invokeConfiguredAI, type MessageContent } from '@/lib/server/ai';
import { agentRuns } from '@/storage/database/shared/schema';

export type HermesTrigger = 'manual' | 'matrix_summary' | 'report_draft' | 'wecom_ingest';

export interface HermesRunInput {
  agentInstanceId: string;
  /** Optional conversation context. Omitted for skill runs that don't chat. */
  conversationId?: string;
  trigger: HermesTrigger;
  systemPrompt: string;
  userPrompt: string;
  userId: string;
  tenantId?: string;
  projectId?: string;
  taskId?: string;
  /** Optional memory namespace id for persistence linkage. */
  memoryNamespaceId?: string;
  /** Per-run timeout override (ms). Defaults to 120s. */
  timeoutMs?: number;
}

export interface HermesRunResult {
  runId: string;
  traceId: string;
  status: 'succeeded' | 'failed';
  output?: string;
  errorCode?: HermesErrorCode;
}

export type HermesErrorCode =
  | 'api_key_invalid'
  | 'model_timeout'
  | 'rate_limited'
  | 'provider_unreachable'
  | 'model_response_invalid'
  | 'unknown';

/** Stable error codes surfaced to callers (PRD §11.8). */
export const HERMES_ERROR_CODES: readonly HermesErrorCode[] = [
  'api_key_invalid',
  'model_timeout',
  'rate_limited',
  'provider_unreachable',
  'model_response_invalid',
  'unknown',
] as const;

/**
 * Map a thrown error / HTTP status to a stable Hermes error code.
 * String matching is intentionally defensive — provider error shapes vary.
 */
export function classifyModelError(error: unknown, httpStatus?: number): HermesErrorCode {
  if (httpStatus) {
    if (httpStatus === 401 || httpStatus === 403) return 'api_key_invalid';
    if (httpStatus === 429) return 'rate_limited';
    if (httpStatus >= 500) return 'provider_unreachable';
  }
  const message = error instanceof Error ? error.message : String(error ?? '');
  const lower = message.toLowerCase();
  if (lower.includes('timeout') || lower.includes('aborted') || lower.includes('响应超时')) {
    return 'model_timeout';
  }
  if (lower.includes('429') || lower.includes('rate') || lower.includes('频繁')) {
    return 'rate_limited';
  }
  if (
    lower.includes('401') ||
    lower.includes('403') ||
    lower.includes('unauthorized') ||
    lower.includes('forbidden') ||
    lower.includes('api_key') ||
    lower.includes('ai配置未完成')
  ) {
    return 'api_key_invalid';
  }
  if (
    lower.includes('连接失败') ||
    lower.includes('fetch') ||
    lower.includes('network') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('不可达')
  ) {
    return 'provider_unreachable';
  }
  if (lower.includes('json') || lower.includes('parse') || lower.includes('invalid')) {
    return 'model_response_invalid';
  }
  return 'unknown';
}

function truncate(text: string, max = 4000): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…[truncated]`;
}

/**
 * Execute a Hermes run end-to-end. Never throws — failures are returned as
 * `{ status: 'failed', errorCode }`. The `agent_runs` row always reflects the
 * terminal state (running → succeeded | failed).
 */
export async function executeHermesRun(input: HermesRunInput): Promise<HermesRunResult> {
  const traceId = crypto.randomUUID();
  const tenantId = input.tenantId ?? 'default';
  const db = await getDb();
  const client = getSupabaseClient();

  // 1. Create the run row in 'running' state.
  let modelSnapshot: Record<string, unknown> = { captured: false };
  let modelConfig: Awaited<ReturnType<typeof resolveAIConfig>> | null = null;
  try {
    modelConfig = await resolveAIConfig(client, {
      defaultTemperature: 0.4,
      maxTokens: 2400,
    });
    // Snapshot base_url + model_name only — NEVER the api_key (PRD §11.2).
    modelSnapshot = {
      captured: true,
      base_url: modelConfig.customApiUrl,
      model_name: modelConfig.model,
      provider: modelConfig.provider,
      supports_vision: modelConfig.supportsVision,
      temperature: modelConfig.temperature,
      max_tokens: modelConfig.maxTokens,
    };
  } catch {
    // resolveAIConfig itself failed; we still record the run with a bare snapshot.
    modelSnapshot = { captured: false, reason: 'resolve_failed' };
  }

  const [runRow] = await db
    .insert(agentRuns)
    .values({
      tenantId,
      agentInstanceId: input.agentInstanceId,
      conversationId: input.conversationId ?? null,
      memoryNamespaceId: input.memoryNamespaceId ?? null,
      trigger: input.trigger,
      status: 'running',
      modelConfigSnapshot: modelSnapshot,
      inputSummary: truncate(`SYSTEM:\n${input.systemPrompt}\n\nUSER:\n${input.userPrompt}`),
      traceId,
      startedAt: sql`NOW()`,
    })
    .returning({ id: agentRuns.id })
    .execute();
  const runId = runRow?.id as string;

  // 2. Invoke the model. On any error, classify and mark the run failed.
  const messages: Array<{ role: 'system' | 'user'; content: MessageContent }> = [
    { role: 'system', content: input.systemPrompt },
    { role: 'user', content: input.userPrompt },
  ];

  let output = '';
  try {
    output = await invokeConfiguredAI({
      client,
      messages,
      defaultTemperature: 0.4,
      maxTokens: 2400,
      timeoutMs: input.timeoutMs ?? 120000,
    });
  } catch (err) {
    const errorCode = classifyModelError(err);
    await db
      .update(agentRuns)
      .set({
        status: 'failed',
        errorCode,
        outputSummary: truncate(err instanceof Error ? err.message : String(err)),
        completedAt: sql`NOW()`,
      })
      .where(sql`${agentRuns.id} = ${runId}`)
      .execute();
    return { runId, traceId, status: 'failed', errorCode };
  }

  // 3. Persist success.
  await db
    .update(agentRuns)
    .set({
      status: 'succeeded',
      outputSummary: truncate(output),
      completedAt: sql`NOW()`,
    })
    .where(sql`${agentRuns.id} = ${runId}`)
    .execute();

  return { runId, traceId, status: 'succeeded', output };
}
