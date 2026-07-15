import { isProductionRuntime, requireEnv } from './security-config';
import { validatePasswordStrength } from './password';

type DatabaseAccessMode = 'self-hosted-postgres' | 'supabase-service-role';
type SchemaProbeQuery = (sql: string) => Promise<{ rows: Array<Record<string, unknown>> }>;
type SupabaseSchemaProbeClient = {
  rpc: (name: string) => Promise<{
    data: Array<Record<string, unknown>> | Record<string, unknown> | null;
    error: { message?: string } | null;
  }>;
};

function normalizeDatabaseAccessMode(value: string | undefined): DatabaseAccessMode | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'self-hosted-postgres' || normalized === 'postgres' || normalized === 'pg') {
    return 'self-hosted-postgres';
  }
  if (normalized === 'supabase-service-role' || normalized === 'supabase') {
    return 'supabase-service-role';
  }
  throw new Error(
    'DATABASE_ACCESS_MODE must be one of: self-hosted-postgres, supabase-service-role',
  );
}

export function assertSupportedDatabaseMode(
  env: NodeJS.ProcessEnv,
): 'self-hosted-postgres' {
  if (env.NODE_ENV !== 'production') return 'self-hosted-postgres';
  const mode = normalizeDatabaseAccessMode(env.DATABASE_ACCESS_MODE);
  if (!mode) {
    throw new Error('DATABASE_ACCESS_MODE=self-hosted-postgres is required in production');
  }
  if (mode === 'supabase-service-role') {
    throw new Error(
      'DATABASE_ACCESS_MODE=supabase-service-role is experimental and disabled for production',
    );
  }
  return mode;
}

function assertSchemaVerified() {
  const verified = process.env.SECURITY_SCHEMA_VERIFIED;
  if (verified !== 'true' && verified !== '1') {
    throw new Error(
      'SECURITY_SCHEMA_VERIFIED=true is required in production after running database-schema.sql and scripts/verify-security-schema.sql',
    );
  }
}

/** Runs the same structural checks as verify-security-schema.sql against the live database. */
export async function verifySecuritySchemaProbe(query: SchemaProbeQuery): Promise<void> {
  let result: { rows: Array<Record<string, unknown>> };
  try {
    result = await query(`
      SELECT
        to_regclass('public.security_audit_logs') IS NOT NULL AS audit_logs_present,
        to_regclass('public.security_rate_limits') IS NOT NULL AS rate_limits_present,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'security_audit_logs' AND column_name = 'id') AS audit_logs_id_column,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'security_audit_logs' AND column_name = 'action') AS audit_logs_action_column,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'security_audit_logs' AND column_name = 'outcome') AS audit_logs_outcome_column,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'security_audit_logs' AND column_name = 'metadata') AS audit_logs_metadata_column,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'security_audit_logs' AND column_name = 'created_at') AS audit_logs_created_at_column,
        EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.security_audit_logs') AND contype = 'p') AS audit_logs_primary_key,
        EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('public.security_audit_logs_action_idx') AND pg_get_indexdef(indexrelid) LIKE '%(action)%') AS audit_logs_action_index,
        EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('public.security_audit_logs_actor_user_id_idx') AND pg_get_indexdef(indexrelid) LIKE '%(actor_user_id)%') AS audit_logs_actor_index,
        EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('public.security_audit_logs_target_idx') AND pg_get_indexdef(indexrelid) LIKE '%(target_type, target_id)%') AS audit_logs_target_index,
        EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('public.security_audit_logs_created_at_idx') AND pg_get_indexdef(indexrelid) LIKE '%(created_at)%') AS audit_logs_created_at_index,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'security_rate_limits' AND column_name = 'rate_key') AS rate_limits_rate_key_column,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'security_rate_limits' AND column_name = 'count') AS rate_limits_count_column,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'security_rate_limits' AND column_name = 'reset_at') AS rate_limits_reset_at_column,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'security_rate_limits' AND column_name = 'updated_at') AS rate_limits_updated_at_column,
        EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.security_rate_limits') AND contype = 'p') AS rate_limits_primary_key,
        EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = 'public' AND policyname = 'allow_all'
        ) AS insecure_policy_present
    `);
  } catch {
    throw new Error('Security schema verification failed: unable to query required security tables');
  }

  assertSecuritySchemaProbeRow(result.rows[0] || {});
}

function assertSecuritySchemaProbeRow(row: Record<string, unknown>) {
  if (row.audit_logs_present !== true) {
    throw new Error('Security schema verification failed: missing table security_audit_logs');
  }
  if (row.rate_limits_present !== true) {
    throw new Error('Security schema verification failed: missing table security_rate_limits');
  }
  if (row.insecure_policy_present === true) {
    throw new Error('Security schema verification failed: insecure RLS policy allow_all is present');
  }
  const requirements: Array<[string, string]> = [
    ['audit_logs_id_column', 'missing column security_audit_logs.id'],
    ['audit_logs_action_column', 'missing column security_audit_logs.action'],
    ['audit_logs_outcome_column', 'missing column security_audit_logs.outcome'],
    ['audit_logs_metadata_column', 'missing column security_audit_logs.metadata'],
    ['audit_logs_created_at_column', 'missing column security_audit_logs.created_at'],
    ['audit_logs_primary_key', 'missing primary key security_audit_logs'],
    ['audit_logs_action_index', 'missing or invalid index security_audit_logs_action_idx'],
    ['audit_logs_actor_index', 'missing or invalid index security_audit_logs_actor_user_id_idx'],
    ['audit_logs_target_index', 'missing or invalid index security_audit_logs_target_idx'],
    ['audit_logs_created_at_index', 'missing or invalid index security_audit_logs_created_at_idx'],
    ['rate_limits_rate_key_column', 'missing column security_rate_limits.rate_key'],
    ['rate_limits_count_column', 'missing column security_rate_limits.count'],
    ['rate_limits_reset_at_column', 'missing column security_rate_limits.reset_at'],
    ['rate_limits_updated_at_column', 'missing column security_rate_limits.updated_at'],
    ['rate_limits_primary_key', 'missing primary key security_rate_limits'],
  ];
  for (const [key, message] of requirements) {
    if (row[key] !== true) throw new Error(`Security schema verification failed: ${message}`);
  }
}

