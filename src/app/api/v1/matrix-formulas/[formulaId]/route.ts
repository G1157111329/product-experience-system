/**
 * PUT /api/v1/matrix-formulas/{formulaId}
 * PRD V3.1.2.4 §7.9 — Save (or replace) a V3 A1-style formula definition.
 *
 * Body: {
 *   matrixId, columnId, expressionDisplay, applyScope?,
 *   resultFormat?, decimalPlaces?
 * }
 *
 * Compiles `expressionDisplay` with the A1 engine and REJECTS parse errors
 * (the expression must be valid A1 P0 arithmetic before it is stored). On
 * success the compiled AST is persisted as JSON in `expression_ast`. The
 * `formulaId` in the path is the identity: if a row exists it is replaced
 * (status reset to active), otherwise a new row is inserted.
 *
 * Auth: requireUser.
 */
import { NextRequest } from 'next/server';
import { getDb } from '@/storage/database/pg-db';
import { eq, sql } from 'drizzle-orm';
import { matrixFormulaDefinitionsV3 } from '@/storage/database/shared/schema';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireUser, isAuthResponse } from '@/lib/server/auth';
import { ok, fail } from '@/lib/server/api-v1/response';
import { resolveTraceId } from '@/lib/server/api-v1/trace';
import { compileA1Formula } from '@/lib/matrix/formula-engine-a1';

export const dynamic = 'force-dynamic';

const VALID_SCOPES = new Set(['matrix', 'group', 'level_1_group', 'row']);
const VALID_FORMATS = new Set(['number', 'percentage', 'duration', 'decimal']);

/** Normalize UI/API aliases onto the stored apply_scope vocabulary. */
function normalizeApplyScope(scope: string): string {
  if (scope === 'group') return 'level_1_group';
  return scope;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ formulaId: string }> },
) {
  const traceId = resolveTraceId(req.headers);
  const { formulaId } = await params;

  const client = getSupabaseClient();
  const user = await requireUser(req, client);
  if (isAuthResponse(user)) return fail(traceId, { message: '未认证', status: 401 });

  let body: {
    matrixId?: unknown;
    columnId?: unknown;
    expressionDisplay?: unknown;
    applyScope?: unknown;
    resultFormat?: unknown;
    decimalPlaces?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return fail(traceId, { message: '请求体不是合法 JSON', status: 400 });
  }

  const matrixId = typeof body.matrixId === 'string' ? body.matrixId : undefined;
  const columnId = typeof body.columnId === 'string' ? body.columnId : undefined;
  const expressionDisplay =
    typeof body.expressionDisplay === 'string' ? body.expressionDisplay : undefined;

  if (!matrixId) return fail(traceId, { message: 'matrixId 不能为空', status: 400 });
  if (!columnId) return fail(traceId, { message: 'columnId 不能为空', status: 400 });
  if (!expressionDisplay) {
    return fail(traceId, { message: 'expressionDisplay 不能为空', status: 400 });
  }

  const applyScopeRaw = typeof body.applyScope === 'string' ? body.applyScope : 'matrix';
  if (!VALID_SCOPES.has(applyScopeRaw)) {
    return fail(traceId, { message: `applyScope 无效: ${applyScopeRaw}`, status: 400 });
  }
  const applyScope = normalizeApplyScope(applyScopeRaw);

  const resultFormat =
    typeof body.resultFormat === 'string' ? body.resultFormat : 'number';
  if (!VALID_FORMATS.has(resultFormat)) {
    return fail(traceId, { message: `resultFormat 无效: ${resultFormat}`, status: 400 });
  }

  const decimalPlaces =
    typeof body.decimalPlaces === 'number' && Number.isInteger(body.decimalPlaces)
      ? body.decimalPlaces
      : 2;
  if (decimalPlaces < 0 || decimalPlaces > 10) {
    return fail(traceId, { message: 'decimalPlaces 必须在 0..10 之间', status: 400 });
  }

  // Compile FIRST — reject on parse error so we never persist an invalid AST.
  const compiled = compileA1Formula(expressionDisplay);
  if (!compiled.ok) {
    return fail(traceId, {
      message: `公式编译失败: ${compiled.code}`,
      status: 400,
      details: { code: compiled.code },
    });
  }

  try {
    const db = await getDb();

    // expression_ast stored as JSON: the normalized display + the AST shape.
    // We store the display (authoritative, re-compilable) plus references so the
    // UI can render dependency hints without re-parsing.
    const astJson = {
      displayExpression: compiled.compiled.displayExpression,
      references: compiled.compiled.references,
      ast: compiled.compiled.ast,
    };

    // Replace-or-insert on formulaId (path identity). If the row exists we
    // overwrite the expression + meta and flip status back to active; otherwise
    // we insert a new definition.
    const existing = await db
      .select({ id: matrixFormulaDefinitionsV3.id })
      .from(matrixFormulaDefinitionsV3)
      .where(eq(matrixFormulaDefinitionsV3.id, formulaId))
      .limit(1)
      .execute();

    if (existing.length > 0) {
      const [updated] = await db
        .update(matrixFormulaDefinitionsV3)
        .set({
          matrixId,
          columnId,
          expressionDisplay: compiled.compiled.displayExpression,
          expressionAst: astJson,
          applyScope,
          resultFormat,
          decimalPlaces,
          status: 'active',
          updatedAt: sql`NOW()`,
        })
        .where(eq(matrixFormulaDefinitionsV3.id, formulaId))
        .returning()
        .execute();
      return ok(updated, traceId, 'updated');
    }

    const [created] = await db
      .insert(matrixFormulaDefinitionsV3)
      .values({
        id: formulaId,
        matrixId,
        columnId,
        expressionDisplay: compiled.compiled.displayExpression,
        expressionAst: astJson,
        referenceMode: 'relative_by_visible_row',
        applyScope,
        resultFormat,
        decimalPlaces,
        status: 'active',
        createdBy: user.id,
      })
      .returning()
      .execute();
    return ok(created, traceId, 'created');
  } catch (err) {
    const message = err instanceof Error ? err.message : '保存公式失败';
    return fail(traceId, { message, status: 500 });
  }
}
