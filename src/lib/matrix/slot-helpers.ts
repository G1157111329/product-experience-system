/**
 * Shared helpers for atomic-ish read-merge-write of comparison_item_nodes.config.
 *
 * Repo constraint: getSupabaseClient() supports the chainable builder API but
 * not jsonb predicate filters or rpc(). So we cannot do a true DB-side
 * conditional update on config. Instead we use a best-effort protocol:
 *  - read current node (config + the _slot_version counter)
 *  - merge the partial fields
 *  - bump _slot_version
 *  - write
 *  - re-read to confirm our version landed; if not, return a conflict signal
 *
 * The residual race window (between our write and another writer's write) is
 * documented; for the v1 frontend this is acceptable. Task 8+ should consider
 * a Postgres function if true atomicity becomes required.
 */

export interface ConfigMergeInput {
  rowId: string;
  /** Fields to merge into config (top-level keys only — shallow merge). */
  partial: Record<string, unknown>;
  /** Caller's expected _slot_version; if undefined, skip the conflict check (last-write-wins). */
  expectedVersion?: number;
}

export interface ConfigMergeResult {
  ok: true;
  newVersion: number;
  config: Record<string, unknown>;
}
export interface ConfigMergeConflict {
  ok: false;
  code: 'MATRIX_VERSION_CONFLICT';
  currentVersion: number;
}

export async function mergeNodeConfig(
  client: any,
  input: ConfigMergeInput,
): Promise<ConfigMergeResult | ConfigMergeConflict> {
  // 1. Read current.
  const { data: node, error: readErr } = await client
    .from('comparison_item_nodes')
    .select('id,config')
    .eq('id', input.rowId)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message || '读取节点失败');
  if (!node) throw new Error('未找到节点');
  const currentConfig =
    node.config && typeof node.config === 'object'
      ? (node.config as Record<string, unknown>)
      : {};
  const currentVersion =
    typeof currentConfig._slot_version === 'number' ? currentConfig._slot_version : 0;

  // 2. Conflict check.
  if (input.expectedVersion !== undefined && input.expectedVersion !== currentVersion) {
    return { ok: false, code: 'MATRIX_VERSION_CONFLICT', currentVersion };
  }

  // 3. Shallow merge + bump version.
  const newConfig: Record<string, unknown> = {
    ...currentConfig,
    ...input.partial,
    _slot_version: currentVersion + 1,
  };

  // 4. Write.
  const { error: writeErr } = await client
    .from('comparison_item_nodes')
    .update({ config: newConfig })
    .eq('id', input.rowId);
  if (writeErr) throw new Error(writeErr.message || '写入节点失败');

  // 5. Best-effort confirm (re-read). If another writer landed between our write
  //    and this re-read, surface a conflict so the caller can retry — but note
  //    the write already happened; this is detection, not prevention.
  const { data: recheck, error: reErr } = await client
    .from('comparison_item_nodes')
    .select('config')
    .eq('id', input.rowId)
    .maybeSingle();
  if (!reErr && recheck) {
    const landed = (recheck.config as Record<string, unknown>)?.['_slot_version'];
    if (typeof landed === 'number' && landed !== currentVersion + 1) {
      // Someone else wrote after us. Our write was overwritten — surface conflict.
      return { ok: false, code: 'MATRIX_VERSION_CONFLICT', currentVersion: landed };
    }
  }

  return { ok: true, newVersion: currentVersion + 1, config: newConfig };
}