/** Calls the restricted database RPC so Supabase service-role startup checks policies too. */
export async function verifySupabaseSecuritySchemaProbe(client: SupabaseSchemaProbeClient): Promise<void> {
  const { data, error } = await client.rpc('verify_security_schema_probe');
  if (error) {
    throw new Error('Security schema verification failed: unable to run security schema probe');
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Security schema verification failed: security schema probe returned no result');
  assertSecuritySchemaProbeRow(row);
}

function assertNoDevelopmentDatabaseUrl(databaseUrl: string) {
  const lower = databaseUrl.toLowerCase();
  if (lower.includes('bear2026') || lower.includes('127.0.0.1') || lower.includes('localhost')) {
    throw new Error('DATABASE_URL points to a development database or default credential in production');
  }
}

function assertSelfHostedPostgresMode() {
  const databaseUrl = requireEnv('DATABASE_URL');
  assertNoDevelopmentDatabaseUrl(databaseUrl);

  if (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error(
      'Self-hosted PostgreSQL mode must not expose NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in production',
    );
  }
}

function assertLocalUploadAccessMode() {
  const mode = (process.env.LOCAL_UPLOAD_PUBLIC_ACCESS || 'public').trim().toLowerCase();
  if (mode !== 'protected' && mode !== 'public') {
    throw new Error('LOCAL_UPLOAD_PUBLIC_ACCESS must be either protected or public');
  }
}

function assertInitialAdminBootstrapConfig() {
  const account = process.env.INITIAL_ADMIN_ACCOUNT?.trim() || '';
  const password = process.env.INITIAL_ADMIN_PASSWORD || '';
  if (!account && !password) return;
  if (!account || !password) {
    throw new Error('INITIAL_ADMIN_ACCOUNT and INITIAL_ADMIN_PASSWORD must be set together');
  }
  const passwordError = validatePasswordStrength(password);
  if (passwordError) throw new Error(`INITIAL_ADMIN_PASSWORD is weak: ${passwordError}`);
}

function hasInitialAdminBootstrapConfig() {
  return Boolean(process.env.INITIAL_ADMIN_ACCOUNT?.trim() && process.env.INITIAL_ADMIN_PASSWORD);
}

export function shouldShowInitialAdminSecurityReminder(input: {
  initialAdminConfigured: boolean;
  hasAdmin: boolean;
}) {
  return input.initialAdminConfigured && input.hasAdmin;
}

async function verifyLiveSecuritySchema(mode: DatabaseAccessMode) {
  if (mode === 'self-hosted-postgres') {
    const { getPool } = await import('@/storage/database/pg-db');
    await verifySecuritySchemaProbe(async (sql) => {
      const result = await getPool().query(sql);
      return { rows: result.rows as Array<Record<string, unknown>> };
    });
    const { verifyRequiredSchemaManifest } = await import('./schema-manifest');
    await verifyRequiredSchemaManifest();
    return;
  }

  // Supabase service-role cannot query pg_catalog through REST. The restricted RPC
  // executes the same table and policy checks as scripts/verify-security-schema.sql.
  const { getSupabaseClient } = await import('@/storage/database/supabase-client');
  await verifySupabaseSecuritySchemaProbe(getSupabaseClient() as SupabaseSchemaProbeClient);
}

async function hasExistingAdmin(mode: DatabaseAccessMode): Promise<boolean> {
  if (!hasInitialAdminBootstrapConfig()) return false;
  if (mode === 'self-hosted-postgres') {
    const { getPool } = await import('@/storage/database/pg-db');
    const result = await getPool().query("SELECT EXISTS (SELECT 1 FROM platform_users WHERE role = 'admin') AS has_admin");
    return result.rows[0]?.has_admin === true;
  }
  const { getSupabaseClient } = await import('@/storage/database/supabase-client');
  const { data, error } = await getSupabaseClient()
    .from('platform_users')
    .select('id')
    .eq('role', 'admin')
    .limit(1);
  if (error) {
    console.warn('[security] unable to determine whether an administrator already exists');
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

export async function validateProductionStartupSecurity() {
  assertInitialAdminBootstrapConfig();
  if (!isProductionRuntime()) return;

  requireEnv('AUTH_SESSION_SECRET');
  requireEnv('AI_CONFIG_ENCRYPTION_KEY');
  assertSchemaVerified();
  assertLocalUploadAccessMode();

  const mode = assertSupportedDatabaseMode(process.env);

  assertSelfHostedPostgresMode();

  await verifyLiveSecuritySchema(mode);
  if (shouldShowInitialAdminSecurityReminder({
    initialAdminConfigured: hasInitialAdminBootstrapConfig(),
    hasAdmin: await hasExistingAdmin(mode),
  })) {
    console.warn('[security] INITIAL_ADMIN_* remains configured after an administrator exists; remove both bootstrap variables');
  }
}
