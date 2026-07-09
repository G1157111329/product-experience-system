/**
 * Feature flags for PRD V3.1.2.4 — read from platform_settings (key=
 * 'feature_flag_v3_1_2_4'). Falls back to code defaults when the setting
 * is missing, per PRD §14 rule: "Flag 缺失不得导致空白页".
 *
 * Server-side reader (used by API routes + matrix-tab-state). For client
 * components, consume via API responses (the tab-state endpoint returns
 * the resolved flags) rather than importing this directly.
 */
import { getDb } from '@/storage/database/pg-db';
import { sql } from 'drizzle-orm';

export interface V3FeatureFlags {
  matrixTabStateEnabled: boolean;
  taskMatrixEnabled: boolean;
  dynamicMatrixExcelLikeViewEnabled: boolean;
  dynamicMatrixFormulaEnabled: boolean;
  dynamicMatrixCellStyleEnabled: boolean;
  inlineEditEnabled: boolean;
  autosaveEnabled: boolean;
  materialStagingEnabled: boolean;
  hermesAgentGatewayEnabled: boolean;
  wecomMaterialIngestEnabled: boolean;
}

/**
 * Code-level defaults. Per PRD §14, matrix_tab_state_enabled stays ON so the
 * Tab never shows a blank page. Wave 2 enables the excel-like matrix path by
 * default so newly wired UI is usable without a manual flag flip; remaining
 * P1 capabilities (Hermes / WeCom / staging) stay OFF.
 */
export const V3_FLAG_DEFAULTS: V3FeatureFlags = {
  matrixTabStateEnabled: true,
  taskMatrixEnabled: true,
  dynamicMatrixExcelLikeViewEnabled: true,
  dynamicMatrixFormulaEnabled: false,
  dynamicMatrixCellStyleEnabled: false,
  inlineEditEnabled: true,
  autosaveEnabled: true,
  materialStagingEnabled: false,
  hermesAgentGatewayEnabled: false,
  wecomMaterialIngestEnabled: false,
};

let cached: V3FeatureFlags | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 30000;

/** Map DB snake_case keys (migration 0007) onto camelCase V3FeatureFlags. */
function normalizeFlagPayload(raw: unknown): Partial<V3FeatureFlags> {
  if (!raw || typeof raw !== 'object') return {};
  const src = raw as Record<string, unknown>;
  const out: Partial<V3FeatureFlags> = {};
  const map: Array<[keyof V3FeatureFlags, string]> = [
    ['matrixTabStateEnabled', 'matrix_tab_state_enabled'],
    ['taskMatrixEnabled', 'task_matrix_enabled'],
    ['dynamicMatrixExcelLikeViewEnabled', 'dynamic_matrix_excel_like_view_enabled'],
    ['dynamicMatrixFormulaEnabled', 'dynamic_matrix_formula_enabled'],
    ['dynamicMatrixCellStyleEnabled', 'dynamic_matrix_cell_style_enabled'],
    ['inlineEditEnabled', 'inline_edit_enabled'],
    ['autosaveEnabled', 'autosave_enabled'],
    ['materialStagingEnabled', 'material_staging_enabled'],
    ['hermesAgentGatewayEnabled', 'hermes_agent_gateway_enabled'],
    ['wecomMaterialIngestEnabled', 'wecom_material_ingest_enabled'],
  ];
  for (const [camel, snake] of map) {
    if (typeof src[camel] === 'boolean') out[camel] = src[camel] as boolean;
    else if (typeof src[snake] === 'boolean') out[camel] = src[snake] as boolean;
  }
  return out;
}

/**
 * Read the V3.1.2.4 feature flags from the database, with a 30s cache.
 * Returns code defaults on any error (never throws — PRD §14 safety).
 */
export async function getV3FeatureFlags(): Promise<V3FeatureFlags> {
  if (cached && Date.now() - cacheTime < CACHE_TTL_MS) return cached;

  try {
    const db = await getDb();
    const result = await db.execute(
      sql`SELECT value FROM platform_settings WHERE key = 'feature_flag_v3_1_2_4' LIMIT 1`,
    );

    if (result.rows.length > 0) {
      const row = result.rows[0] as unknown as { value: unknown };
      const value =
        typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      cached = { ...V3_FLAG_DEFAULTS, ...normalizeFlagPayload(value) };
    } else {
      cached = { ...V3_FLAG_DEFAULTS };
    }
  } catch {
    cached = { ...V3_FLAG_DEFAULTS };
  }

  cacheTime = Date.now();
  return cached;
}

export function clearV3FlagCache(): void {
  cached = null;
  cacheTime = 0;
}

/**
 * Resolve the matrix-tab state per PRD §13.1 / §14:
 *   - feature_disabled: matrixTabStateEnabled is false
 *   - forbidden: user lacks permission (caller decides)
 *   - empty: tab enabled but task_matrix_enabled is false (or no matrices)
 *   - ready: tab enabled + at least one matrix exists (caller decides)
 *
 * This helper returns the flag-derived portion; the caller layers on
 * permission + matrix existence to produce the final state.
 */
export function resolveMatrixTabStateFromFlags(flags: V3FeatureFlags): {
  enabled: boolean;
  canCreate: boolean;
  state: 'feature_disabled' | 'empty' | 'ready';
} {
  if (!flags.matrixTabStateEnabled) {
    return { enabled: false, canCreate: false, state: 'feature_disabled' };
  }
  // matrix_tab_state_enabled=true but task_matrix_enabled=false =>
  // Tab visible but "功能未启用", no create CTA.
  if (!flags.taskMatrixEnabled) {
    return { enabled: true, canCreate: false, state: 'empty' };
  }
  return { enabled: true, canCreate: true, state: 'ready' };
}
