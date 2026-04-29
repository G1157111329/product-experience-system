/**
 * Database client factory.
 *
 * Mode selection:
 *  - If COZE_SUPABASE_URL is set → use real Supabase JS client (cloud)
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
  recipeLibrarySteps, platformSettings } from './shared/schema';

function getSupabaseUrl(): string | undefined {
  return process.env.COZE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
}

function getSupabaseAnonKey(): string | undefined {
  return process.env.COZE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

function hasSupabaseConfig(): boolean {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  return !!(
    url &&
    anonKey &&
    url.startsWith('https://')
  );
}

let _supabaseClient: any = null;

function getSupabaseClient(): any {
  if (hasSupabaseConfig()) {
    // Cloud mode: use real Supabase client
    if (!_supabaseClient) {
      const url = getSupabaseUrl()!;
      const anonKey = getSupabaseAnonKey()!;
      _supabaseClient = createClient(
        url,
        anonKey,
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
  return process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
}

// Keep loadEnv for compatibility but it's no-op in self-hosted mode
function loadEnv() {
  // dotenv handled by Next.js automatically
}

export { loadEnv, getSupabaseCredentials, getSupabaseServiceRoleKey, getSupabaseClient };
