import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { isAuthResponse, requireAdmin } from '@/lib/server/auth';
import { writeSecurityAudit } from '@/lib/server/security-audit';
import { compileFormula, buildDependencyGraph, parseErrorToCode } from '@/lib/matrix/formula-engine';

interface DraftDimension {
  dimensionKey: string;
  displayName: string;
  columnGroup: 'observed' | 'calculated';
  valueKind: string;
  unitCode?: string;
  required?: boolean;
  editable?: boolean;
  sortOrder: number;
  displayFormat?: { decimals?: number; durationFormat?: string };
  validation?: { min?: number; max?: number; enumValues?: string[] };
}

interface DraftFormula {
  outputDimensionKey: string;
  formulaDsl: string;
  scope: 'row' | 'group';
  formulaVersion: string;
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = getSupabaseClient();
  const admin = await requireAdmin(request, client);
  if (isAuthResponse(admin)) return admin;
  const { id: versionId } = await params;

  // 1. Load version; reject if published (immutable).
  const { data: version, error: vErr } = await client.from('matrix_schema_versions')
    .select('id, status').eq('id', versionId).maybeSingle();
  if (vErr) return NextResponse.json({ code: 1, message: vErr.message }, { status: 500 });
  if (!version) return NextResponse.json({ code: 1, message: '版本不存在' }, { status: 404 });
  if (version.status === 'published') {
    return NextResponse.json({ code: 1, message: '该版本已发布，不能修改', data: { code: 'MATRIX_SCHEMA_VERSION_IMMUTABLE' } }, { status: 409 });
  }

  const body = await request.json().catch(() => null) as { dimensions?: DraftDimension[]; formulas?: DraftFormula[] } | null;
  if (!body || !Array.isArray(body.dimensions) || !Array.isArray(body.formulas)) {
    return NextResponse.json({ code: 1, message: '请求格式不正确' }, { status: 400 });
  }

  // 2. Compile-verify every formula + check dependencies reference known dimensions.
  //    Defense vs frontend bypass — even though FormulaBuilder validates client-side,
  //    a direct API call could send arbitrary DSL.
  const knownKeys = new Set(body.dimensions.map(d => d.dimensionKey));
  for (const f of body.formulas) {
    try {
      compileFormula(f.formulaDsl);
      const deps = buildDependencyGraph(f.formulaDsl);
      for (const dep of deps) {
        if (!knownKeys.has(dep)) {
          return NextResponse.json({ code: 1, message: `公式 ${f.outputDimensionKey} 引用了未知维度 ${dep}`, data: { code: 'MATRIX_FORMULA_DIMENSION_NOT_FOUND' } }, { status: 422 });
        }
      }
    } catch (err) {
      const code = parseErrorToCode(err) ?? 'MATRIX_FORMULA_PARSE_ERROR';
      return NextResponse.json({ code: 1, message: err instanceof Error ? err.message : '公式编译失败', data: { code } }, { status: 422 });
    }
  }

  // 3. Replace strategy: delete this version's existing bindings + formulas, then insert.
  //    Idempotent — repeated saves don't accumulate. Only touches this version's rows.
  const { error: delBErr } = await client.from('matrix_dimension_bindings').delete().eq('schema_version_id', versionId);
  if (delBErr) return NextResponse.json({ code: 1, message: delBErr.message }, { status: 500 });
  const { error: delFErr } = await client.from('matrix_formula_definitions').delete().eq('schema_version_id', versionId);
  if (delFErr) return NextResponse.json({ code: 1, message: delFErr.message }, { status: 500 });

  // 4. Insert dimensions.
  if (body.dimensions.length > 0) {
    const dimRows = body.dimensions.map(d => ({
      schema_version_id: versionId,
      dimension_key: d.dimensionKey,
      display_name: d.displayName,
      column_group: d.columnGroup,
      value_kind: d.valueKind,
      unit_code: d.unitCode ?? null,
      required: d.required ?? false,
      editable: d.editable ?? true,
      sort_order: d.sortOrder,
      display_format_json: d.displayFormat ?? {},
      validation_rule_json: d.validation ?? {},
    }));
    const { error: insBErr } = await client.from('matrix_dimension_bindings').insert(dimRows);
    if (insBErr) return NextResponse.json({ code: 1, message: insBErr.message }, { status: 500 });
  }

  // 5. Insert formulas.
  if (body.formulas.length > 0) {
    const formulaRows = body.formulas.map(f => ({
      schema_version_id: versionId,
      output_dimension_key: f.outputDimensionKey,
      formula_dsl: f.formulaDsl,
      scope: f.scope,
      formula_version: f.formulaVersion,
      status: 'draft',
    }));
    const { error: insFErr } = await client.from('matrix_formula_definitions').insert(formulaRows);
    if (insFErr) return NextResponse.json({ code: 1, message: insFErr.message }, { status: 500 });
  }

  // 6. Audit (best-effort).
  try {
    await writeSecurityAudit(client, {
      request, actor: admin, action: 'matrix_schema_draft.saved', outcome: 'success',
      targetType: 'matrix_schema_version', targetId: versionId,
      metadata: { dimensions: body.dimensions.length, formulas: body.formulas.length },
    });
  } catch { /* audit failure must not lose the save */ }

  return NextResponse.json({ code: 0, message: '草稿已保存', data: { versionId, dimensions: body.dimensions.length, formulas: body.formulas.length } });
}
