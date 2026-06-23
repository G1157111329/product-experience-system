import { Pool } from 'pg';
import { config } from 'dotenv';
import path from 'path';
import { buildGoldenTestData } from '../src/lib/golden-test-data';
import { hashPassword } from '../src/lib/server/password';

type Row = Record<string, unknown>;

config({ path: path.join(process.cwd(), '.env.local'), quiet: true });
config({ path: path.join(process.cwd(), '.env'), quiet: true });

const databaseUrl = process.env.DATABASE_URL;
const account = process.env.GOLDEN_TEST_ACCOUNT || process.env.INITIAL_ADMIN_ACCOUNT || 'dockeradmin';

const jsonColumns = new Set([
  'content',
  'selected_standards',
  'source_task_ids',
  'source_report_ids',
  'effect_ai_result',
  'problem_points',
  'params',
  'process_notes',
  'snapshot_json',
  'preflight_result',
  'ai_result',
]);

const tableColumnWhitelist: Record<string, Set<string>> = {
  comparison_matrix_cells: new Set([
    'id',
    'assembly_id',
    'item_node_id',
    'object_id',
    'params',
    'process_notes',
    'effect_summary',
    'problem_points',
    'manual_score',
    'ai_score',
    'conclusion_tag',
    'metric_values',
    'media_display_config',
    'ai_status',
  ]),
};

function normalizeValue(key: string, value: unknown) {
  if (value === undefined) return null;
  if (jsonColumns.has(key)) return JSON.stringify(value ?? (Array.isArray(value) ? [] : {}));
  return value;
}

async function insertRows(pool: Pool, table: string, rows: Row[]) {
  if (rows.length === 0) return;
  const whitelist = tableColumnWhitelist[table];
  const columns = Object.keys(rows[0]).filter((column) => !whitelist || whitelist.has(column));
  const placeholders = rows.map((_, rowIndex) => {
    const rowPlaceholders = columns.map((column, columnIndex) => `$${rowIndex * columns.length + columnIndex + 1}`);
    return `(${rowPlaceholders.join(', ')})`;
  });
  const values = rows.flatMap((row) => columns.map((column) => normalizeValue(column, row[column])));
  const updates = columns
    .filter((column) => column !== 'id')
    .map((column) => `${column} = EXCLUDED.${column}`)
    .join(', ');

  await pool.query(
    `INSERT INTO ${table} (${columns.join(', ')})
     VALUES ${placeholders.join(', ')}
     ON CONFLICT (id) DO UPDATE SET ${updates}`,
    values,
  );
}

async function deleteGoldenRows(pool: Pool) {
  await pool.query("DELETE FROM pdf_generation_jobs WHERE id LIKE 'golden-%' OR report_id LIKE 'golden-%'");
  await pool.query("DELETE FROM report_snapshots WHERE id LIKE 'golden-%' OR report_id LIKE 'golden-%'");
  await pool.query("DELETE FROM comparison_matrix_cells WHERE id LIKE 'golden-%' OR assembly_id LIKE 'golden-%'");
  await pool.query("DELETE FROM comparison_item_nodes WHERE id LIKE 'golden-%' OR assembly_id LIKE 'golden-%'");
  await pool.query("DELETE FROM comparison_objects WHERE id LIKE 'golden-%' OR assembly_id LIKE 'golden-%'");
  await pool.query("DELETE FROM comparison_assemblies WHERE id LIKE 'golden-%'");
  await pool.query("DELETE FROM materials WHERE id LIKE 'golden-%' OR task_id LIKE 'golden-%'");
  await pool.query("DELETE FROM issue_re_evaluations WHERE id LIKE 'golden-%' OR issue_id LIKE 'golden-%'");
  await pool.query("DELETE FROM recipe_steps WHERE id LIKE 'golden-%' OR recipe_id LIKE 'golden-%'");
  await pool.query("DELETE FROM recipes WHERE id LIKE 'golden-%' OR task_id LIKE 'golden-%'");
  await pool.query("DELETE FROM issues WHERE id LIKE 'golden-%' OR task_id LIKE 'golden-%'");
  await pool.query("DELETE FROM check_records WHERE id LIKE 'golden-%' OR task_id LIKE 'golden-%'");
  await pool.query("DELETE FROM reports WHERE id LIKE 'golden-%' OR task_id LIKE 'golden-%'");
  await pool.query("DELETE FROM experience_tasks WHERE id LIKE 'golden-%'");
}

async function ensureGoldenUsers(pool: Pool) {
  await pool.query(
    `INSERT INTO platform_users (id, account, password_hash, name, role, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (account) DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       name = EXCLUDED.name,
       role = EXCLUDED.role,
       status = EXCLUDED.status`,
    [
      'golden-ordinary-user',
      'goldenuser',
      hashPassword('GoldenUser2026'),
      'Golden QA User',
      'user',
      'approved',
    ],
  );
}

async function main() {
  if (!databaseUrl) throw new Error('DATABASE_URL is required to seed Golden Test data');

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const { rows } = await pool.query<{ id: string }>(
      'SELECT id FROM platform_users WHERE account = $1 AND status = $2 LIMIT 1',
      [account, 'approved'],
    );
    const adminUserId = rows[0]?.id;
    if (!adminUserId) {
      throw new Error(`Approved user "${account}" not found. Log in once with INITIAL_ADMIN_ACCOUNT or set GOLDEN_TEST_ACCOUNT.`);
    }

    const data = buildGoldenTestData(adminUserId);
    await pool.query('BEGIN');
    try {
      await ensureGoldenUsers(pool);
      await deleteGoldenRows(pool);
      await insertRows(pool, 'experience_tasks', data.tasks);
      await insertRows(pool, 'check_records', data.records);
      await insertRows(pool, 'recipes', data.recipes);
      await insertRows(pool, 'recipe_steps', data.recipeSteps);
      await insertRows(pool, 'reports', data.reports);
      await insertRows(pool, 'issues', data.issues);
      await insertRows(pool, 'issue_re_evaluations', data.issueReEvaluations);
      await insertRows(pool, 'materials', data.materials);
      await insertRows(pool, 'comparison_assemblies', [data.comparison.assembly, data.metricComparison.assembly]);
      await insertRows(pool, 'comparison_objects', [...data.comparison.objects, ...data.metricComparison.objects]);
      await insertRows(pool, 'comparison_item_nodes', [...data.comparison.itemNodes, ...data.metricComparison.itemNodes]);
      await insertRows(pool, 'comparison_matrix_cells', [...data.comparison.cells, ...data.metricComparison.cells]);
      await insertRows(pool, 'report_snapshots', data.snapshots);
      await insertRows(pool, 'pdf_generation_jobs', data.pdfJobs);
      await pool.query('COMMIT');
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }

    console.log(JSON.stringify({
      seeded: true,
      account,
      tasks: data.tasks.length,
      reports: data.reports.length,
      reportTypes: data.reports.map((report) => report.report_type),
      comparisonObjects: data.comparison.objects.length + data.metricComparison.objects.length,
      comparisonCells: data.comparison.cells.length + data.metricComparison.cells.length,
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
