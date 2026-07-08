/**
 * Hermes skills — matrix evaluation summary (PRD V3.1.2.4 §11.6).
 *
 * A skill loads domain context, builds a prompt, calls `executeHermesRun`, then
 * parses the model output into `agent_suggestion_blocks` (always `pending` —
 * PRD §11.5: agent output is advisory, never auto-applied).
 */

import { sql, eq, and } from 'drizzle-orm';
import { getDb } from '@/storage/database/pg-db';
import {
  agentInstances,
  agentSuggestionBlocks,
} from '@/storage/database/shared/schema';
import { getV3MatrixProjection } from '@/lib/matrix/projection-v3';
import { cellKey } from '@/lib/matrix/v3-types';
import type { V3MatrixProjection, V3HierarchyNode, V3Column, V3CellValue } from '@/lib/matrix/v3-types';
import { executeHermesRun } from './runtime';

export interface MatrixSummarySuggestion {
  blockType: string;
  content: string;
  /** Scope node id (level_1 group) when applicable. */
  scopeNodeId?: string | null;
}

export interface MatrixSummaryInput {
  matrixId: string;
  /** Currently only 'by_level_1_group' is supported. */
  scope: 'by_level_1_group';
  userId: string;
  /** Optional tenant override (defaults to 'default'). */
  tenantId?: string;
}

export interface MatrixSummaryResult {
  runId: string;
  traceId: string;
  status: 'succeeded' | 'failed';
  errorCode?: string;
  suggestions: Array<{ id: string; blockType: string; content: string }>;
}

type DbClient = Awaited<ReturnType<typeof getDb>>;

/**
 * Resolve an agent instance to run the skill under. Prefers an instance the
 * caller is bound to; otherwise falls back to any active instance in the tenant.
 * Returns null when none exists — callers should surface a clear error.
 */
async function resolveSkillAgentInstance(
  db: DbClient,
  tenantId: string,
  userId: string,
): Promise<string | null> {
  // Prefer a bound, active instance for this user.
  const boundRows = await db
    .select({ id: agentInstances.id })
    .from(agentInstances)
    .where(
      and(
        eq(agentInstances.tenantId, tenantId),
        eq(agentInstances.status, 'active'),
        eq(agentInstances.boundUserId, userId),
      ),
    )
    .limit(1)
    .execute();
  if (boundRows.length > 0) return boundRows[0].id as string;

  // Fall back to any active instance in the tenant.
  const anyRows = await db
    .select({ id: agentInstances.id })
    .from(agentInstances)
    .where(
      and(
        eq(agentInstances.tenantId, tenantId),
        eq(agentInstances.status, 'active'),
      ),
    )
    .orderBy(agentInstances.createdAt)
    .limit(1)
    .execute();
  if (anyRows.length > 0) return anyRows[0].id as string;

  // Last resort: any instance in the tenant.
  const allRows = await db
    .select({ id: agentInstances.id })
    .from(agentInstances)
    .where(eq(agentInstances.tenantId, tenantId))
    .orderBy(agentInstances.createdAt)
    .limit(1)
    .execute();
  return allRows.length > 0 ? (allRows[0].id as string) : null;
}

/**
 * Render the matrix projection into a compact text prompt section. Grouped by
 * level_1 hierarchy node; for each group we list columns and filled cell text.
 */
