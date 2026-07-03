import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { isAuthResponse, requireAdmin } from '@/lib/server/auth';
import { writeSecurityAudit } from '@/lib/server/security-audit';

type VersionRow = { id: string; version_no: number };

// POST /api/matrix-schemas/[id]/versions — admin creates a new draft version of
// an existing schema. version_no = max(existing) + 1. The body's schemaJson is
// persisted as-is; the caller is responsible for later projecting dimensions and
// formulas into the normalized tables before publishing. Returns { versionId }.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: schemaId } = await params;
  const client = getSupabaseClient();
  const admin = await requireAdmin(request, client);
  if (isAuthResponse(admin)) return admin;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || body.schemaJson === undefined || body.schemaJson === null) {
    return NextResponse.json({ code: 1, message: 'schemaJson 不能为空' }, { status: 400 });
  }

  // Load the schema header (also confirms it exists).
  const { data: schema, error: schemaError } = await client
    .from('matrix_schemas')
    .select('id, schema_key, name')
    .eq('id', schemaId)
    .maybeSingle();
  if (schemaError) return NextResponse.json({ code: 1, message: schemaError.message }, { status: 500 });
  if (!schema) return NextResponse.json({ code: 1, message: '模式不存在' }, { status: 404 });

  // Compute next version_no = max(existing) + 1, defaulting to 1 if none exist.
  const { data: versions, error: versionsError } = await client
    .from('matrix_schema_versions')
    .select('id, version_no')
    .eq('schema_id', schemaId)
    .order('version_no', { ascending: false });
  if (versionsError) return NextResponse.json({ code: 1, message: versionsError.message }, { status: 500 });

  const maxVersionNo = ((versions || []) as VersionRow[]).reduce(
    (max, v) => Math.max(max, Number(v.version_no)),
    0,
  );
  const nextVersionNo = maxVersionNo + 1;

  const { data: versionRow, error: insertError } = await client
    .from('matrix_schema_versions')
    .insert({
      schema_id: schemaId,
      version_no: nextVersionNo,
      status: 'draft',
      schema_json: body.schemaJson,
    })
    .select('id')
    .single();
  if (insertError) return NextResponse.json({ code: 1, message: insertError.message }, { status: 500 });

  const versionId = String(versionRow.id);
  await writeSecurityAudit(client, {
    request,
    actor: admin,
    action: 'matrix_schema_version.created',
    outcome: 'success',
    targetType: 'matrix_schema_version',
    targetId: versionId,
    metadata: { schemaId, versionNo: nextVersionNo },
  });

  return NextResponse.json({ code: 0, data: { versionId } }, { status: 201 });
}
