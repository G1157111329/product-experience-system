-- Allow Hermes runs triggered by personal WeChat iLink inbound messages.
-- Root cause of WeChat no-reply: insert into agent_runs with trigger=ilink_ingest
-- failed the legacy CHECK that only allowed wecom_ingest among external channels.

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'agent_runs'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%trigger%'
      AND pg_get_constraintdef(con.oid) NOT ILIKE '%ilink_ingest%'
  LOOP
    EXECUTE format('ALTER TABLE agent_runs DROP CONSTRAINT IF EXISTS %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE agent_runs DROP CONSTRAINT IF EXISTS agent_runs_trigger_check;

ALTER TABLE agent_runs
  ADD CONSTRAINT agent_runs_trigger_check
  CHECK (trigger IN (
    'manual',
    'matrix_summary',
    'report_draft',
    'wecom_ingest',
    'ilink_ingest',
    'material_bind_suggestion'
  ));
