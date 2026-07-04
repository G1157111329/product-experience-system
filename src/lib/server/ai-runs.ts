/**
 * V3.1 §14.3 / §16.3 — AI run audit + publication gate.
 *
 * Every AI invocation must record a row in `ai_runs` before returning the result
 * to the caller. The `review_status` starts as `pending`. Publication paths
 * (publish report, close issue, change severity) MUST check `review_status =
 * 'approved'` on the latest run that touched the entity — otherwise the AI
 * draft cannot self-publish.
 *
 * This module is the write/read side. The publication gate is enforced in the
 * relevant API routes (Wave 1 P0 work, lands alongside the contract-table
 * backfill).
 */

import { getDb } from "@/storage/database/pg-db";
import { aiRuns } from "@/storage/database/shared/v3-contract-tables";
import { and, eq, desc, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { getCurrentTraceId } from "./api-v1/trace";

export type AiRunTargetType =
  | "report"
  | "issue"
  | "comparison"
  | "function_effect"
  | "rectification";

export type AiRunStatus = "running" | "succeeded" | "failed" | "cancelled";
export type AiReviewStatus = "pending" | "approved" | "rejected" | "overridden";

export type StartAiRunInput = {
  provider: string;
  model: string;
  targetType: AiRunTargetType;
  targetId?: string;
  skillKey?: string;
  promptDigest?: string;
  traceId?: string;
};

export type StartAiRunResult = {
  runId: string;
};

/**
 * Insert a row with status='running'. Callers must later call finishAiRun()
 * with the result or failure. The runId is opaque — pass it back verbatim.
 */
export async function startAiRun(input: StartAiRunInput): Promise<StartAiRunResult> {
  const db = getDb();
  const runId = `run_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const traceId = input.traceId || getCurrentTraceId() || null;

  await db.insert(aiRuns).values({
    runId,
    traceId,
    provider: input.provider,
    model: input.model,
    skillKey: input.skillKey,
    targetType: input.targetType,
    targetId: input.targetId,
    promptDigest: input.promptDigest,
    status: "running",
    reviewStatus: "pending",
    startedAt: new Date().toISOString(),
  });

  return { runId };
}

/**
 * Record the result of a finished AI run. `resultDigest` is a short hash of the
 * result so audits can detect when the same input produced different output.
 */
export async function finishAiRun(
  runId: string,
  result: {
    status: AiRunStatus;
    resultJson?: Record<string, unknown>;
    resultDigest?: string;
    inputTokens?: number;
    outputTokens?: number;
    durationMs?: number;
    errorMessage?: string;
  },
): Promise<void> {
  const db = getDb();
  await db
    .update(aiRuns)
    .set({
      status: result.status,
      resultJson: result.resultJson ?? {},
      resultDigest: result.resultDigest,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      durationMs: result.durationMs,
      errorMessage: result.errorMessage,
      finishedAt: new Date().toISOString(),
    })
    .where(eq(aiRuns.runId, runId));
}

/**
 * Compute a 16-char digest of an AI result payload. Used to detect drift when
 * the same prompt produces different outputs across runs.
 */
export function digestAiResult(payload: unknown): string {
  const json = JSON.stringify(payload);
  return createHash("sha256").update(json).digest("hex").slice(0, 16);
}

/**
 * V3.1 §14.3 publication gate: returns true iff the latest AI run touching the
 * target entity has been reviewed and approved by a human. AI cannot self-
 * publish, self-close, or self-rectify.
 *
 * If no AI run exists for the target, returns true (no AI work to gate).
 */
export async function isAiReviewApproved(
  targetType: AiRunTargetType,
  targetId: string,
): Promise<boolean> {
  const db = getDb();
  const latest = await db
    .select({
      reviewStatus: aiRuns.reviewStatus,
    })
    .from(aiRuns)
    .where(and(eq(aiRuns.targetType, targetType), eq(aiRuns.targetId, targetId)))
    .orderBy(desc(aiRuns.createdAt))
    .limit(1);
  if (latest.length === 0) return true;
  return latest[0].reviewStatus === "approved" || latest[0].reviewStatus === "overridden";
}

/**
 * Mark a run's review status. Only humans should call this — never an AI agent.
 */
export async function reviewAiRun(
  runId: string,
  reviewStatus: AiReviewStatus,
  reviewerId: string,
  note?: string,
): Promise<void> {
  const db = getDb();
  await db
    .update(aiRuns)
    .set({
      reviewStatus,
      reviewedBy: reviewerId,
      reviewedAt: new Date().toISOString(),
      reviewNote: note,
    })
    .where(eq(aiRuns.runId, runId));
}

/**
 * Count AI runs by status for ops dashboards. Returns pending review count and
 * failure rate over the last N hours.
 */
export async function aiRunStats(windowHours = 24): Promise<{
  pendingReview: number;
  failed: number;
  total: number;
}> {
  const db = getDb();
  const cutoff = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();
  const rows = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE review_status = 'pending') AS pending,
      COUNT(*) FILTER (WHERE status = 'failed') AS failed,
      COUNT(*) AS total
    FROM ${aiRuns}
    WHERE created_at >= ${cutoff}
  `);
  const row = rows.rows[0] as { pending: string; failed: string; total: string } | undefined;
  return {
    pendingReview: row ? Number(row.pending) : 0,
    failed: row ? Number(row.failed) : 0,
    total: row ? Number(row.total) : 0,
  };
}