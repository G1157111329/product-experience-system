/**
 * Seed the canonical 原汁机 (juicer aperture) data-matrix schema.
 *
 * Idempotent: re-running is safe. If the schema version (schema_key +
 * version_no=1 + status='published') already exists, the script prints
 * "already seeded, skipping" and exits 0. Otherwise it inserts the schema
 * header, the published version, the dimension bindings, and the formula
 * definitions (each compiled first via the shared formula engine) within a
 * single transaction, then points latest_published_version_id at the new row.
 *
 * Mirrors scripts/seed-dictionaries.ts for connection/auth: a plain `pg` Pool
 * built from DATABASE_URL (loaded from .env.local/.env), no Supabase client.
 */

import { Pool } from "pg";
import { config } from "dotenv";
import path from "path";
import { createHash } from "crypto";
import { JUICER_APERTURE_SCHEMA } from "../src/lib/matrix/schema-bootstrap";
import type { FormulaDefinition } from "../src/lib/matrix/types";
import { compileFormula, MatrixFormulaError } from "../src/lib/matrix/formula-engine";

config({ path: path.join(process.cwd(), ".env.local"), quiet: true });
config({ path: path.join(process.cwd(), ".env"), quiet: true });

const databaseUrl =
  process.env.DATABASE_URL ||
  "postgresql://xp_dev:change-me-dev-only@127.0.0.1:5432/xp_experience";

const SCHEMA_KEY = JUICER_APERTURE_SCHEMA.schemaKey;
const VERSION_NO = JUICER_APERTURE_SCHEMA.version;
const SCHEMA_NAME = JUICER_APERTURE_SCHEMA.title;

/**
 * Compiles every formula up front so a parse error aborts before any DB write.
 * Returns the compiled payloads (ast + deps) keyed by output dimension key.
 */
function compileAll(
  formulas: FormulaDefinition[],
): { formula: FormulaDefinition; ast: unknown; dependencies: string[] }[] {
  const compiled: { formula: FormulaDefinition; ast: unknown; dependencies: string[] }[] = [];
  for (const formula of formulas) {
    try {
      const { ast, dependencies } = compileFormula(formula.formulaDsl);
      compiled.push({ formula, ast, dependencies });
    } catch (err) {
      const code = err instanceof MatrixFormulaError ? err.code : "UNKNOWN";
      throw new Error(
        `formula "${formula.outputDimensionKey}" failed to compile (${code}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return compiled;
}

async function main() {
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const client = await pool.connect();
  try {
    // 1. Compile formulas BEFORE touching the DB — a bad formula must abort
    //    the seed rather than inserting a half-broken schema.
    const compiledFormulas = compileAll(JUICER_APERTURE_SCHEMA.formulas);

    await client.query("BEGIN");

    // 2. Idempotent schema header: insert if missing, fetch id otherwise.
    const inserted = await client.query(
      `INSERT INTO matrix_schemas (schema_key, name, status)
       VALUES ($1, $2, 'active')
       ON CONFLICT (schema_key) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [SCHEMA_KEY, SCHEMA_NAME],
    );
    const schemaId: string = inserted.rows[0].id;

    // 3. Short-circuit if this published version already exists.
    const existing = await client.query(
      `SELECT id FROM matrix_schema_versions
       WHERE schema_id = $1 AND version_no = $2 AND status = 'published'
       LIMIT 1`,
      [schemaId, VERSION_NO],
    );
    if (existing.rows.length > 0) {
      await client.query("ROLLBACK");
      console.log("[seed] already seeded, skipping");
      return;
    }

    // 4. Insert the published version. checksum is the first 16 hex chars of
    //    sha256 over the canonical JSON, used to detect drift on re-seed.
    const schemaJsonStr = JSON.stringify(JUICER_APERTURE_SCHEMA);
    const checksum = createHash("sha256").update(schemaJsonStr).digest("hex").slice(0, 16);
    const versionRow = await client.query(
      `INSERT INTO matrix_schema_versions (schema_id, version_no, status, schema_json, checksum, published_at, published_by)
       VALUES ($1, $2, 'published', $3, $4, NOW(), NULL)
       RETURNING id`,
      [schemaId, VERSION_NO, schemaJsonStr, checksum],
    );
    const schemaVersionId: string = versionRow.rows[0].id;

    // 5. Formula definitions: store the DSL source plus the compiled AST and
    //    dependency list so the runtime recompute can skip re-parsing.
    for (const { formula, ast, dependencies } of compiledFormulas) {
      await client.query(
        `INSERT INTO matrix_formula_definitions
           (schema_version_id, output_dimension_key, formula_dsl, compiled_ast, dependency_json, scope, formula_version, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'published')
         ON CONFLICT (schema_version_id, output_dimension_key) DO UPDATE SET
           formula_dsl = EXCLUDED.formula_dsl,
           compiled_ast = EXCLUDED.compiled_ast,
           dependency_json = EXCLUDED.dependency_json,
           scope = EXCLUDED.scope,
           formula_version = EXCLUDED.formula_version,
           status = EXCLUDED.status`,
        [
          schemaVersionId,
          formula.outputDimensionKey,
          formula.formulaDsl,
          JSON.stringify(ast),
          JSON.stringify(dependencies),
          formula.scope,
          formula.formulaVersion,
        ],
      );
    }

    // 6. Dimension bindings: map each DimensionBinding field to its snake_case
    //    column. metric_definition_id is left null (Task 13 wires metrics).
    for (const dim of JUICER_APERTURE_SCHEMA.dimensions) {
      await client.query(
        `INSERT INTO matrix_dimension_bindings
           (schema_version_id, dimension_key, display_name, column_group, value_kind, unit_code,
            metric_definition_id, required, editable, sort_order, display_format_json, validation_rule_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (schema_version_id, dimension_key) DO UPDATE SET
           display_name = EXCLUDED.display_name,
           column_group = EXCLUDED.column_group,
           value_kind = EXCLUDED.value_kind,
           unit_code = EXCLUDED.unit_code,
           metric_definition_id = EXCLUDED.metric_definition_id,
           required = EXCLUDED.required,
           editable = EXCLUDED.editable,
           sort_order = EXCLUDED.sort_order,
           display_format_json = EXCLUDED.display_format_json,
           validation_rule_json = EXCLUDED.validation_rule_json`,
        [
          schemaVersionId,
          dim.dimensionKey,
          dim.displayName,
          dim.columnGroup,
          dim.valueKind,
          dim.unitCode ?? null,
          dim.metricDefinitionId ?? null,
          dim.required ?? false,
          dim.editable ?? true,
          dim.sortOrder,
          JSON.stringify(dim.displayFormat ?? {}),
          JSON.stringify(dim.validation ?? {}),
        ],
      );
    }

    // 7. Point the schema header at the newly published version.
    await client.query(
      `UPDATE matrix_schemas SET latest_published_version_id = $1, status = 'active', updated_at = NOW() WHERE id = $2`,
      [schemaVersionId, schemaId],
    );

    await client.query("COMMIT");
    const dimCount = JUICER_APERTURE_SCHEMA.dimensions.length;
    const formulaCount = compiledFormulas.length;
    console.log(
      `[seed] seeded schema ${SCHEMA_KEY}, version ${VERSION_NO}, ${dimCount} dimensions, ${formulaCount} formulas`,
    );
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("[seed] failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

void (async () => {
  await main();
})();