function renderMatrixContext(projection: V3MatrixProjection): string {
  const nodeLabelById = new Map<string, V3HierarchyNode>();
  const indexNodes = (nodes: V3HierarchyNode[]) => {
    for (const n of nodes) {
      nodeLabelById.set(n.id, n);
      indexNodes(n.children);
    }
  };
  indexNodes(projection.hierarchy);

  const columns = projection.columns;
  const columnLabel = (id: string): string => {
    const c = columns.find((x) => x.id === id);
    return c?.columnLabel ?? id;
  };

  const cellText = (cell: V3CellValue | undefined): string => {
    if (!cell || cell.valueState === 'empty') return '';
    return cell.displayText || cell.valueText || cell.valueNumber || '';
  };

  // Group leaf rows by their level_1 node.
  const groups = new Map<string, typeof projection.rows>();
  for (const row of projection.rows) {
    const arr = groups.get(row.level1NodeId) ?? [];
    arr.push(row);
    groups.set(row.level1NodeId, arr);
  }

  const lines: string[] = [];
  lines.push(`矩阵名称: ${projection.matrix.name}`);
  lines.push(`状态: ${projection.matrix.status}`);
  lines.push(
    `汇总: 共 ${projection.summary.activeLeafRows} 个有效数据行 / ${projection.summary.totalColumns} 列 / ${projection.summary.filledCells} 个已填单元格 / ${projection.summary.totalIssues} 个问题点`,
  );
  lines.push('');
  lines.push('=== 列定义 ===');
  for (const c of columns) {
    lines.push(`- ${c.columnLabel}（${c.dataType}${c.unitText ? `, 单位:${c.unitText}` : ''}）`);
  }

  lines.push('');
  lines.push('=== 分组数据（按一级分组） ===');
  for (const [nodeId, rows] of groups) {
    const node = nodeLabelById.get(nodeId);
    lines.push(`\n【一级分组】${node?.nodeLabel ?? nodeId}`);
    for (const row of rows) {
      // Sub-group label (level_2 / level_3) for readability.
      const subLabel: string[] = [];
      if (row.level2NodeId && nodeLabelById.has(row.level2NodeId)) {
        subLabel.push(nodeLabelById.get(row.level2NodeId)!.nodeLabel);
      }
      if (row.level3NodeId && nodeLabelById.has(row.level3NodeId)) {
        subLabel.push(nodeLabelById.get(row.level3NodeId)!.nodeLabel);
      }
      const rowCells: string[] = [];
      for (const col of columns) {
        if (col.columnZone === 'hierarchy') continue;
        const text = cellText(projection.cells[cellKey(row.id, col.id)]);
        if (text) rowCells.push(`${columnLabel(col.id)}=${text}`);
      }
      const rowDesc = subLabel.length > 0 ? subLabel.join(' / ') : `行${row.visibleRowIndex + 1}`;
      lines.push(`  - ${rowDesc}: ${rowCells.join('; ') || '（无数据）'}`);
    }
  }

  if (projection.issuePoints.length > 0) {
    lines.push('');
    lines.push('=== 已记录问题点 ===');
    for (const ip of projection.issuePoints) {
      const row = projection.rows.find((r) => r.id === ip.leafRowId);
      const colLabel = ip.columnId ? columnLabel(ip.columnId) : '';
      const ctx = row ? ` [${nodeLabelById.get(row.level1NodeId)?.nodeLabel ?? ''}${colLabel ? '/' + colLabel : ''}]` : '';
      lines.push(`- ${ip.issueText}${ctx}（${ip.status}）`);
    }
  }

  const notes = projection.narratives.filter((n) => n.content);
  if (notes.length > 0) {
    lines.push('');
    lines.push('=== 现有备注/总结 ===');
    for (const n of notes) {
      lines.push(`- [${n.blockType}] ${n.content}`);
    }
  }

  return lines.join('\n');
}

interface ParsedSummaryBlock {
  blockType: string;
  content: string;
  scopeNodeId?: string | null;
}

/**
 * Parse the model output into suggestion blocks. Accepts a JSON array or a
 * JSON object with a `groups` array. Each item: { group_label, summary,
 * strengths?, risks? }. Falls back to a single block wrapping the raw text.
 */
function parseSummaryOutput(raw: string, projection: V3MatrixProjection): ParsedSummaryBlock[] {
  const text = raw.trim();
  // Try to locate a JSON payload.
  const jsonStart = text.indexOf('[');
  const jsonBrace = text.indexOf('{');
  let payload: unknown = null;

  try {
    if (jsonStart >= 0 && (jsonBrace < 0 || jsonStart < jsonBrace)) {
      payload = JSON.parse(text.slice(jsonStart));
    } else if (jsonBrace >= 0) {
      const obj = JSON.parse(text.slice(jsonBrace));
      payload = Array.isArray(obj) ? obj : (obj.groups ?? obj.summaries ?? obj);
    }
  } catch {
    payload = null;
  }

  const nodeByLabel = new Map<string, string>();
  for (const root of projection.hierarchy) {
    nodeByLabel.set(root.nodeLabel, root.id);
  }

  const blocks: ParsedSummaryBlock[] = [];
  const items = Array.isArray(payload) ? payload : [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const groupLabel = typeof r.group_label === 'string' ? r.group_label : '';
    const summary = typeof r.summary === 'string' ? r.summary : '';
    const strengths = Array.isArray(r.strengths) ? r.strengths.filter((s) => typeof s === 'string') : [];
    const risks = Array.isArray(r.risks) ? r.risks.filter((s) => typeof s === 'string') : [];

    const parts: string[] = [];
    if (summary) parts.push(summary);
    if (strengths.length > 0) parts.push(`优势：\n${strengths.map((s) => `- ${s}`).join('\n')}`);
    if (risks.length > 0) parts.push(`风险：\n${risks.map((s) => `- ${s}`).join('\n')}`);
    const content = parts.join('\n\n').trim();
    if (!content) continue;

    const scopeNodeId = groupLabel ? nodeByLabel.get(groupLabel) ?? null : null;
    blocks.push({
      blockType: 'matrix_group_summary',
      content,
      scopeNodeId,
    });
  }

  if (blocks.length === 0) {
    // Fallback: wrap the whole output in one block so the user still sees it.
    blocks.push({ blockType: 'matrix_summary_raw', content: text });
  }
  return blocks;
}

