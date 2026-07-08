/**
 * POST /api/v1/matrix-formulas/{formulaId}/recompute
 * PRD V3.1.2.4 §7.9 — Trigger an authoritative recompute for the matrix that
 * owns `formulaId`.
 *
 * Looks up the formula definition to resolve its matrixId, then runs
 * {@link recomputeMatrixFormulas} which recomputes EVERY active formula in that
 * matrix (so dependent columns converge in one pass). Returns 200 on success.
 *
 * Auth: requireUser.
 */
import { NextRequest } from 'next/server';
import { getDb } from '@/storage/database/pg-db';
import { eq } from 'drizzle-orm';
import { matrixFormulaDefinitionsV3 } from '@/storage/database/shared/schema';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireUser, isAuthResponse } from '@/lib/server/auth';
import { ok, fail } from '@/lib/server/api-v1/response';
import { resolveTraceId } from '@/lib/server/api-v1/trace';
import { recomputeMatrixFormulas } from '@/lib/matrix/recompute-v3';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ formulaId: string }> },
) {
  const traceId = resolveTraceId(req.headers);
  const { formulaId } = await params;

  const client = getSupabaseClient();
  const user = await requireUser(req, client);
  if (isAuthResponse(user)) return fail(traceId, { message: '未认证', status: 401 });

  try {
    const db = await getDb();

    // Resolve the formula → its matrixId. 404 if the formula does not exist.
    const rows = await db
      .select({
        id: matrixFormulaDefinitionsV3.id,
        matrixId: matrixFormulaDefinitionsV3.matrixId,
        status: matrixFormulaDefinitionsV3.status,
      })
      .from(matrixFormulaDefinitionsV3)
      .where(eq(matrixFormulaDefinitionsV3.id, formulaId))
      .limit(1)
      .execute();

    const formula = rows[0];
    if (!formula) {
      return fail(traceId, { message: '公式定义不存在', status: 404 });
    }
    // Recompute even inactive formulas' matrices is allowed — the recompute
    // function only touches status='active' formulas, so this is safe and lets
    // a just-activated formula's matrix converge. No status gate here.

    await recomputeMatrixFormulas(formula.matrixId);

    return ok(
      { formulaId, matrixId: formula.matrixId, recomputed: true },
      traceId,
      'recomputed',
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : '重新计算失败';
    return fail(traceId, { message, status: 500 });
  }
}
