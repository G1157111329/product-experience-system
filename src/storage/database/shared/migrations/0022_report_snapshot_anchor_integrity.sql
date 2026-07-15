-- A published report must keep its selected snapshot. The constraint is
-- deferrable because report_snapshots already cascades from reports; the
-- final transaction state still rejects deleting an anchored snapshot alone.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reports_snapshot_id_report_snapshots_id_fkey'
  ) THEN
    ALTER TABLE reports
      ADD CONSTRAINT reports_snapshot_id_report_snapshots_id_fkey
      FOREIGN KEY (snapshot_id) REFERENCES report_snapshots(id)
      ON DELETE NO ACTION
      DEFERRABLE INITIALLY DEFERRED
      NOT VALID;
  END IF;
END;
$$;

-- Do not silently clear invalid legacy anchors. Validation deliberately
-- fails the migration so an operator can repair the affected report instead.
ALTER TABLE reports
  VALIDATE CONSTRAINT reports_snapshot_id_report_snapshots_id_fkey;