/**
 * Run the matrix evaluation summary skill (PRD §11.6).
 *
 * Steps:
 *   1. Load the V3 matrix projection (hierarchy + cells + issues + notes).
 *   2. Resolve an agent instance for the tenant.
 *   3. Build prompts and call executeHermesRun(trigger='matrix_summary').
 *   4. Parse output into per-group summary blocks.
 *   5. Persist agent_suggestion_blocks (status='pending').
 *
 * Output is ALWAYS pending — the caller decides whether to apply it.
 */
export async function runMatrixSummarySkill(
  input: MatrixSummaryInput,
): Promise<MatrixSummaryResult> {
  const tenantId = input.tenantId ?? 'default';

  const projection = await getV3MatrixProjection(input.matrixId);
  if (!projection) {
    return {
      runId: '',
      traceId: '',
      status: 'failed',
      errorCode: 'matrix_not_found',
      suggestions: [],
    };
  }

  const db = await getDb();
  const agentInstanceId = await resolveSkillAgentInstance(db, tenantId, input.userId);
  if (!agentInstanceId) {
    return {
      runId: '',
      traceId: '',
      status: 'failed',
      errorCode: 'no_agent_instance',
      suggestions: [],
    };
  }

  const matrixContext = renderMatrixContext(projection);

  const systemPrompt = `你是产品体验评测矩阵的总结专家。基于评测矩阵的结构化数据（一级分组、各列指标值、已记录的问题点、已有备注），按一级分组生成简洁的体验总结。

要求：
1. 针对每个一级分组输出一条总结，概括该组产品的整体体验表现。
2. 总结必须基于矩阵中实际填写的指标值和问题点，不要编造未出现的数据。
3. 每条总结可包含 2-4 条优势和 1-3 条风险（来自问题点），数量视实际证据而定。
4. 语气客观、专业，聚焦产品体验本身。
5. 仅输出 JSON 数组，不要添加解释文字或 Markdown 代码块标记。

JSON 数组格式：
[
  {
    "group_label": "一级分组名称（必须与输入中的分组名一致）",
    "summary": "2-4 句话的该组体验总结",
    "strengths": ["体验优势1", "体验优势2"],
    "risks": ["体验风险1"]
  }
]`;

  const userPrompt = `请基于以下评测矩阵数据，按一级分组生成体验总结。

${matrixContext}`;

  const runResult = await executeHermesRun({
    agentInstanceId,
    trigger: 'matrix_summary',
    systemPrompt,
    userPrompt,
    userId: input.userId,
    tenantId,
  });

  if (runResult.status !== 'succeeded' || !runResult.output) {
    return {
      runId: runResult.runId,
      traceId: runResult.traceId,
      status: runResult.status,
      errorCode: runResult.errorCode,
      suggestions: [],
    };
  }

  // Parse → persist suggestion blocks (all pending).
  const parsed = parseSummaryOutput(runResult.output, projection);

  const persisted: Array<{ id: string; blockType: string; content: string }> = [];
  for (const block of parsed) {
    const [row] = await db
      .insert(agentSuggestionBlocks)
      .values({
        agentRunId: runResult.runId,
        blockType: block.blockType,
        payload: {
          content: block.content,
          matrixId: input.matrixId,
          scope: input.scope,
          scopeNodeId: block.scopeNodeId ?? null,
        },
        status: 'pending',
        targetEntityType: 'matrix',
        targetEntityId: input.matrixId,
      })
      .returning({ id: agentSuggestionBlocks.id, blockType: agentSuggestionBlocks.blockType, payload: agentSuggestionBlocks.payload })
      .execute();
    if (row) {
      persisted.push({
        id: row.id as string,
        blockType: row.blockType as string,
        content: String((row.payload as Record<string, unknown>)?.content ?? ''),
      });
    }
  }

  return {
    runId: runResult.runId,
    traceId: runResult.traceId,
    status: 'succeeded',
    suggestions: persisted,
  };
}

// `sql` is used in other modules of this package; re-import here to keep the
// Drizzle helpers available without an unused-import error in consumers.
void sql;
