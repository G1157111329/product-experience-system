/**
 * V3.1.1 §27.2.6 — Seed the six server-side dictionary tables from the frozen
 * defaultDict. Idempotent: re-running upserts by `code` and resets `is_active`
 * flags. Run via `pnpm tsx scripts/seed-dictionaries.ts`.
 *
 * Backward-compat: the human labels are kept identical to the old hardcoded
 * constants so existing rows that reference labels (e.g. issues.status='待整改')
 * continue to validate. The `code` column becomes the authoritative token going
 * forward; per V3.1 §14.4 / V3.1.1 §27.2 M0–M5 rename discipline, the migration
 * to `code`-based references happens in Wave 1 with backfill + dual-read.
 */

import { Pool } from "pg";
import { config } from "dotenv";
import path from "path";
import { defaultDict, DICT_TYPES, type DictType, type DictItem } from "../src/lib/dictionary-types";

config({ path: path.join(process.cwd(), ".env.local"), quiet: true });
config({ path: path.join(process.cwd(), ".env"), quiet: true });

const databaseUrl =
  process.env.DATABASE_URL ||
  "postgresql://xp_dev:change-me-dev-only@127.0.0.1:5432/xp_experience";

const TABLE_NAMES: Record<DictType, string> = {
  project_phase_dict: "project_phase_dict",
  issue_status_dict: "issue_status_dict",
  task_status_dict: "task_status_dict",
  report_status_dict: "report_status_dict",
  issue_severity_dict: "issue_severity_dict",
  sla_policy_dict: "sla_policy_dict",
};

async function seedOne(pool: Pool, dictType: DictType, items: DictItem[]) {
  const table = TABLE_NAMES[dictType];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Mark all rows inactive first; the upsert below will reactivate rows that
    // match defaultDict. This way stale dict entries are retired but not lost.
    await client.query(`UPDATE ${table} SET is_active = false`);

    for (const item of items) {
      await client.query(
        `INSERT INTO ${table} (code, label, sort_order, is_active, scope_filter, description)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (code) DO UPDATE SET
           label = EXCLUDED.label,
           sort_order = EXCLUDED.sort_order,
           is_active = EXCLUDED.is_active,
           scope_filter = EXCLUDED.scope_filter,
           description = EXCLUDED.description,
           updated_at = NOW()`,
        [
          item.code,
          item.label,
          item.sortOrder,
          item.isActive,
          JSON.stringify(item.scopeFilter ?? {}),
          item.description ?? null,
        ],
      );
    }
    await client.query("COMMIT");
    console.log(`[seed] ${table}: ${items.length} rows upserted`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(`[seed] ${table} failed:`, err);
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  try {
    for (const dictType of DICT_TYPES) {
      await seedOne(pool, dictType, defaultDict[dictType]);
    }
    console.log("[seed] dictionaries ok");
  } catch (err) {
    console.error("[seed] failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();