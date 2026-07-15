-- P0: durable media cleanup plus database-level frozen report retention.
CREATE TABLE IF NOT EXISTS material_cleanup_jobs (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id varchar(36) NOT NULL,
  file_key text NOT NULL,
  requested_by varchar(36),
  actor_snapshot varchar(100) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_until timestamptz,
  CONSTRAINT material_cleanup_jobs_material_key UNIQUE (material_id, file_key),
  CONSTRAINT material_cleanup_jobs_requested_by_fkey FOREIGN KEY (requested_by)
    REFERENCES platform_users(id) ON DELETE SET NULL
);

-- Older local/prod databases may already have the cleanup queue from the
-- pre-retention worker. CREATE TABLE IF NOT EXISTS does not evolve that shape.
ALTER TABLE material_cleanup_jobs ADD COLUMN IF NOT EXISTS actor_snapshot varchar(100);
UPDATE material_cleanup_jobs
SET actor_snapshot = COALESCE(requested_by, 'system')
WHERE actor_snapshot IS NULL;
ALTER TABLE material_cleanup_jobs ALTER COLUMN actor_snapshot SET NOT NULL;
ALTER TABLE material_cleanup_jobs ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE material_cleanup_jobs ADD COLUMN IF NOT EXISTS lease_token uuid;
ALTER TABLE material_cleanup_jobs ADD COLUMN IF NOT EXISTS lease_until timestamptz;
ALTER TABLE material_cleanup_jobs ALTER COLUMN requested_by DROP NOT NULL;

DO $$
DECLARE cleanup_fk record;
BEGIN
  FOR cleanup_fk IN
    SELECT constraint_row.conname
    FROM pg_constraint constraint_row
    JOIN pg_class owner ON owner.oid = constraint_row.conrelid
    JOIN pg_namespace owner_namespace ON owner_namespace.oid = owner.relnamespace
    WHERE constraint_row.contype = 'f'
      AND owner_namespace.nspname = 'public'
      AND owner.relname = 'material_cleanup_jobs'
      AND constraint_row.conkey = ARRAY[
        (SELECT attnum FROM pg_attribute WHERE attrelid = owner.oid AND attname = 'requested_by')
      ]::smallint[]
  LOOP
    EXECUTE format('ALTER TABLE public.material_cleanup_jobs DROP CONSTRAINT %I', cleanup_fk.conname);
  END LOOP;
END
$$;
ALTER TABLE public.material_cleanup_jobs
  ADD CONSTRAINT material_cleanup_jobs_requested_by_fkey
  FOREIGN KEY (requested_by) REFERENCES public.platform_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS material_cleanup_jobs_status_idx
  ON material_cleanup_jobs(status, created_at);

CREATE TABLE IF NOT EXISTS frozen_material_references (
  snapshot_id varchar(36) NOT NULL REFERENCES report_snapshots(id) ON DELETE CASCADE,
  material_id varchar(36) NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (snapshot_id, material_id)
);
CREATE INDEX IF NOT EXISTS frozen_material_references_material_idx ON frozen_material_references(material_id);

CREATE OR REPLACE FUNCTION capture_frozen_material_references()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO frozen_material_references(snapshot_id, material_id)
  SELECT NEW.id, material.id FROM materials material
  WHERE NEW.snapshot_json::text LIKE ('%' || material.id || '%')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS report_snapshots_material_reference_capture ON report_snapshots;
CREATE TRIGGER report_snapshots_material_reference_capture AFTER INSERT ON report_snapshots
  FOR EACH ROW EXECUTE FUNCTION capture_frozen_material_references();

INSERT INTO frozen_material_references(snapshot_id, material_id)
SELECT snapshot.id, material.id FROM report_snapshots snapshot JOIN materials material
  ON snapshot.snapshot_json::text LIKE ('%' || material.id || '%')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION guard_frozen_material_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM material_links WHERE material_id = OLD.id) THEN
    RAISE EXCEPTION 'material_has_active_links' USING ERRCODE = '23503';
  END IF;
  IF OLD.record_id IS NOT NULL OR OLD.recipe_id IS NOT NULL OR OLD.recipe_step_id IS NOT NULL
    OR OLD.issue_id IS NOT NULL OR OLD.re_evaluation_id IS NOT NULL OR OLD.comparison_cell_id IS NOT NULL THEN
    RAISE EXCEPTION 'material_has_legacy_reference' USING ERRCODE = '23503';
  END IF;
  IF EXISTS (SELECT 1 FROM frozen_material_references WHERE material_id = OLD.id) THEN
    RAISE EXCEPTION 'material_has_frozen_snapshot_reference' USING ERRCODE = '23503';
  END IF;
  IF EXISTS (
    SELECT 1 FROM report_snapshots
    WHERE snapshot_json::text LIKE ('%' || OLD.id || '%')
  ) THEN
    RAISE EXCEPTION 'material_has_frozen_snapshot_reference' USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS materials_frozen_delete_guard ON materials;
CREATE TRIGGER materials_frozen_delete_guard
  BEFORE DELETE ON materials
  FOR EACH ROW EXECUTE FUNCTION guard_frozen_material_delete();
