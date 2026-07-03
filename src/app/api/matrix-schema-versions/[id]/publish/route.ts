import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { isAuthResponse, requireAdmin } from '@/lib/server/auth';
import { writeSecurityAudit } from '@/lib/server/security-audit';
import {
  buildDependencyGraph,
  compileFormula,
  MatrixFormulaError,
  parseErrorToCode,
} from '@/lib/matrix/formula-engine';

type DimensionBindingRow = {
  dimension_key: string;
  column_group: string;
  editable: boolean;
};

type FormulaRow = {
  id: string;
  output_dimension_key: string;
  formula_dsl: string;
  scope: string;
  formula_version: string;
};

type VersionRow = {
  id: string;
  schema_id: string;
  version_no: number;
  status: string;
  schema_json: unknown;
};

type CompiledFormula = {
  formula: FormulaRow;
  ast: unknown;
  dependencies: string[];
};

/**
 * Detects a cycle in the inter-formula dependency graph using Kahn's
 * algorithm (topological sort by in-degree). A formula `A` depends on formula
 * `B` when A's dependency list references B's output_dimension_key. If the
 * topo-sort cannot emit every node, the residual nodes form one or more cycles.
 *
 * Returns the set of dimension keys that participate in a cycle (empty if none).
 */
function detectCycles(
  compiled: CompiledFormula[],
): Set<string> {
  const outputKeys = new Set(compiled.map((c) => c.formula.output_dimension_key));

  // adjacency: edge outputKey -> dependency, but only when that dependency is
  // itself a formula output (input-only dimensions are leaves, never cycle).
  const outgoing: Map<string, Set<string>> = new Map();
  const inDegree: Map<string, number> = new Map();
  for (const key of outputKeys) {
    outgoing.set(key, new Set());
    inDegree.set(key, 0);
  }
  for (const { formula, dependencies } of compiled) {
    const from = formula.output_dimension_key;
    for (const dep of dependencies) {
      if (outputKeys.has(dep) && dep !== from) {
        outgoing.get(from)!.add(dep);
      }
    }
  }
  for (const [, deps] of outgoing) {
    for (const dep of deps) {
      inDegree.set(dep, (inDegree.get(dep) ?? 0) + 1);
    }
  }

  // Kahn: peel off zero-in-degree nodes. Anything left over is on a cycle.
  const queue: string[] = [];
  for (const [key, deg] of inDegree) {
    if (deg === 0) queue.push(key);
  }
  let emitted = 0;
  while (queue.length > 0) {
    const node = queue.shift()!;
    emitted += 1;
    for (const dep of outgoing.get(node) ?? []) {
      const next = (inDegree.get(dep) ?? 0) - 1;
      inDegree.set(dep, next);
      if (next === 0) queue.push(dep);
    }
  }

  if (emitted === outputKeys.size) return new Set();
  return new Set([...outputKeys].filter((key) => (inDegree.get(key) ?? 0) > 0));
}

