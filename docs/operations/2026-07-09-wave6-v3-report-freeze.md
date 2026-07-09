# Wave 6 — V3 matrix report freeze

Date: 2026-07-09

## Goal

When a task matrix has `current_view_definition_id` (V3), report generation freezes the V3 projection into:

- `reports.content.data_matrix_projection`
- `report_snapshots.snapshot_json.matrix_projection`

Discriminator on the frozen object:

- `projectionVersion: 'v3'` (wrapper at write time)
- `matrixProjectionVersion: 'v3'` (from `freezeV3MatrixForReport`)

V2 matrices (no view definition) keep the existing groups-based path.

## Generate a report (manual check)

1. Open a task whose matrix has `current_view_definition_id` set (V3 designer / bootstrap).
2. Generate / regenerate the report from the task detail page.
3. Confirm API / DB:
   - `content.data_matrix_projection.projectionVersion === 'v3'` (or `matrixProjectionVersion === 'v3'`)
   - snapshot `matrix_projection` matches the same frozen shape (columns + rows, no `groups`)
4. Open report detail → Matrix tab: should render `ReportV3MatrixView` (`matrixType: data_matrix_v3`).
5. Open report detail / print / share narrative sections: `data_matrix_v3` block should appear.
6. Repeat with a V2-only matrix (no view definition): still `matrixType: data_matrix` with `groups`.

## Feature flags

Matrix runtime flags remain in `platform_settings.feature_flag_task_matrix`. Wave 6 report freeze does not add a new flag; it keys off `current_view_definition_id`.

## Migration dry-run

```bash
pnpm tsx scripts/migrate-v2-to-v3-matrix-dry-run.ts
```

Prints active matrix / V2-only group+row counts and a checksum string. Does not write.

```bash
pnpm tsx scripts/migrate-v2-to-v3-matrix-dry-run.ts --apply
```

Skeleton only — documents that SQL lives in `scripts/migrate-v2-to-v3-matrix.sql` and does not auto-mutate yet.

## Rollback note

Historical reports already frozen as V2 remain readable via the groups path. Regenerating a V3 task report overwrites content/snapshot with the V3 freeze.
