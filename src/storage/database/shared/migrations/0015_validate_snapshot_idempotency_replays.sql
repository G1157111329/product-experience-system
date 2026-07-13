ALTER TABLE report_snapshots
  ADD COLUMN IF NOT EXISTS idempotency_fingerprint VARCHAR(64);

DROP FUNCTION IF EXISTS public.persist_existing_report_snapshot_atomic(
  VARCHAR, VARCHAR, JSONB, VARCHAR, VARCHAR, BOOLEAN, VARCHAR, VARCHAR
);

CREATE OR REPLACE FUNCTION public.persist_existing_report_snapshot_atomic(
  p_report_id VARCHAR,
  p_report_type VARCHAR,
  p_snapshot_json JSONB,
  p_layout_profile VARCHAR,
  p_actor_id VARCHAR,
  p_allow_all BOOLEAN DEFAULT FALSE,
  p_assembly_id VARCHAR DEFAULT NULL,
  p_idempotency_key VARCHAR DEFAULT NULL,
  p_idempotency_fingerprint VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_report reports%ROWTYPE;
  v_task experience_tasks%ROWTYPE;
  v_snapshot report_snapshots%ROWTYPE;
  v_version INTEGER;
BEGIN
  IF p_report_id IS NULL OR btrim(p_report_id) = '' THEN
    RAISE EXCEPTION 'report id is required' USING ERRCODE = '22023';
  END IF;
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency key is required' USING ERRCODE = '22023';
  END IF;
  IF p_idempotency_fingerprint IS NULL OR btrim(p_idempotency_fingerprint) = '' THEN
    RAISE EXCEPTION 'idempotency fingerprint is required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_report_id, 0));
  SELECT * INTO v_report FROM reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'report not found: %', p_report_id USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_task FROM experience_tasks WHERE id = v_report.task_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'report task not found: %', v_report.task_id USING ERRCODE = 'P0002';
  END IF;
  IF NOT COALESCE(p_allow_all, FALSE)
     AND (p_actor_id IS NULL OR (
       v_task.created_by IS DISTINCT FROM p_actor_id
       AND v_task.owner_id IS DISTINCT FROM p_actor_id
     )) THEN
    RAISE EXCEPTION 'report access denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_snapshot FROM report_snapshots
  WHERE report_id = p_report_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_snapshot.idempotency_fingerprint IS DISTINCT FROM p_idempotency_fingerprint THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: payload mismatch' USING ERRCODE = 'P0001';
    END IF;
    IF v_report.snapshot_id IS DISTINCT FROM v_snapshot.id THEN
      RAISE EXCEPTION 'IDEMPOTENCY_SUPERSEDED: newer snapshot exists' USING ERRCODE = 'P0001';
    END IF;
    RETURN jsonb_build_object('report', to_jsonb(v_report), 'snapshot', to_jsonb(v_snapshot));
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_version
  FROM report_snapshots WHERE report_id = p_report_id;
  INSERT INTO report_snapshots (
    report_id, report_type, version, idempotency_key, idempotency_fingerprint,
    snapshot_json, layout_profile, created_by
  ) VALUES (
    p_report_id, p_report_type, v_version, p_idempotency_key, p_idempotency_fingerprint,
    p_snapshot_json, p_layout_profile, p_actor_id
  ) RETURNING * INTO v_snapshot;

  UPDATE reports SET
    snapshot_id = v_snapshot.id,
    report_type = p_report_type,
    assembly_id = p_assembly_id,
    layout_profile = p_layout_profile,
    updated_at = now()
  WHERE id = p_report_id
  RETURNING * INTO v_report;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'report anchor update failed: %', p_report_id USING ERRCODE = 'P0002';
  END IF;
  RETURN jsonb_build_object('report', to_jsonb(v_report), 'snapshot', to_jsonb(v_snapshot));
END;
$$;

REVOKE ALL ON FUNCTION public.persist_existing_report_snapshot_atomic(
  VARCHAR, VARCHAR, JSONB, VARCHAR, VARCHAR, BOOLEAN, VARCHAR, VARCHAR, VARCHAR
) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.persist_existing_report_snapshot_atomic(
      VARCHAR, VARCHAR, JSONB, VARCHAR, VARCHAR, BOOLEAN, VARCHAR, VARCHAR, VARCHAR
    ) TO service_role;
  END IF;
END;
$$;
