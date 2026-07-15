import assert from 'node:assert/strict';
import * as startupSecurity from './startup-security';

type Probe = (query: (sql: string) => Promise<{ rows: Array<Record<string, unknown>> }>) => Promise<void>;
type SupabaseProbe = (client: { rpc: (name: string) => Promise<{ data: Array<Record<string, unknown>> | null; error: { message?: string } | null }> }) => Promise<void>;

async function main() {
  const assertSupportedDatabaseMode = (startupSecurity as unknown as {
    assertSupportedDatabaseMode?: (env: NodeJS.ProcessEnv) => 'self-hosted-postgres';
  }).assertSupportedDatabaseMode;
  assert.equal(typeof assertSupportedDatabaseMode, 'function');
  assert.equal(
    assertSupportedDatabaseMode?.({ NODE_ENV: 'production', DATABASE_ACCESS_MODE: 'self-hosted-postgres' }),
    'self-hosted-postgres',
  );
  assert.throws(
    () => assertSupportedDatabaseMode?.({ NODE_ENV: 'production', DATABASE_ACCESS_MODE: 'supabase-service-role' }),
    /supabase-service-role.*experimental.*disabled/i,
  );
  assert.doesNotThrow(() => assertSupportedDatabaseMode?.({ NODE_ENV: 'development' }));
  assert.doesNotThrow(() => assertSupportedDatabaseMode?.({ NODE_ENV: 'test', DATABASE_ACCESS_MODE: 'supabase-service-role' }));

  const probe = (startupSecurity as unknown as { verifySecuritySchemaProbe?: Probe }).verifySecuritySchemaProbe;
  assert.equal(typeof probe, 'function', 'production startup must execute actual security schema probes');

  let queried = '';
  const healthyRow = {
    audit_logs_present: true, rate_limits_present: true, insecure_policy_present: false,
    audit_logs_id_column: true, audit_logs_action_column: true, audit_logs_outcome_column: true,
    audit_logs_metadata_column: true, audit_logs_created_at_column: true, audit_logs_primary_key: true,
    audit_logs_action_index: true, audit_logs_actor_index: true, audit_logs_target_index: true, audit_logs_created_at_index: true,
    rate_limits_rate_key_column: true, rate_limits_count_column: true, rate_limits_reset_at_column: true,
    rate_limits_updated_at_column: true, rate_limits_primary_key: true,
  };
  await probe!(async (sql) => {
    queried = sql;
    return { rows: [healthyRow] };
  });
  assert.match(queried, /security_audit_logs/);
  assert.match(queried, /security_rate_limits/);

  await assert.rejects(
    () => probe!(async () => ({ rows: [{ ...healthyRow, audit_logs_present: false }] })),
    /security_audit_logs/,
  );
  await assert.rejects(
    () => probe!(async () => ({ rows: [{ ...healthyRow, audit_logs_target_index: false }] })),
    /security_audit_logs_target_idx/,
  );

  const shouldShowReminder = (startupSecurity as unknown as {
    shouldShowInitialAdminSecurityReminder?: (input: { initialAdminConfigured: boolean; hasAdmin: boolean }) => boolean;
  }).shouldShowInitialAdminSecurityReminder;
  assert.equal(shouldShowReminder?.({ initialAdminConfigured: true, hasAdmin: true }), true);
  assert.equal(shouldShowReminder?.({ initialAdminConfigured: true, hasAdmin: false }), false);

  const supabaseProbe = (startupSecurity as unknown as { verifySupabaseSecuritySchemaProbe?: SupabaseProbe }).verifySupabaseSecuritySchemaProbe;
  assert.equal(typeof supabaseProbe, 'function', 'Supabase startup must probe policy safety, not only table access');
  let rpcName = '';
  await supabaseProbe!({
    rpc: async (name) => {
      rpcName = name;
      return { data: [healthyRow], error: null };
    },
  });
  assert.equal(rpcName, 'verify_security_schema_probe');
  await assert.rejects(
    () => supabaseProbe!({ rpc: async () => ({ data: [{ ...healthyRow, insecure_policy_present: true }], error: null }) }),
    /allow_all/,
  );
}

main();
