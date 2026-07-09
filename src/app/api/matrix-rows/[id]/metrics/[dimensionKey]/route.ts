import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessAssembly, isAuthResponse, requireUser } from '@/lib/server/auth';
import { writeSecurityAudit } from '@/lib/server/security-audit';
import { recomputeAffected, MatrixMetricConflictError } from '@/lib/matrix/recompute';

/**
 * 数据矩阵 - 指标值 PATCH (Task 8 / Data Matrix Input View)
 *
 * PATCH /api/matrix-rows/[id]/metrics/[dimensionKey]
 * 写入某记录行的单个 *观测*（observed）指标值，随后由服务端用与前端乐观计算
 * 相同的 DSL 引擎重算所有受影响的 *计算*（calculated）指标，写回权威值并记录
 * 一次 matrix_calculation_runs 审计运行。
 *
 * 不可直接写 calculated 列（409 MATRIX_CALCULATED_VALUE_READONLY）——那些由
 * recompute 负责产出。乐观锁基于 metric_evaluations.version：请求体可携带
 * expectedVersion，与当前 version 不符则 409 MATRIX_VERSION_CONFLICT。
 *
 * 乐观 + 权威策略：前端可先用 optimisticCalculations 即时展示重算结果，服务端
 * 再返回权威的 authoritativeCalculations（来自 recompute）；前端用后者校正前者。
 *
 * 幂等性：本端点目前仅将 Idempotency-Key 头并入 traceId（见下）；完整的请求级
 * 幂等缓存留待后续。recompute 本身已对 (assembly, input_version_hash,
 * formula_version_hash) 幂等，因此相同输入的重复写不会重复算。
 *
 * Body: {
 *   value?: number | string;        // 数值（数字或可解析为数字的字符串）
 *   durationMs?: number;            // 时长类型值
 *   text?: string;                  // 文本类型值
 *   unitCode?: string;
 *   valueKind?: string;             // 默认取维度绑定
 *   inputState?: 'valid' | 'missing' | 'not_applicable';
 *   expectedVersion?: number;       // 乐观锁：当前 metric_evaluations.version
 *   optimisticCalculations?: Record<string, number>;  // 前端乐观结果（透传，不参与计算）
 * }
 */

import type { PatchMetricBody, DimensionBindingLike, EmptyBodyCheck } from '@/lib/matrix/metric-helpers';
import { isCalculatedDimension, emptyMetricBody, versionConflict } from '@/lib/matrix/metric-helpers';

type Row = Record<string, any>;

