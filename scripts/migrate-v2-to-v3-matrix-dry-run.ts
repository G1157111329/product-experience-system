/**
 * Wave 6 dry-run: count V2 task matrices that lack a V3 view definition.
 *
 * Usage:
 *   pnpm tsx scripts/migrate-v2-to-v3-matrix-dry-run.ts
 *   pnpm tsx scripts/migrate-v2-to-v3-matrix-dry-run.ts --apply
 *
 * Without --apply this script only prints a checksum-like summary and does not write.
 * Apply SQL (when ready) lives in scripts/migrate-v2-to-v3-matrix.sql.
 */
import { Pool } from 'pg';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';

loadEnv({ path: resolve(process.cwd(), '.env.local') });
loadEnv({ path: resolve(process.cwd(), '.env') });

const DATABASE_URL = process.env.DATABASE_URL;
const apply = process.argv.includes('--apply');

async function main() {
  if (!DATABASE_URL) {
    console.error('[migrate-v2-to-v3] DATABASE_URL is required');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 8000,
  });

  try {
    const summary = await pool.query<{
      matrix_count: string;
      with_view: string;
      without_view: string;
      group_count: string;
      row_count: string;
    }>(`
      SELECT
        COUNT(*)::text AS matrix_count,
        COUNT(*) FILTER (WHERE current_view_definition_id IS NOT NULL)::text AS with_view,
        COUNT(*) FILTER (WHERE current_view_definition_id IS NULL)::text AS without_view,
        (
          SELECT COUNT(*)::text FROM matrix_groups mg
          INNER JOIN task_matrices tm2 ON tm2.id = mg.matrix_id
          WHERE tm2.status <> 'archived' AND tm2.current_view_definition_id IS NULL
        ) AS group_count,
        (
          SELECT COUNT(*)::text FROM matrix_rows mr
          INNER JOIN matrix_groups mg2 ON mg2.id = mr.group_id
          INNER JOIN task_matrices tm3 ON tm3.id = mg2.matrix_id
          WHERE tm3.status <> 'archived' AND tm3.current_view_definition_id IS NULL
        ) AS row_count
      FROM task_matrices
      WHERE status <> 'archived'
    `);

    const row = summary.rows[0] ?? {
      matrix_count: '0',
      with_view: '0',
      without_view: '0',
      group_count: '0',
      row_count: '0',
    };

    const checksum = [
      `matrices=${row.matrix_count}`,
      `v3_view=${row.with_view}`,
      `v2_only=${row.without_view}`,
      `v2_groups=${row.group_count}`,
      `v2_rows=${row.row_count}`,
    ].join('|');

    console.log('[migrate-v2-to-v3] dry-run summary');
    console.log(`  active matrices:     ${row.matrix_count}`);
    console.log(`  with V3 view def:    ${row.with_view}`);
    console.log(`  without V3 view def: ${row.without_view}`);
    console.log(`  V2-only groups:      ${row.group_count}`);
    console.log(`  V2-only rows:        ${row.row_count}`);
    console.log(`  checksum:            ${checksum}`);

    if (!apply) {
      console.log('[migrate-v2-to-v3] no writes (pass --apply to run SQL when ready)');
      console.log('[migrate-v2-to-v3] SQL file: scripts/migrate-v2-to-v3-matrix.sql');
      return;
    }

    // Apply path is intentionally a stub until the SQL migration is finalized.
    console.log('[migrate-v2-to-v3] --apply requested');
    console.log('[migrate-v2-to-v3] execute scripts/migrate-v2-to-v3-matrix.sql via psql / node when ready');
    console.log('[migrate-v2-to-v3] no automatic writes in this skeleton');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[migrate-v2-to-v3] failed:', err);
  process.exit(1);
});
