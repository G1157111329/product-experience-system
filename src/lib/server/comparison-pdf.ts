import { generatePresignedUrl } from './storage';

const SUPPORTED_PROFILE = 'comparison_image_matrix_a3_landscape';

type Row = Record<string, unknown>;
type MediaRow = Row & {
  file_url?: string | null;
  file_path?: string | null;
  file_name?: string | null;
  material_type?: string | null;
};
type CellRow = Row & {
  inline_media?: MediaRow[];
  appendix_media?: MediaRow[];
};

export type ComparisonPdfPreflight = {
  ok: boolean;
  profile: string;
  snapshot_id: string;
  snapshot_version: number;
  report_id: string;
  counts: {
    objects: number;
    item_nodes: number;
    cells: number;
    inline_media: number;
    appendix_media: number;
    confirmed_ai_results: number;
  };
  warnings: string[];
};

export function supportedComparisonPdfProfile() {
  return SUPPORTED_PROFILE;
}

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value as Row[] : [];
}

function cells(value: unknown): CellRow[] {
  return Array.isArray(value) ? value as CellRow[] : [];
}

function text(value: unknown, fallback = '') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function html(value: unknown) {
  return text(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function list(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => typeof item === 'string' ? item : JSON.stringify(item)).filter(Boolean);
}

const MATRIX_CELL_NODE_TYPES = new Set(['item', 'condition', 'process_node', 'metric', 'issue_group']);

function isMatrixNode(node: Row) {
  return MATRIX_CELL_NODE_TYPES.has(text(node.node_type, 'item'));
}

function cellKey(nodeId: unknown, objectId: unknown) {
  return `${text(nodeId)}::${text(objectId)}`;
}

function media(cell: CellRow, field: 'inline_media' | 'appendix_media') {
  return Array.isArray(cell[field]) ? cell[field] : [];
}

export function buildComparisonPdfPreflight(input: {
  reportId: string;
  snapshotId: string;
  snapshotVersion: number;
  snapshot: Row;
}): ComparisonPdfPreflight {
  const objects = rows(input.snapshot.objects);
  const itemNodes = rows(input.snapshot.item_nodes).filter(isMatrixNode);
  const matrixCells = cells(input.snapshot.cells);
  const inlineCount = matrixCells.reduce((sum, cell) => sum + media(cell, 'inline_media').length, 0);
  const appendixCount = matrixCells.reduce((sum, cell) => sum + media(cell, 'appendix_media').length, 0);
  const warnings: string[] = [];

  if (text(input.snapshot.report_type) !== 'comparison_report') warnings.push('snapshot_report_type_mismatch');
  if (text(input.snapshot.layout_profile) !== SUPPORTED_PROFILE) warnings.push('unsupported_layout_profile');
  if (objects.length === 0) warnings.push('no_comparison_objects');
  if (itemNodes.length === 0) warnings.push('no_item_nodes');
  if (matrixCells.length === 0) warnings.push('no_matrix_cells');

  return {
    ok: warnings.length === 0,
    profile: SUPPORTED_PROFILE,
    snapshot_id: input.snapshotId,
    snapshot_version: input.snapshotVersion,
    report_id: input.reportId,
    counts: {
      objects: objects.length,
      item_nodes: itemNodes.length,
      cells: matrixCells.length,
      inline_media: inlineCount,
      appendix_media: appendixCount,
      confirmed_ai_results: rows(input.snapshot.confirmed_ai_results).length,
    },
    warnings,
  };
}

async function mediaUrl(material: MediaRow) {
  const key = material.file_path || material.file_url;
  if (!key) return '';
  if (String(key).startsWith('data:')) return String(key);
  return generatePresignedUrl({ key: String(key), expireTime: 30 * 60, absoluteUrl: true });
}

async function renderMedia(materials: MediaRow[]) {
  const chunks: string[] = [];
  for (const material of materials) {
    const url = await mediaUrl(material);
    if (!url) continue;
    if (material.material_type === 'video') {
      chunks.push(`<div class="media video"><video src="${html(url)}" muted preload="metadata"></video><span>VIDEO</span></div>`);
    } else {
      chunks.push(`<img class="media" src="${html(url)}" alt="${html(material.file_name || 'media')}" />`);
    }
  }
  return chunks.join('');
}

async function renderCell(cell: CellRow | undefined) {
  if (!cell) return '<div class="muted">未录入</div>';
  const processNotes = list(cell.process_notes);
  const problemPoints = list(cell.problem_points);
  const inlineMedia = media(cell, 'inline_media');
  const appendixMedia = media(cell, 'appendix_media');
  const score = text(cell.manual_score || cell.ai_score);
  const blocks: string[] = [];

  blocks.push('<div class="cell-meta">');
  if (score) blocks.push(`<span class="pill">评分 ${html(score)}</span>`);
  if (cell.conclusion_tag) blocks.push(`<span class="pill secondary">${html(cell.conclusion_tag)}</span>`);
  if (cell.ai_status) blocks.push(`<span class="pill subtle">AI ${html(cell.ai_status)}</span>`);
  blocks.push('</div>');
  if (cell.effect_summary) blocks.push(`<p class="summary">${html(cell.effect_summary)}</p>`);
  if (processNotes.length > 0) {
    blocks.push(`<div class="note"><b>过程记录</b>${processNotes.map((item) => `<p>${html(item)}</p>`).join('')}</div>`);
  }
  if (problemPoints.length > 0) {
    blocks.push(`<div class="problems"><b>问题点</b>${problemPoints.map((item) => `<p>${html(item)}</p>`).join('')}</div>`);
  }
  if (inlineMedia.length > 0) blocks.push(`<div class="media-grid">${await renderMedia(inlineMedia)}</div>`);
  if (appendixMedia.length > 0) blocks.push(`<div class="appendix"><b>附录素材 ${appendixMedia.length}</b><div class="media-grid">${await renderMedia(appendixMedia)}</div></div>`);
  if (blocks.length === 1) blocks.push('<div class="muted">暂无内容</div>');
  return blocks.join('');
}

export async function renderComparisonPdfHtml(input: {
  title: string;
  snapshot: Row;
  generatedAt?: Date;
}) {
  const snapshot = input.snapshot;
  const assembly = (snapshot.assembly || {}) as Row;
  const objects = rows(snapshot.objects);
  const itemNodes = rows(snapshot.item_nodes).filter(isMatrixNode);
  const matrixCells = cells(snapshot.cells);
  const cellMap = new Map(matrixCells.map((cell) => [cellKey(cell.item_node_id, cell.object_id), cell]));
  const rowsHtml: string[] = [];

  for (const node of itemNodes) {
    const cellColumns: string[] = [];
    for (const object of objects) {
      const cell = cellMap.get(cellKey(node.id, object.id));
      cellColumns.push(`<td>${await renderCell(cell)}</td>`);
    }
    rowsHtml.push(`
      <tr>
        <th>
          <div class="node-label">${html(node.node_label)}</div>
          <div class="muted">${html(node.node_type || 'item')}</div>
        </th>
        ${cellColumns.join('')}
      </tr>
    `);
  }

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A3 landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111827; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif; font-size: 12px; }
    h1 { margin: 0 0 6px; font-size: 24px; letter-spacing: 0; }
    .subhead { color: #6b7280; margin-bottom: 14px; }
    .summary-band { display: grid; grid-template-columns: 1.6fr repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
    .box { border: 1px solid #d1d5db; border-radius: 6px; padding: 8px; background: #fff; }
    .box b { display: block; margin-bottom: 4px; color: #0f766e; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 1px solid #d1d5db; vertical-align: top; padding: 7px; }
    thead th { background: #f0fdfa; color: #0f766e; font-weight: 700; }
    tbody th { width: 140px; background: #f9fafb; text-align: left; }
    .node-label { font-weight: 700; line-height: 1.4; }
    .muted { color: #6b7280; font-size: 10px; }
    .cell-meta { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 4px; min-height: 16px; }
    .pill { display: inline-block; border-radius: 3px; padding: 1px 5px; background: #ccfbf1; color: #0f766e; font-size: 10px; font-weight: 700; }
    .pill.secondary { background: #eef2ff; color: #3730a3; }
    .pill.subtle { background: #f3f4f6; color: #4b5563; }
    .summary { margin: 4px 0; line-height: 1.55; white-space: pre-wrap; }
    .note, .problems, .appendix { margin-top: 5px; border-radius: 4px; padding: 5px; line-height: 1.45; }
    .note { background: #f9fafb; }
    .problems { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }
    .note p, .problems p { margin: 3px 0 0; }
    .appendix { border: 1px dashed #cbd5e1; background: #f8fafc; }
    .media-grid { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px; }
    .media { width: 54px; height: 54px; border-radius: 4px; border: 1px solid #d1d5db; object-fit: cover; background: #f3f4f6; overflow: hidden; position: relative; }
    .video video { width: 100%; height: 100%; object-fit: cover; }
    .video span { position: absolute; left: 4px; bottom: 3px; color: #fff; background: rgba(0,0,0,.55); font-size: 8px; padding: 1px 3px; border-radius: 2px; }
  </style>
</head>
<body>
  <h1>${html(input.title || assembly.name || '对比报告')}</h1>
  <div class="subhead">
    ${html(assembly.product_category || '未设置品类')} / ${html(assembly.product || '未设置产品')}
    · Profile: ${SUPPORTED_PROFILE}
    · 生成时间: ${html((input.generatedAt || new Date()).toLocaleString('zh-CN', { hour12: false }))}
  </div>
  <div class="summary-band">
    <div class="box"><b>对比目的</b>${html(assembly.comparison_intent || '-')}</div>
    <div class="box"><b>对象</b>${objects.length}</div>
    <div class="box"><b>节点</b>${itemNodes.length}</div>
    <div class="box"><b>单元格</b>${matrixCells.length}</div>
    <div class="box"><b>确认 AI</b>${rows(snapshot.confirmed_ai_results).length}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>项目</th>
        ${objects.map((object, index) => `<th>${html(object.object_name || `对象 ${index + 1}`)}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${rowsHtml.join('') || `<tr><td colspan="${objects.length + 1}" class="muted">暂无对比节点</td></tr>`}
    </tbody>
  </table>
</body>
</html>`;
}