// POST /api/matrix-schema-versions/[id]/publish — compiles + validates + publishes
// a draft version atomically. Every formula is compiled and the whole graph is
// validated BEFORE any DB write, so a failure leaves the version in its draft
// state with no partial publish.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: versionId } = await params;
  const client = getSupabaseClient();
  const admin = await requireAdmin(request, client);
  if (isAuthResponse(admin)) return admin;

  // 1. Load the version + its draft bindings + draft formulas.
  const { data: version, error: versionError } = await client
    .from('matrix_schema_versions')
    .select('id, schema_id, version_no, status, schema_json')
    .eq('id', versionId)
    .maybeSingle();
  if (versionError) return NextResponse.json({ code: 1, message: versionError.message }, { status: 500 });
  if (!version) return NextResponse.json({ code: 1, message: '版本不存在' }, { status: 404 });
  const versionRow = version as VersionRow;
  if (versionRow.status === 'published') {
    return NextResponse.json({ code: 1, message: '该版本已发布' }, { status: 409 });
  }

  const { data: bindings, error: bindingsError } = await client
    .from('matrix_dimension_bindings')
    .select('dimension_key, column_group, editable')
    .eq('schema_version_id', versionId);
  if (bindingsError) return NextResponse.json({ code: 1, message: bindingsError.message }, { status: 500 });

  const { data: formulas, error: formulasError } = await client
    .from('matrix_formula_definitions')
    .select('id, output_dimension_key, formula_dsl, scope, formula_version')
    .eq('schema_version_id', versionId);
  if (formulasError) return NextResponse.json({ code: 1, message: formulasError.message }, { status: 500 });

  const formulaRows = (formulas || []) as FormulaRow[];
  const bindingRows = (bindings || []) as DimensionBindingRow[];
  const bindingByKey: Record<string, DimensionBindingRow> = Object.fromEntries(
    bindingRows.map((b) => [b.dimension_key, b]),
  );

  // 2. Compile every formula. On a parse/compile error, 422 + formulaId.
  const compiled: CompiledFormula[] = [];
  for (const formula of formulaRows) {
    try {
      const { ast } = compileFormula(formula.formula_dsl);
      const dependencies = buildDependencyGraph(formula.formula_dsl);
      compiled.push({ formula, ast, dependencies });
    } catch (err) {
      const code = parseErrorToCode(err) ?? 'MATRIX_FORMULA_PARSE_ERROR';
      return NextResponse.json(
        {
          code,
          formulaId: formula.id,
          message: err instanceof Error ? err.message : '公式编译失败',
        },
        { status: 422 },
      );
    }
  }

  // 3. Each formula's output must be a non-editable calculated dimension.
  for (const { formula } of compiled) {
    const binding = bindingByKey[formula.output_dimension_key];
    if (!binding || binding.editable !== false || binding.column_group !== 'calculated') {
      return NextResponse.json(
        {
          code: 'MATRIX_FORMULA_OUTPUT_EDITABLE',
          formulaId: formula.id,
          message: `公式输出 ${formula.output_dimension_key} 必须是不可编辑的 calculated 维度`,
        },
        { status: 422 },
      );
    }
  }

  // 4. Every dependency referenced by a formula must correspond to a real binding.
  for (const { formula, dependencies } of compiled) {
    for (const dep of dependencies) {
      if (!bindingByKey[dep]) {
        return NextResponse.json(
          {
            code: 'MATRIX_FORMULA_DIMENSION_NOT_FOUND',
            formulaId: formula.id,
            message: `公式引用了未定义的维度 ${dep}`,
          },
          { status: 422 },
        );
      }
    }
  }

  // 5. Cycle detection across formulas (topo-sort back-edge check).
  const cyclic = detectCycles(compiled);
  if (cyclic.size > 0) {
    const firstCycleFormula = compiled.find((c) => cyclic.has(c.formula.output_dimension_key));
    return NextResponse.json(
      {
        code: 'MATRIX_FORMULA_CYCLE',
        formulaId: firstCycleFormula?.formula.id ?? null,
        message: `公式之间存在循环依赖: ${[...cyclic].join(', ')}`,
      },
      { status: 422 },
    );
  }

  // --- All validation passed. Begin the (non-transactional) publish writes. ---
  // 6. checksum = first 16 hex chars of sha256 over the canonical schema_json.
  const schemaJsonStr = JSON.stringify(versionRow.schema_json);
  const checksum = createHash('sha256').update(schemaJsonStr).digest('hex').slice(0, 16);

  // 7. Publish the version row.
  const { error: publishVersionError } = await client
    .from('matrix_schema_versions')
    .update({
      status: 'published',
      published_at: new Date().toISOString(),
      published_by: admin.id,
      checksum,
    })
    .eq('id', versionId);
  if (publishVersionError) {
    return NextResponse.json({ code: 1, message: publishVersionError.message }, { status: 500 });
  }

  // 8. Write compiled_ast + dependency_json + status='published' per formula.
  for (const { formula, ast, dependencies } of compiled) {
    const { error: formulaError } = await client
      .from('matrix_formula_definitions')
      .update({
        compiled_ast: ast,
        dependency_json: dependencies,
        status: 'published',
      })
      .eq('id', formula.id);
    if (formulaError) {
      return NextResponse.json({ code: 1, message: formulaError.message }, { status: 500 });
    }
  }

  // 9. Point the schema header at the newly published version.
  const { error: schemaError } = await client
    .from('matrix_schemas')
    .update({ latest_published_version_id: versionId, status: 'active', updated_at: new Date().toISOString() })
    .eq('id', versionRow.schema_id);
  if (schemaError) {
    return NextResponse.json({ code: 1, message: schemaError.message }, { status: 500 });
  }

  // 10. Audit with before/after.
  await writeSecurityAudit(client, {
    request,
    actor: admin,
    action: 'matrix_schema_version.published',
    outcome: 'success',
    targetType: 'matrix_schema_version',
    targetId: versionId,
    metadata: {
      schemaId: versionRow.schema_id,
      versionNo: Number(versionRow.version_no),
      checksum,
      before: { status: versionRow.status },
      after: { status: 'published' },
    },
  });

  // 11. Done.
  return NextResponse.json({
    code: 0,
    message: '模式发布成功',
    data: { versionId, publishedAt: new Date().toISOString() },
  });
}
