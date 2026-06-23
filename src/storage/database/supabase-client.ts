/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Database client factory.
 *
 * Mode selection:
 *  - If NEXT_PUBLIC_SUPABASE_URL is set → use real Supabase JS client (cloud)
 *  - Otherwise → use local PostgreSQL via Drizzle ORM (self-hosted)
 *
 * Self-hosted mode uses SupabasePgClient which provides a Supabase-compatible
 * query interface backed by Drizzle ORM + pg driver.
 */

import { SupabasePgClient } from './pg-query';
import { createClient } from '@supabase/supabase-js';

// Re-export schema for any direct Drizzle usage
export { platformUsers, platformAuditRequests, platformCategories, platformProducts,
  standards, standardItems, experienceTasks, checkRecords, materials, recipes,
  recipeSteps, issues, reportTemplates, reports, reportShares, recipeLibrary,
  recipeLibrarySteps, platformSettings, aiModelConfigs, agentSkillTemplates,
  agentSkillVersions, agentSkillAuditLogs, securityAuditLogs, securityRateLimits,
  comparisonAssemblies, comparisonObjects, comparisonItemNodes, comparisonMatrixCells,
  metricDefinitions, metricFormulaVersions, metricThresholdRules, metricEvaluations,
  comparisonAiResults, reportSnapshots, pdfGenerationJobs, excelImportJobs,
  excelImportTemplates } from './shared/schema';

function getSupabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL;
}

function getSupabaseAnonKey(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

function getSupabaseServerKey(): string | undefined {
  if (process.env.NODE_ENV === 'production') return process.env.SUPABASE_SERVICE_ROLE_KEY;
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

function getDatabaseAccessMode(): 'self-hosted-postgres' | 'supabase-service-role' | 'auto' {
  const raw = (process.env.DATABASE_ACCESS_MODE || '').trim().toLowerCase();
  if (!raw) return 'auto';
  if (raw === 'self-hosted-postgres' || raw === 'postgres' || raw === 'pg') return 'self-hosted-postgres';
  if (raw === 'supabase-service-role' || raw === 'supabase') return 'supabase-service-role';
  throw new Error('DATABASE_ACCESS_MODE must be one of: self-hosted-postgres, supabase-service-role');
}

function hasSupabaseConfig(): boolean {
  const mode = getDatabaseAccessMode();
  if (mode === 'self-hosted-postgres') return false;
  const url = getSupabaseUrl();
  const serverKey = getSupabaseServerKey();
  const configured = !!(
    url &&
    serverKey &&
    url.startsWith('https://')
  );
  if (mode === 'supabase-service-role' && !configured) {
    throw new Error('Supabase service-role mode requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  }
  return configured;
}

let _supabaseClient: any = null;

function getSupabaseClient(): any {
  if (hasSupabaseConfig()) {
    // Cloud mode: use real Supabase client
    if (!_supabaseClient) {
      const url = getSupabaseUrl()!;
      const serverKey = getSupabaseServerKey()!;
      if (process.env.NODE_ENV === 'production' && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY is required in production Supabase mode');
      }
      _supabaseClient = createClient(
        url,
        serverKey,
        {
          auth: { autoRefreshToken: false, persistSession: false },
          db: { timeout: 60000 },
        }
      );
    }
    return _supabaseClient;
  }

  // Self-hosted mode: use Drizzle-backed Supabase-compatible client
  return new SupabasePgClient();
}

function getSupabaseCredentials() {
  if (hasSupabaseConfig()) {
    return {
      url: getSupabaseUrl()!,
      anonKey: getSupabaseAnonKey()!,
    };
  }
  return { url: '', anonKey: '' };
}

function getSupabaseServiceRoleKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}

// Keep loadEnv for compatibility but it's no-op in self-hosted mode
function loadEnv() {
  // dotenv handled by Next.js automatically
}

export { loadEnv, getSupabaseCredentials, getSupabaseServiceRoleKey, getSupabaseClient };
