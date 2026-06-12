DO $$
BEGIN
  IF to_regclass('public.security_audit_logs') IS NULL THEN
    RAISE EXCEPTION 'missing table: security_audit_logs';
  END IF;

  IF to_regclass('public.security_rate_limits') IS NULL THEN
    RAISE EXCEPTION 'missing table: security_rate_limits';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname = 'allow_all'
  ) THEN
    RAISE EXCEPTION 'insecure RLS policy found: allow_all';
  END IF;
END $$;
