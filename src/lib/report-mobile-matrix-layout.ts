type Row = Record<string, unknown>;

export type MobileComparisonSection = {
  id: string;
  label: string;
  nodeType: string;
  objects: Array<{ id: string; label: string; cell?: Row }>;
};

export type MobileDataMatrixField = {
  id: string;
  label: string;
  value: unknown;
  unit?: string;
  media: Array<{ id: string; name: string; type: string; url: string }>;
  issues: Array<{ id: string; text: string; status: string }>;
};

export type MobileDataMatrixRow = {
  id: string;
  path: string[];
  groups: Array<{
    id: 'input' | 'calculated' | 'effect_media' | 'evaluation' | 'issues';
    label: string;
    fields: MobileDataMatrixField[];
  }>;
};

function text(value: unknown, fallback = '') {
  const result = value === null || value === undefined ? '' : String(value).trim();
  return result || fallback;
}

const MATRIX_NODE_TYPES = new Set(['item', 'condition', 'process_node', 'metric', 'issue_group']);

export function buildMobileComparisonSections(model: {
  objects?: Row[];
  item_nodes?: Row[];
  cells?: Row[];
}): MobileComparisonSection[] {
  const objects = model.objects ?? [];
  const cells = new Map((model.cells ?? []).map((cell) => [
    `${text(cell.item_node_id)}::${text(cell.object_id)}`,
    cell,
  ]));
  return (model.item_nodes ?? [])
    .filter((node) => MATRIX_NODE_TYPES.has(text(node.node_type, 'item')))
    .map((node, index) => ({
      id: text(node.id, `node-${index}`),
      label: text(node.node_label, `项目 ${index + 1}`),
      nodeType: text(node.node_type, 'item'),
      objects: objects.map((object, objectIndex) => {
        const id = text(object.id, `object-${objectIndex}`);
        const cell = cells.get(`${text(node.id)}::${text(object.id)}`);
        return {
          id,
          label: text(object.object_name, `对象 ${objectIndex + 1}`),
          ...(cell ? { cell } : {}),
        };
      }),
    }));
}

function dataGroup(zoneValue: unknown): MobileDataMatrixRow['groups'][number]['id'] {
  const zone = text(zoneValue).toLowerCase();
  if (zone === 'calculated' || zone === 'calculation') return 'calculated';
  if (zone === 'primary_media' || zone === 'effect_media') return 'effect_media';
  if (zone === 'evaluation') return 'evaluation';
  if (zone === 'issue_point') return 'issues';
  return 'input';
}

const GROUP_LABELS: Record<MobileDataMatrixRow['groups'][number]['id'], string> = {
  input: '输入',
  calculated: '计算',
  effect_media: '效果素材',
  evaluation: '效果评价',
  issues: '问题点',
};

export function buildMobileDataMatrixRows(model: {
  columns?: Array<{ id: string; zone: string; label: string; displayOrder: number; unitText?: string | null }>;
  rows?: Array<{ id: string; level1Label?: string | null; level2Label?: string | null; cells: Record<string, unknown> }>;
  cellMedia?: Record<string, Array<{ materialId?: string; fileName?: string | null; materialType?: string; filePath?: string | null; fileUrl?: string | null }>>;
  issuePoints?: Array<{ id: string; leafRowId: string; columnId: string; issueText: string; status: string }>;
}): MobileDataMatrixRow[] {
  const columns = [...(model.columns ?? [])]
    .filter((column) => text(column.zone) !== 'hierarchy')
    .sort((left, right) => Number(left.displayOrder ?? 0) - Number(right.displayOrder ?? 0));
  return (model.rows ?? []).map((row, rowIndex) => {
    const rowId = text(row.id, `row-${rowIndex}`);
    const cells = row.cells;
    const grouped = new Map<MobileDataMatrixRow['groups'][number]['id'], MobileDataMatrixField[]>();
    for (const column of columns) {
      const columnId = text(column.id);
      const key = `${rowId}:${columnId}`;
      const media = (model.cellMedia?.[key] ?? []).flatMap((item, index) => {
        const url = text(item.filePath ?? item.fileUrl);
        return url ? [{
          id: text(item.materialId, `${key}:${index}`),
          name: text(item.fileName, '素材'),
          type: text(item.materialType, 'image'),
          url,
        }] : [];
      });
      const issues = (model.issuePoints ?? []).filter((issue) => (
        text(issue.leafRowId) === rowId && text(issue.columnId) === columnId
      )).map((issue, index) => ({
        id: text(issue.id, `${key}:issue:${index}`),
        text: text(issue.issueText),
        status: text(issue.status),
      }));
      const group = dataGroup(column.zone);
      grouped.set(group, [...(grouped.get(group) ?? []), {
        id: columnId,
        label: text(column.label, columnId),
        value: cells[columnId] ?? '—',
        ...(text(column.unitText) ? { unit: text(column.unitText) } : {}),
        media,
        issues,
      }]);
    }
    return {
      id: rowId,
      path: [text(row.level1Label), text(row.level2Label)].filter(Boolean),
      groups: (Object.keys(GROUP_LABELS) as Array<keyof typeof GROUP_LABELS>).flatMap((id) => {
        const fields = grouped.get(id) ?? [];
        return fields.length ? [{ id, label: GROUP_LABELS[id], fields }] : [];
      }),
    };
  });
}

/** Desktop and mobile readers intentionally share the same lossless cell projection. */
export function buildDesktopDataMatrixRows(
  model: Parameters<typeof buildMobileDataMatrixRows>[0],
): MobileDataMatrixRow[] {
  return buildMobileDataMatrixRows(model);
}
