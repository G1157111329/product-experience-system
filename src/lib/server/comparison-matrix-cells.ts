/**
 * Shared helpers for comparison matrix cell completeness.
 *
 * PRD V3.1.2.4 §10.1 — 新增对象/细项后即时生成可编辑单元格，
 * 不再要求用户手动点击「补齐矩阵单元格」。
 */
import type { getSupabaseClient } from '@/storage/database/supabase-client';

type Client = ReturnType<typeof getSupabaseClient>;
type MatrixRow = Record<string, unknown>;

const MATRIX_CELL_NODE_TYPES = new Set(['item', 'condition', 'process_node', 'metric', 'issue_group']);

function asRows(value: unknown): MatrixRow[] {
  return Array.isArray(value) ? (value as MatrixRow[]) : [];
}

function isMatrixNode(node: MatrixRow) {
  return MATRIX_CELL_NODE_TYPES.has(String(node.node_type || 'item'));
}

function cellKey(itemNodeId: unknown, objectId: unknown) {
  return `${String(itemNodeId)}::${String(objectId)}`;
}

export function buildMissingComparisonCells(
  assemblyId: string,
  objects: MatrixRow[],
  itemNodes: MatrixRow[],
  cells: MatrixRow[],
): MatrixRow[] {
  const existing = new Set(cells.map((cell) => cellKey(cell.item_node_id, cell.object_id)));
  const missing: MatrixRow[] = [];

  for (const node of itemNodes.filter(isMatrixNode)) {
    if (!node.id) continue;
    for (const object of objects) {
      if (!object.id) continue;
      const key = cellKey(node.id, object.id);
      if (existing.has(key)) continue;
      missing.push({
        assembly_id: assemblyId,
        item_node_id: node.id,
        object_id: object.id,
        params: {},
        process_notes: [],
        problem_points: [],
        metric_values: {},
        media_display_config: {},
      });
    }
  }

  return missing;
}

/**
 * Insert any missing (item_node × object) cells for an assembly.
 * Safe to call after creating objects or matrix item nodes.
 * Returns created cell rows (empty if already complete).
 */
export async function ensureComparisonMatrixCells(
  client: Client,
  assemblyId: string,
): Promise<{ created: MatrixRow[]; error: string | null }> {
  const [objectsResult, nodesResult, cellsResult] = await Promise.all([
    client.from('comparison_objects').select('id').eq('assembly_id', assemblyId),
    client.from('comparison_item_nodes').select('id,node_type').eq('assembly_id', assemblyId),
    client.from('comparison_matrix_cells').select('item_node_id,object_id').eq('assembly_id', assemblyId),
  ]);

  const loadError = objectsResult.error || nodesResult.error || cellsResult.error;
  if (loadError) {
    return { created: [], error: loadError.message || '查询矩阵结构失败' };
  }

  const missing = buildMissingComparisonCells(
    assemblyId,
    asRows(objectsResult.data),
    asRows(nodesResult.data),
    asRows(cellsResult.data),
  );

  if (missing.length === 0) {
    return { created: [], error: null };
  }

  const { data, error } = await client
    .from('comparison_matrix_cells')
    .insert(missing)
    .select();

  if (error) {
    return { created: [], error: error.message || '补齐矩阵单元格失败' };
  }

  return { created: asRows(data), error: null };
}
