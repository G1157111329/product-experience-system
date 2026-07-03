import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { isAuthResponse, requireAdmin, requireUser } from '@/lib/server/auth';
import { writeSecurityAudit } from '@/lib/server/security-audit';

type SchemaRow = {
  id: string;
  schema_key: string;
  name: string;
  product_category: string | null;
  experience_type_allowlist: string[] | null;
  status: string;
  latest_published_version_id: string | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
};

type VersionSummary = { id: string; version_no: number; status: string };

// GET /api/matrix-schemas — list all schemas with their latest published version
// summary (any logged-in user can browse the schema library).
export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const { data: schemas, error } = await client
    .from('matrix_schemas')
    .select(
      'id, schema_key, name, product_category, experience_type_allowlist, status, latest_published_version_id, owner_id, created_at, updated_at',
    )
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });

  const schemaRows = (schemas || []) as SchemaRow[];
  const versionIds = schemaRows
    .map((s) => s.latest_published_version_id)
    .filter((id): id is string => Boolean(id));

  let versionsById: Record<string, VersionSummary> = {};
  if (versionIds.length > 0) {
    const { data: versions, error: versionError } = await client
      .from('matrix_schema_versions')
      .select('id, version_no, status')
      .in('id', versionIds);
    if (versionError) return NextResponse.json({ code: 1, message: versionError.message }, { status: 500 });
    versionsById = Object.fromEntries(
      ((versions || []) as VersionSummary[]).map((v) => [v.id, { id: v.id, version_no: Number(v.version_no), status: v.status }]),
    );
  }

  const result = schemaRows.map((s) => ({
    id: s.id,
    schemaKey: s.schema_key,
    name: s.name,
    productCategory: s.product_category,
    experienceTypeAllowlist: s.experience_type_allowlist ?? [],
    status: s.status,
    ownerId: s.owner_id,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
    latestPublishedVersion: s.latest_published_version_id ? versionsById[s.latest_published_version_id] ?? null : null,
  }));

  return NextResponse.json({ code: 0, data: result });
}

// POST /api/matrix-schemas — admin creates a new schema (draft) with an empty
// draft version_no=1. Returns { schemaId, versionId }.
export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const admin = await requireAdmin(request, client);
  if (isAuthResponse(admin)) return admin;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ code: 1, message: '请求体不能为空' }, { status: 400 });
  }

  const schemaKey = typeof body.schemaKey === 'string' ? body.schemaKey.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!schemaKey) return NextResponse.json({ code: 1, message: 'schemaKey 不能为空' }, { status: 400 });
  if (!name) return NextResponse.json({ code: 1, message: 'name 不能为空' }, { status: 400 });

  const productCategory = typeof body.productCategory === 'string' && body.productCategory.trim()
    ? body.productCategory.trim()
    : null;
  const allowlist = Array.isArray(body.experienceTypeAllowlist)
    ? body.experienceTypeAllowlist.filter((x: unknown): x is string => typeof x === 'string')
    : [];

  // Uniqueness check on schema_key → 409 if exists.
  const { data: existing } = await client
    .from('matrix_schemas')
    .select('id')
    .eq('schema_key', schemaKey)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ code: 1, message: 'schemaKey 已存在' }, { status: 409 });
  }

  const { data: schemaRow, error: schemaError } = await client
    .from('matrix_schemas')
    .insert({
      schema_key: schemaKey,
      name,
      product_category: productCategory,
      experience_type_allowlist: allowlist,
      status: 'draft',
      owner_id: admin.id,
    })
    .select('id')
    .single();
  if (schemaError) {
    if (schemaError.code === '23505') {
      return NextResponse.json({ code: 1, message: 'schemaKey 已存在' }, { status: 409 });
    }
    return NextResponse.json({ code: 1, message: schemaError.message }, { status: 500 });
  }
  const schemaId = String(schemaRow.id);

  // Seed an empty draft version_no=1 so the schema has something to publish.
  const emptySchemaJson = {
    schemaKey,
    version: 1,
    title: name,
    axes: [],
    dimensions: [],
    formulas: [],
  };
  const { data: versionRow, error: versionError } = await client
    .from('matrix_schema_versions')
    .insert({
      schema_id: schemaId,
      version_no: 1,
      status: 'draft',
      schema_json: emptySchemaJson,
    })
    .select('id')
    .single();
  if (versionError) {
    return NextResponse.json({ code: 1, message: versionError.message }, { status: 500 });
  }
  const versionId = String(versionRow.id);

  await writeSecurityAudit(client, {
    request,
    actor: admin,
    action: 'matrix_schema.created',
    outcome: 'success',
    targetType: 'matrix_schema',
    targetId: schemaId,
    metadata: { schemaKey, name, versionId },
  });

  return NextResponse.json({ code: 0, data: { schemaId, versionId } }, { status: 201 });
}
