-- Supabase service-role startup cannot query pg_catalog through PostgREST.
-- This restricted RPC returns only the same booleans checked by verify-security-schema.sql.
DROP FUNCTION IF EXISTS public.verify_security_schema_probe();
CREATE OR REPLACE FUNCTION public.verify_security_schema_probe()
RETURNS TABLE (
  audit_logs_present BOOLEAN,
  rate_limits_present BOOLEAN,
  audit_logs_id_column BOOLEAN,
  audit_logs_action_column BOOLEAN,
  audit_logs_outcome_column BOOLEAN,
  audit_logs_metadata_column BOOLEAN,
  audit_logs_created_at_column BOOLEAN,
  audit_logs_primary_key BOOLEAN,
  audit_logs_action_index BOOLEAN,
  audit_logs_actor_index BOOLEAN,
  audit_logs_target_index BOOLEAN,
  audit_logs_created_at_index BOOLEAN,
  rate_limits_rate_key_column BOOLEAN,
  rate_limits_count_column BOOLEAN,
  rate_limits_reset_at_column BOOLEAN,
  rate_limits_updated_at_column BOOLEAN,
  rate_limits_primary_key BOOLEAN,
  insecure_policy_present BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    to_regclass('public.security_audit_logs') IS NOT NULL,
    to_regclass('public.security_rate_limits') IS NOT NULL,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'security_audit_logs' AND column_name = 'id'),
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'security_audit_logs' AND column_name = 'action'),
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'security_audit_logs' AND column_name = 'outcome'),
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'security_audit_logs' AND column_name = 'metadata'),
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'security_audit_logs' AND column_name = 'created_at'),
    EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.security_audit_logs') AND contype = 'p'),
    EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('public.security_audit_logs_action_idx') AND pg_get_indexdef(indexrelid) LIKE '%(action)%'),
    EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('public.security_audit_logs_actor_user_id_idx') AND pg_get_indexdef(indexrelid) LIKE '%(actor_user_id)%'),
    EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('public.security_audit_logs_target_idx') AND pg_get_indexdef(indexrelid) LIKE '%(target_type, target_id)%'),
    EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('public.security_audit_logs_created_at_idx') AND pg_get_indexdef(indexrelid) LIKE '%(created_at)%'),
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'security_rate_limits' AND column_name = 'rate_key'),
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'security_rate_limits' AND column_name = 'count'),
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'security_rate_limits' AND column_name = 'reset_at'),
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'security_rate_limits' AND column_name = 'updated_at'),
    EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.security_rate_limits') AND contype = 'p'),
    EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND policyname = 'allow_all'
    );
$$;
REVOKE ALL ON FUNCTION public.verify_security_schema_probe() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.verify_security_schema_probe() TO service_role;
  END IF;
END;
$$;
