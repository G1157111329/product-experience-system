import { isProductionRuntime, requireEnv } from './security-config';
import { validatePasswordStrength } from './password';

type DatabaseAccessMode = 'self-hosted-postgres' | 'supabase-service-role';

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

function assertSchemaVerified() {
  const verified = process.env.SECURITY_SCHEMA_VERIFIED;
  if (verified !== 'true' && verified !== '1') {
    throw new Error(
      'SECURITY_SCHEMA_VERIFIED=true is required in production after running database-schema.sql and scripts/verify-security-schema.sql',
    );
  }
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

function assertSupabaseServiceRoleMode() {
  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!url.startsWith('https://')) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL must be an HTTPS URL in production');
  }
  if (anonKey && anonKey === serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY must not be reused as NEXT_PUBLIC_SUPABASE_ANON_KEY');
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

export function validateProductionStartupSecurity() {
  assertInitialAdminBootstrapConfig();
  if (!isProductionRuntime()) return;

  requireEnv('AUTH_SESSION_SECRET');
  requireEnv('AI_CONFIG_ENCRYPTION_KEY');
  assertSchemaVerified();
  assertLocalUploadAccessMode();

  const mode = normalizeDatabaseAccessMode(process.env.DATABASE_ACCESS_MODE);
  if (!mode) {
    throw new Error(
      'DATABASE_ACCESS_MODE is required in production: self-hosted-postgres or supabase-service-role',
    );
  }

  if (mode === 'self-hosted-postgres') {
    assertSelfHostedPostgresMode();
  } else {
    assertSupabaseServiceRoleMode();
  }
}