/** Coerce a numeric-string/number body value to a number, or undefined. */
function coerceNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; dimensionKey: string }> },
) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const { id: rowId, dimensionKey } = await params;

  // 1. 解析行所在组装 + 节点类型（鉴权 + 类型校验）。
  const { data: row, error: rowErr } = await client
    .from('comparison_item_nodes')
    .select('assembly_id, node_type')
    .eq('id', rowId)
    .maybeSingle();
  if (rowErr) {
    return NextResponse.json({ code: 1, message: rowErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ code: 1, message: '未找到记录行' }, { status: 404 });
  }

  const assemblyId = String((row as Row).assembly_id);
  if (!(await canAccessAssembly(client, user, assemblyId))) {
    return NextResponse.json({ code: 1, message: '无权访问该矩阵' }, { status: 403 });
  }

  const nodeType = String((row as Row).node_type ?? '');
  if (nodeType !== 'item' && nodeType !== 'condition') {
    return NextResponse.json(
      { code: 1, message: '该端点仅支持 item/condition 行' },
      { status: 409 },
    );
  }

  // 2. 加载组装 → schema_version_id → 维度绑定。校验该维度存在且为可写的 observed 列。
  const { data: assembly, error: asmErr } = await client
    .from('comparison_assemblies')
    .select('matrix_schema_version_id')
    .eq('id', assemblyId)
    .maybeSingle();
  if (asmErr) {
    return NextResponse.json({ code: 1, message: asmErr.message }, { status: 500 });
  }
  if (!assembly) {
    return NextResponse.json({ code: 1, message: '未找到组装' }, { status: 404 });
  }
  const schemaVersionId = String((assembly as Row).matrix_schema_version_id ?? '');
  if (!schemaVersionId) {
    return NextResponse.json(
      { code: 1, message: '该组装未绑定矩阵模式版本' },
      { status: 409 },
    );
  }

  const { data: binding, error: bindingErr } = await client
    .from('matrix_dimension_bindings')
    .select('*')
    .eq('schema_version_id', schemaVersionId)
    .eq('dimension_key', dimensionKey)
    .maybeSingle();
  if (bindingErr) {
    return NextResponse.json({ code: 1, message: bindingErr.message }, { status: 500 });
  }
  if (!binding) {
    return NextResponse.json(
      { code: 1, message: `未找到维度 ${dimensionKey}` },
      { status: 404 },
    );
  }
  // 拒绝直接写计算列：那些只能由 recompute 产出。
  if (isCalculatedDimension(binding as DimensionBindingLike)) {
    return NextResponse.json(
      { code: 1, message: '计算列只读，不可直接写入', data: { code: 'MATRIX_CALCULATED_VALUE_READONLY' } },
      { status: 409 },
    );
  }
  if ((binding as Row).editable === false) {
    return NextResponse.json(
      { code: 1, message: '该维度不可编辑' },
      { status: 409 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as PatchMetricBody;
  const bindingValueKind = String((binding as Row).value_kind ?? 'number');
  const valueKind = body.valueKind ?? bindingValueKind;
  const unitCode = body.unitCode ?? ((binding as Row).unit_code as string | undefined) ?? null;
  const inputState: 'valid' | 'missing' | 'not_applicable' = body.inputState ?? 'valid';

  // 解析出写入的值（按 valueKind 选择存哪个列）。任一类型未提供对应值 → 写 null。
  let numericValue: number | null = null;
  let durationMs: number | null = null;
  let textValue: string | null = null;
  if (valueKind === 'duration') {
    const dv = body.durationMs !== undefined ? coerceNumber(body.durationMs) : coerceNumber(body.value);
    durationMs = dv ?? null;
  } else if (valueKind === 'text') {
    textValue = typeof body.text === 'string' ? body.text : (body.value !== undefined ? String(body.value) : null);
  } else {
    // number / enum / boolean — 数值列承载。
    const nv = coerceNumber(body.value);
    numericValue = nv ?? null;
  }

  // Fix I2: an empty body (no value/durationMs/text at all) would otherwise
  // write null to every value column with input_state='valid', silently wiping
  // a real value. Reject it — UNLESS the caller explicitly passed
  // inputState 'not_applicable' or 'missing' with no value, which is a
  // legitimate "mark this cell N/A / missing" intent.
  const emptyBody = emptyMetricBody(body);
  if (emptyBody.isLiteralAllNull && !emptyBody.isExplicitStateMarker) {
    return NextResponse.json(
      { code: 1, message: '缺少 value/durationMs/text 之一' },
      { status: 400 },
    );
  }

  // 3. 乐观锁：读当前 metric_evaluations，若提供 expectedVersion 则校验。
  const { data: existing, error: readErr } = await client
    .from('metric_evaluations')
    .select('id, version')
    .eq('cell_id', rowId)
    .eq('metric_key', dimensionKey)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json({ code: 1, message: readErr.message }, { status: 500 });
  }
  const currentVersion = typeof (existing as Row)?.version === 'number'
    ? Number((existing as Row).version)
    : 0;
  if (versionConflict(body.expectedVersion, currentVersion)) {
    return NextResponse.json(
      {
        code: 1,
        message: '指标版本冲突，请刷新后重试',
        data: { code: 'MATRIX_VERSION_CONFLICT', latestVersion: currentVersion },
      },
      { status: 409 },
    );
  }
  const newVersion = currentVersion + 1;

  // 4. 写入手动指标行（read-then-update-or-insert；原因见 recompute.ts 的
  //    upsertMetricEvaluation：metric_evaluations 是复合唯一约束，pg-query 的
  //    upsert 只能按单列 key/id 冲突，故不能用 .upsert()）。
  const payload: Record<string, unknown> = {
    cell_id: rowId,
    metric_key: dimensionKey,
    value_kind: valueKind,
    numeric_value: numericValue,
    duration_ms: durationMs,
    text_value: textValue,
    unit_code: unitCode,
    input_state: inputState,
    calculation_mode: 'manual',
    formula_definition_id: null,
    source_run_id: null,
    error_code: null,
    version: newVersion,
    updated_at: nowIso(),
  };

  let metricEvaluationId: string;
  if ((existing as Row)?.id) {
    metricEvaluationId = String((existing as Row).id);
    const { error: updErr } = await client
      .from('metric_evaluations')
      .update(payload)
      .eq('id', metricEvaluationId);
    if (updErr) {
      return NextResponse.json({ code: 1, message: updErr.message }, { status: 500 });
    }
  } else {
    payload.created_at = nowIso();
    const { data: inserted, error: insErr } = await client
      .from('metric_evaluations')
      .insert(payload)
      .select('id')
      .maybeSingle();
    if (insErr) {
      return NextResponse.json({ code: 1, message: insErr.message }, { status: 500 });
    }
    metricEvaluationId = String((inserted as Row)?.id ?? '');
  }

  // 5. traceId：优先用 x-trace-id；否则用 Idempotency-Key（透传，使重放可关联）
  //    再否则随机。完整请求级幂等缓存留待后续。
  const traceId =
    request.headers.get('x-trace-id') ||
    request.headers.get('idempotency-key') ||
    cryptoRandomId();

  // 6. 服务端权威重算受影响的计算指标（与前端乐观计算同一 DSL 引擎）。
  //
  // Note (C2 — deferred): the manual metric write (step 4) and this recompute
  // are NOT in a single DB transaction (the repo's pg-query Supabase adapter
  // does not expose transaction support). This is the documented intentional
  // tradeoff: on recompute failure the manual value is PRESERVED (correct —
  // the user's input should survive), but the calculated values may be stale
  // until the next successful recompute. The 500 response below therefore
  // carries needs_recompute: true so the client can retry. A future task should
  // add tx support to pg-query and wrap steps 4–6 so the write is rolled back
  // atomically on recompute failure (or the recompute retried inside the tx).
  let result;
  try {
    result = await recomputeAffected({
      client,
      assemblyId,
      schemaVersionId,
      triggeredRowId: rowId,
      triggeredDimensionKey: dimensionKey,
      traceId,
      triggerType: 'api_save',
    });
  } catch (err) {
    // Fix I1: a version conflict surfaced by recomputeAffected's guarded
    // upsert (two concurrent recomputes raced on the same calculated cell) is
    // mapped to a 409, not a 500. The manual value was written successfully,
    // so the client can refresh and retry the save.
    if (err instanceof MatrixMetricConflictError) {
      await writeSecurityAudit(client, {
        request,
        actor: user,
        action: 'matrix_metric.recompute_conflict',
        outcome: 'denied',
        targetType: 'comparison_item_node',
        targetId: rowId,
        metadata: {
          assemblyId,
          dimensionKey,
          conflictCellId: err.cellId,
          conflictMetricKey: err.metricKey,
          staleVersion: err.staleVersion,
        },
      });
      return NextResponse.json(
        {
          code: 1,
          message: '计算指标版本冲突，请重试',
          data: {
            code: 'MATRIX_CALCULATION_CONFLICT',
            conflictMetricKey: err.metricKey,
            latestVersion: err.staleVersion,
            metricEvaluationId,
            version: newVersion,
            needs_recompute: true,
          },
        },
        { status: 409 },
      );
    }
    // 手动值已写入；重算失败不应吞掉该写入。返回写入成功 + 重算失败信号，
    // 前端可据 authoritativeCalculations 为空提示重算异常。
    const message = err instanceof Error ? err.message : '重算失败';
    await writeSecurityAudit(client, {
      request,
      actor: user,
      action: 'matrix_metric.recompute_failed',
      outcome: 'failed',
      targetType: 'comparison_item_node',
      targetId: rowId,
      metadata: { assemblyId, dimensionKey, error: message },
    });
    return NextResponse.json(
      {
        code: 1,
        message: `指标已写入，但重算失败：${message}`,
        data: {
          metricEvaluationId,
          version: newVersion,
          authoritativeCalculations: [],
          calculationRunId: null,
          // C2 (deferred): see the comment above step 6 — the manual write and
          // recompute are not transactional, so flag that a retry is needed.
          needs_recompute: true,
        },
      },
      { status: 500 },
    );
  }

  // 7. 审计。
  await writeSecurityAudit(client, {
    request,
    actor: user,
    action: 'matrix_metric.updated',
    outcome: 'success',
    targetType: 'comparison_item_node',
    targetId: rowId,
    metadata: {
      assemblyId,
      rowId,
      dimensionKey,
      value: numericValue ?? durationMs ?? textValue,
      unitCode,
      calculationRunId: result.runId,
    },
  });

  // 8. 返回新版本 + 权威重算结果。
  return NextResponse.json({
    code: 0,
    message: 'success',
    data: {
      metricEvaluationId,
      version: newVersion,
      authoritativeCalculations: result.updated,
      calculationRunId: result.runId,
    },
  });
}

/** crypto.randomUUID() when present, else a sha256-derived fallback id. */
function cryptoRandomId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
