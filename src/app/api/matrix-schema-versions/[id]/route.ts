import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { isAuthResponse, requireAdmin } from '@/lib/server/auth';

// GET /api/matrix-schema-versions/[id] — admin loads a draft's full state
// (version metadata + dimension bindings + formula definitions) so the
// settings UI can render and edit it. Draft content is admin-only territory.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = getSupabaseClient();
  const admin = await requireAdmin(request, client);
  if (isAuthResponse(admin)) return admin;
  const { id: versionId } = await params;

  const { data: version, error: vErr } = await client.from('matrix_schema_versions')
    .select('id, schema_id, version_no, status, schema_json, published_at, published_by')
    .eq('id', versionId).maybeSingle();
  if (vErr) return NextResponse.json({ code: 1, message: vErr.message }, { status: 500 });
  if (!version) return NextResponse.json({ code: 1, message: '版本不存在' }, { status: 404 });

  const { data: bindings, error: bErr } = await client.from('matrix_dimension_bindings')
    .select('dimension_key, display_name, column_group, value_kind, unit_code, required, editable, sort_order, display_format_json, validation_rule_json')
    .eq('schema_version_id', versionId)
    .order('sort_order', { ascending: true });
  if (bErr) return NextResponse.json({ code: 1, message: bErr.message }, { status: 500 });

  const { data: formulas, error: fErr } = await client.from('matrix_formula_definitions')
    .select('id, output_dimension_key, formula_dsl, scope, formula_version, status')
    .eq('schema_version_id', versionId);
  if (fErr) return NextResponse.json({ code: 1, message: fErr.message }, { status: 500 });

  return NextResponse.json({ code: 0, message: 'success', data: { version, dimensions: bindings || [], formulas: formulas || [] } });
}
