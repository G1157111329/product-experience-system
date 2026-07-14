import { dataMatrixReadLayout, type ReportDataMatrixReadCard, type ReportDataMatrixReadNarrative } from '@/lib/report-data-matrix-layout';
import { evaluationStatusLabel } from '@/lib/evaluation-status';
import type { FrozenMedia, FrozenRecipeContext, FrozenReportViewModel } from '@/lib/report-frozen-view';

type Row = Record<string, unknown>;

export type PrintMedia = FrozenMedia & { posterUrl?: string };

export type PrintComparisonCell = {
  value: string;
  score: string;
  notes: string[];
  problems: string[];
  media: PrintMedia[];
};

export type PrintMatrix =
  | {
    kind: 'comparison';
    title: string;
    /** Explicitly frozen comparison layout, if the snapshot supplied one. */
    layoutProfile: string;
    columns: Array<{ id: string; label: string }>;
    rows: Array<{ id: string; path: string[]; cells: Record<string, PrintComparisonCell> }>;
  }
  | {
    kind: 'data_v2' | 'data_v3';
    title: string;
    summary?: string;
    rows: ReportDataMatrixReadCard[];
    narratives: ReportDataMatrixReadNarrative[];
  };

export type PrintReportViewModel = {
  sourceReportId: string;
  snapshotResolution: FrozenReportViewModel['snapshotResolution'];
  page: { paper: 'A4' | 'A3'; orientation: 'portrait' | 'landscape' };
  header: FrozenReportViewModel['header'];
  summary: FrozenReportViewModel['summary'];
  issues: FrozenReportViewModel['issues'];
  functionEffects: FrozenReportViewModel['functionEffects'];
  matrix: PrintMatrix | null;
};

function record(value: unknown): Row {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
}

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.map(record).filter((item) => Object.keys(item).length > 0) : [];
}

function text(value: unknown, fallback = '') {
  const result = value === null || value === undefined ? '' : String(value).trim();
  return result || fallback;
}

function videoType(type: string, url: string) {
  return type.toLowerCase().includes('video') || /\.(mp4|m4v|mov|webm)(?:\?|$)/i.test(url);
}

function posterDerivativeUrl(url: string) {
  const withoutQuery = url.split('?')[0] || '';
  let key = '';
  if (withoutQuery.startsWith('/api/materials/file/')) key = withoutQuery.slice('/api/materials/file/'.length);
  else if (withoutQuery.startsWith('/uploads/')) key = withoutQuery.slice('/uploads/'.length);
  else if (!/^(?:https?:|data:|blob:|\/api\/)/i.test(withoutQuery)) key = withoutQuery.replace(/^\/+/, '');
  return key ? `/api/materials/poster/${key.split('/').map(encodeURIComponent).join('/')}` : '';
}

function normalizedMediaUrl(value: string) {
  const url = value.trim().replace(/\\/g, '/');
  if (!url || url.startsWith('data:')) return url;
  try {
    const absolute = /^https?:\/\//i.test(url);
    const parsed = new URL(url, 'http://print.local');
    for (const key of [...parsed.searchParams.keys()]) {
      if (key === 'exp' || key === 'token' || key.toLowerCase().startsWith('x-amz-')) parsed.searchParams.delete(key);
    }
    parsed.searchParams.sort();
    return absolute ? `${parsed.origin}${parsed.pathname}${parsed.search}` : `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

function dedupeMedia(items: PrintMedia[]) {
  const ids = new Set<string>();
  const urls = new Set<string>();
  const names = new Set<string>();
  return items.filter((item) => {
    const id = text(item.id);
    const url = normalizedMediaUrl(text(item.url));
    const name = text(item.name);
    const fallbackName = !id && !url ? name : '';
    const duplicate = Boolean((id && ids.has(id)) || (url && urls.has(url)) || (fallbackName && names.has(fallbackName)));
    if (id) ids.add(id);
    if (url) urls.add(url);
    if (fallbackName) names.add(fallbackName);
    return !duplicate;
  });
}

function mediaFromUnknown(value: unknown): PrintMedia[] {
  const projected = rows(value).flatMap((item, index) => {
    const url = text(item.url || item.file_url || item.fileUrl || item.file_path || item.filePath);
    if (!url) return [];
    const type = text(item.type || item.material_type || item.materialType, 'image');
    const explicitPoster = text(item.posterUrl || item.poster_url || item.thumbnailUrl || item.thumbnail_url);
    return [{
      id: text(item.id || item.material_id || item.materialId, `${url}:${index}`),
      name: text(item.name || item.file_name || item.fileName, '素材'),
      type,
      url,
      ...(videoType(type, url) ? { posterUrl: explicitPoster || posterDerivativeUrl(url) || undefined } : {}),
    }];
  });
  return dedupeMedia(projected);
}

function textList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => typeof item === 'string' ? item.trim() : text(record(item).text || record(item).value)).filter(Boolean)
    : [];
}

function cloneMedia(items: FrozenMedia[]): PrintMedia[] {
  return mediaFromUnknown(items);
}

function cloneFrozenModelParts(model: FrozenReportViewModel) {
  const cloneRecipe = (recipe: FrozenRecipeContext): FrozenRecipeContext => ({
    ...recipe,
    parameters: typeof recipe.parameters === 'object' && recipe.parameters !== null ? { ...recipe.parameters } : recipe.parameters,
    evidence: cloneMedia(recipe.evidence),
    steps: recipe.steps.map((step) => ({ ...step, evidence: cloneMedia(step.evidence) })),
  });
  return {
    header: { ...model.header },
    summary: {
      ...model.summary,
      aiSummary: model.summary.aiSummary ? { ...model.summary.aiSummary } : null,
      taskInfo: model.summary.taskInfo ? { ...model.summary.taskInfo } : null,
      stats: { ...model.summary.stats },
    },
    issues: model.issues.map((issue) => ({
      ...issue,
      evidence: cloneMedia(issue.evidence),
      liveOverlay: {
        ...issue.liveOverlay,
        evidence: cloneMedia(issue.liveOverlay.evidence),
        retest: {
          ...issue.liveOverlay.retest,
          latest: issue.liveOverlay.retest.latest
            ? { ...issue.liveOverlay.retest.latest, evidence: cloneMedia(issue.liveOverlay.retest.latest.evidence) }
            : null,
        },
      },
      ...(issue.recipe ? { recipe: cloneRecipe(issue.recipe) } : {}),
    })),
    functionEffects: model.tabs.includes('function_effect') ? model.functionEffects.map(cloneRecipe) : [],
  };
}

function comparisonMatrix(snapshotValue: unknown): PrintMatrix {
  const snapshot = record(snapshotValue);
  const assembly = record(snapshot.assembly);
  const objects = rows(snapshot.objects);
  const allNodes = rows(snapshot.item_nodes);
  const nodesById = new Map(allNodes.map((node) => [text(node.id), node]));
  const nodes = allNodes.filter((node) => {
    const nodeType = text(node.node_type, 'item');
    return ['item', 'condition', 'process_node', 'metric', 'issue_group'].includes(nodeType);
  });
  const cells = rows(snapshot.cells);
  const columns = objects.map((object, index) => ({
    id: text(object.id, String(index)),
    label: text(object.object_name || object.label || object.name, `对象 ${index + 1}`),
  }));
  return {
    kind: 'comparison',
    layoutProfile: text(snapshot.layout_profile),
    title: text(snapshot.matrix_name || assembly.name, '对比矩阵'),
    columns,
    rows: nodes.map((node, rowIndex) => {
      const id = text(node.id, String(rowIndex));
      const cellMap: Record<string, PrintComparisonCell> = {};
      for (const column of columns) {
        const cell = cells.find((candidate) => (
          text(candidate.item_node_id) === id
          && text(candidate.object_id || candidate.comparison_object_id) === column.id
        ));
        const value = text(cell?.effect_summary || cell?.metric_value || cell?.measurement_value || cell?.value || cell?.conclusion || cell?.text || cell?.manual_score, '-');
        cellMap[column.id] = {
          value,
          score: text(cell?.manual_score || cell?.ai_score),
          notes: textList(cell?.process_notes).filter((note) => note !== value),
          problems: textList(cell?.problem_points).filter((problem) => problem !== value),
          media: dedupeMedia([
            ...mediaFromUnknown(cell?.inline_media),
            ...mediaFromUnknown(cell?.appendix_media),
            ...mediaFromUnknown(cell?.media),
          ]),
        };
      }
      const ancestors: string[] = [];
      const visited = new Set<string>();
      let parent = nodesById.get(text(node.parent_id));
      while (parent && !visited.has(text(parent.id))) {
        visited.add(text(parent.id));
        const label = text(parent.node_label || parent.label);
        if (label) ancestors.unshift(label);
        parent = nodesById.get(text(parent.parent_id));
      }
      return {
        id,
        path: [...ancestors, text(node.parent_label || node.group_label), text(node.node_label || node.label, `项目 ${rowIndex + 1}`)].filter(Boolean),
        cells: cellMap,
      };
    }),
  };
}

function projectMatrix(matrix: FrozenReportViewModel['matrix']): PrintMatrix | null {
  if (!matrix) return null;
  if (matrix.kind === 'comparison') return comparisonMatrix(matrix.snapshot);
  const layout = dataMatrixReadLayout(matrix.projection);
  return {
    kind: matrix.kind,
    title: layout.title,
    summary: layout.summary,
    rows: layout.cards.map((card) => ({
      ...card,
      path: [...card.path],
      fields: card.fields.map((field) => ({ ...field })),
      media: card.media.map((item) => ({ ...item })),
      issues: card.issues.map((item) => ({ ...item })),
      narratives: card.narratives.map((item) => ({ ...item })),
      ...(card.issueSummary ? { issueSummary: { count: card.issueSummary.count, levels: [...card.issueSummary.levels] } } : {}),
    })),
    narratives: layout.narratives.map((item) => ({ ...item })),
  };
}

export function printPageForMatrix(matrix: PrintMatrix | null): PrintReportViewModel['page'] {
  if (!matrix || matrix.kind !== 'comparison') return { paper: 'A4', orientation: 'portrait' };
  // Snapshot layout is authoritative for historical reports. The adaptive
  // fallback below is only for snapshots without an explicit layout anchor.
  if (/a3[_-]landscape/i.test(matrix.layoutProfile)) return { paper: 'A3', orientation: 'landscape' };
  const estimatedWidth = 18 + matrix.columns.reduce((total, column) => {
    const contentLength = Math.max(column.label.length, ...matrix.rows.map((row) => row.cells[column.id]?.value.length || 0));
    return total + Math.min(34, Math.max(16, contentLength * 1.6));
  }, 0);
  return matrix.columns.length >= 4 || estimatedWidth > 68
    ? { paper: 'A3', orientation: 'landscape' }
    : { paper: 'A4', orientation: 'portrait' };
}

export function pdfProfileForPrintModel(model: PrintReportViewModel) {
  const scope = model.matrix?.kind === 'comparison' ? 'comparison' : 'single';
  return {
    id: `${scope}_${model.page.paper.toLowerCase()}_${model.page.orientation}`,
    paper: model.page.paper,
    orientation: model.page.orientation,
    description: `${scope} ${model.page.paper} ${model.page.orientation}`,
  };
}

export function buildPrintReportViewModel(model: FrozenReportViewModel): PrintReportViewModel {
  const frozen = cloneFrozenModelParts(model);
  const matrix = projectMatrix(model.matrix);
  return {
    sourceReportId: model.header.id,
    snapshotResolution: model.snapshotResolution,
    page: printPageForMatrix(matrix),
    ...frozen,
    matrix,
  };
}

export function printReportMedia(model: PrintReportViewModel): PrintMedia[] {
  const issueMedia = model.issues.flatMap((issue) => [
    ...issue.evidence,
    ...issue.liveOverlay.evidence,
    ...(issue.liveOverlay.retest.latest?.evidence ?? []),
  ]);
  const functionMedia = model.functionEffects.flatMap((effect) => [
    ...effect.evidence,
    ...effect.steps.flatMap((step) => step.evidence),
  ]);
  const matrixMedia = !model.matrix ? [] : model.matrix.kind === 'comparison'
    ? model.matrix.rows.flatMap((row) => Object.values(row.cells).flatMap((cell) => cell.media))
    : model.matrix.rows.flatMap((row) => row.media);
  return [...issueMedia, ...functionMedia, ...matrixMedia];
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMedia(items: PrintMedia[]) {
  if (items.length === 0) return '';
  return `<div class="paper-media">${items.map((item) => {
    const name = escapeHtml(item.name || item.id);
    if (videoType(item.type, item.url)) {
      const poster = item.posterUrl
        ? `<img data-video-poster src="${escapeHtml(item.posterUrl)}" alt="${name}" />`
        : '';
      return `<figure class="paper-video" data-media-id="${escapeHtml(item.id)}">${poster}<div class="video-label">VIDEO</div><figcaption>${name}</figcaption></figure>`;
    }
    return `<figure data-media-id="${escapeHtml(item.id)}"><img src="${escapeHtml(item.url)}" alt="${name}" /><figcaption>${name}</figcaption></figure>`;
  }).join('')}</div>`;
}

function renderDataMatrix(matrix: Extract<PrintMatrix, { kind: 'data_v2' | 'data_v3' }>) {
  const cards = matrix.rows.map((card) => {
    const fields = card.fields.map((field) => {
      const value = field.unit && !String(field.value).includes(field.unit) ? `${field.value} ${field.unit}` : String(field.value);
      return `<div class="paper-field"><span>${escapeHtml(field.label)}</span><b>${escapeHtml(value)}</b></div>`;
    }).join('');
    const narratives = card.narratives.map((item) => `<p><b>${escapeHtml(item.label)}：</b>${escapeHtml(item.text)}</p>`).join('');
    const issues = card.issues.map((item) => `<li>${escapeHtml(item.text)}${item.status ? `（${escapeHtml(item.status)}）` : ''}</li>`).join('');
    const issueSummary = card.issueSummary
      ? `<p class="issues">问题 ${card.issueSummary.count} 个${card.issueSummary.levels.length ? ` / ${escapeHtml(card.issueSummary.levels.join('、'))}` : ''}</p>`
      : '';
    return `<article class="paper-row" data-matrix-row="${escapeHtml(card.id)}"><h3>${escapeHtml(card.path.join(' / '))}</h3><div class="paper-fields">${fields}</div>${narratives}${issueSummary}${issues ? `<ul class="issues">${issues}</ul>` : ''}${renderMedia(card.media)}</article>`;
  }).join('');
  const narratives = matrix.narratives.map((item) => `<p class="matrix-narrative"><b>${escapeHtml(item.label)}：</b>${escapeHtml(item.text)}</p>`).join('');
  return `<section data-print-matrix="${matrix.kind}"><h2>${escapeHtml(matrix.title)}</h2>${matrix.summary ? `<p class="muted">${escapeHtml(matrix.summary)}</p>` : ''}${cards}${narratives}</section>`;
}

function renderComparison(matrix: Extract<PrintMatrix, { kind: 'comparison' }>) {
  const head = matrix.columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('');
  const body = matrix.rows.map((row) => `<tr><th>${escapeHtml(row.path.join(' / '))}</th>${matrix.columns.map((column) => {
    const cell = row.cells[column.id];
    const notes = cell?.notes.map((item) => `<p><b>过程记录：</b>${escapeHtml(item)}</p>`).join('') || '';
    const problems = cell?.problems.map((item) => `<p class="issues"><b>问题点：</b>${escapeHtml(item)}</p>`).join('') || '';
    return `<td>${escapeHtml(cell?.value || '-')}${cell?.score ? `<p><b>评分：</b>${escapeHtml(cell.score)}</p>` : ''}${notes}${problems}${renderMedia(cell?.media || [])}</td>`;
  }).join('')}</tr>`).join('');
  return `<section data-print-matrix="comparison"><h2>${escapeHtml(matrix.title)}</h2><table class="comparison-table"><thead><tr><th>项目</th>${head}</tr></thead><tbody>${body}</tbody></table></section>`;
}

function renderIssues(model: PrintReportViewModel) {
  if (model.issues.length === 0) return '';
  return `<section><h2>问题</h2>${model.issues.map((issue) => {
    const recipe = issue.recipe;
    const parameters = recipe?.parameters
      ? typeof recipe.parameters === 'string' ? recipe.parameters : Object.entries(recipe.parameters).map(([key, value]) => `${key}：${String(value)}`).join('；')
      : '';
    const steps = recipe?.steps.length
      ? `<div><p><b>食谱步骤：</b>${recipe.steps.length}步</p>${recipe.steps.map((step, index) => `<div class="paper-step"><b>步骤 ${escapeHtml(step.stepNumber ?? index + 1)}</b> ${escapeHtml(step.operation)}${renderMedia(step.evidence)}</div>`).join('')}</div>`
      : '';
    const latest = issue.liveOverlay.retest.latest;
    const retest = latest
      ? `<div class="reevaluation"><b>整改复测：</b>${escapeHtml(evaluationStatusLabel(latest.result))}${latest.description ? ` ${escapeHtml(latest.description)}` : ''}${latest.createdAt || latest.createdBy ? `<p class="meta">${escapeHtml([latest.createdAt, latest.createdBy].filter(Boolean).join(' · '))}</p>` : ''}${renderMedia(latest.evidence)}${issue.liveOverlay.retest.count >= 2 ? `<p>整改复测记录数：${issue.liveOverlay.retest.count}</p>` : ''}</div>`
      : '';
    const rectification = issue.liveOverlay.status === 'verified_closed' && (issue.liveOverlay.rectification || issue.liveOverlay.evidence.length)
      ? `<div><p><b>整改效果评价：</b>${escapeHtml(issue.liveOverlay.rectification)}</p><p><b>整改素材：</b></p>${renderMedia(issue.liveOverlay.evidence)}</div>`
      : '';
    const original = recipe
      ? `<p><b>食谱名称：</b>${escapeHtml(recipe.name)}</p>${recipe.formula ? `<p><b>食谱配方：</b>${escapeHtml(recipe.formula)}</p>` : ''}${parameters ? `<p><b>食谱参数：</b>${escapeHtml(parameters)}</p>` : ''}${steps}<p><b>食谱效果评价：</b>${escapeHtml(recipe.evaluation)}（${escapeHtml(evaluationStatusLabel(recipe.evaluationStatus))}）</p>${recipe.evidence.length ? '<p><b>素材：</b></p>' : ''}${renderMedia(recipe.evidence)}<p><b>问题：</b>${escapeHtml(issue.details || issue.title)}</p>${renderMedia(issue.evidence)}`
      : `<p><b>问题：</b>${escapeHtml(issue.details || issue.title)}</p>${issue.evidence.length ? '<p><b>素材：</b></p>' : ''}${renderMedia(issue.evidence)}`;
    const status = issue.liveOverlay.status ? escapeHtml(({ open: '待整改', rectifying: '整改中', verified_closed: '整改完成', waived: '不整改' }[issue.liveOverlay.status] ?? issue.liveOverlay.status)) : '';
    const source = ({ sensory: '五感体验', function: '食谱/功能', comparison: '对比项', matrix: '数据矩阵' }[issue.sourceKind] ?? issue.sourceType);
    const context = `${issue.context.object ? `<p><b>对象：</b>${escapeHtml(issue.context.object)}</p>` : ''}${issue.context.project ? `<p><b>项目：</b>${escapeHtml(issue.context.project)}</p>` : ''}${issue.context.item ? `<p><b>细项：</b>${escapeHtml(issue.context.item)}</p>` : ''}`;
    return `<article class="paper-row"><h3>${issue.level ? `<span class="meta">${escapeHtml(issue.level)}</span> ` : ''}<span class="meta">${escapeHtml(source)}</span> ${escapeHtml(issue.title)}${status ? `<span class="meta"> ${status}</span>` : ''}</h3>${context}${original}${rectification}${retest}</article>`;
  }).join('')}</section>`;
}

function renderFunctions(model: PrintReportViewModel) {
  if (model.functionEffects.length === 0) return '';
  return `<section><h2>功能效果</h2>${model.functionEffects.map((effect) => {
    const steps = effect.steps.map((step, index) => {
      return `<div class="paper-step"><b>步骤 ${escapeHtml(step.stepNumber ?? index + 1)}</b> ${escapeHtml(step.operation)}${renderMedia(step.evidence)}</div>`;
    }).join('');
    const issueCount = model.issues.filter((issue) => issue.recipe?.recipeId === effect.recipeId).length;
    const score = effect.effectScore ? `　效果评分：${escapeHtml(effect.effectScore)}` : '';
    return `<article class="paper-row"><h3>${escapeHtml(effect.name)} <span class="meta">步骤数：${effect.steps.length}${score}　问题点数量：${issueCount}</span></h3>${effect.formula ? `<p><b>食谱/食材：</b>${escapeHtml(effect.formula)}</p>` : ''}${effect.parameters ? `<p><b>食谱参数：</b>${escapeHtml(typeof effect.parameters === 'string' ? effect.parameters : Object.entries(effect.parameters).map(([key, value]) => `${key}：${String(value)}`).join('；'))}</p>` : ''}<p><b>效果评价：</b>${escapeHtml(effect.evaluation)}（${escapeHtml(evaluationStatusLabel(effect.evaluationStatus))}）</p>${renderMedia(effect.evidence)}${steps}</article>`;
  }).join('')}</section>`;
}

function renderProductInfo(model: PrintReportViewModel) {
  const task = model.summary.taskInfo ?? {};
  const fields: Array<[string, unknown]> = [
    ['单号', task.project_number], ['产品型号', task.product_model ?? model.header.productModel], ['产品', task.product],
    ['品类', task.product_category], ['项目类型', task.project_type], ['项目阶段', task.project_phase],
    ['体验人', task.organizer], ['体验时间', task.test_date], ['创建时间', task.created_at],
  ].filter((item): item is [string, unknown] => item[1] !== null && item[1] !== undefined && text(item[1]) !== '');
  const stats = model.summary.stats;
  const overview = [
    ['问题点总数', stats.issueCount], ['五感体验问题点', stats.sensoryIssueCount], ['功能效果问题点', stats.functionIssueCount],
    ['对比问题点', stats.comparisonIssueCount], ['整改率', `${stats.rectificationRate}%`],
  ];
  const taskGrid = fields.length ? `<section><h2>产品信息</h2><div class="task-grid">${fields.map(([label, value]) => `<p><span>${escapeHtml(label)}：</span>${escapeHtml(value)}</p>`).join('')}</div>${task.test_purpose ? `<p><span>体验目的：</span>${escapeHtml(task.test_purpose)}</p>` : ''}</section>` : '';
  const overviewGrid = `<section><h2>概览统计</h2><div class="overview-grid">${overview.map(([label, value]) => `<div><b>${escapeHtml(value)}</b><span>${escapeHtml(label)}</span></div>`).join('')}</div></section>`;
  return `${taskGrid}${overviewGrid}`;
}

export function renderPrintReportHtml(model: PrintReportViewModel, _generatedAt = new Date()) {
  void _generatedAt;
  const matrix = model.matrix
    ? model.matrix.kind === 'comparison' ? renderComparison(model.matrix) : renderDataMatrix(model.matrix)
    : '';
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8" /><style>
    @page { size: ${model.page.paper} ${model.page.orientation}; margin: 12mm; }
    * { box-sizing: border-box; } body { margin: 0; color: #111827; font-family: -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif; font-size: 11px; line-height: 1.55; }
    h1 { margin: 0 0 4px; font-size: 22px; } h2 { margin: 18px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #0f766e; color: #0f766e; font-size: 16px; break-after: avoid; } h3 { margin: 0 0 5px; font-size: 12px; break-after: avoid; }
    section { break-inside: auto; } .cover,.paper-row { border: 1px solid #d1d5db; border-radius: 6px; padding: 9px; margin: 7px 0; background: #fff; break-inside: avoid; } .muted,.meta { color: #6b7280; }
    .paper-fields,.task-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 5px; } .paper-field { border: 1px solid #e5e7eb; border-radius: 4px; padding: 5px; } .paper-field span,.paper-field b { display: block; overflow-wrap: anywhere; } .task-grid p { margin: 0; } .task-grid span { color: #6b7280; } .overview-grid { display: grid; grid-template-columns: repeat(5,minmax(0,1fr)); gap: 5px; } .overview-grid div { border: 1px solid #d1d5db; padding: 6px; text-align: center; } .overview-grid b,.overview-grid span { display:block; } .overview-grid span { color:#6b7280; }
    .paper-media { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; } figure { width: 72px; margin: 0; border: 1px solid #d1d5db; border-radius: 4px; padding: 3px; break-inside: avoid; } figure img { width: 64px; height: 48px; object-fit: cover; display: block; background: #e5e7eb; } .paper-video { position: relative; } .video-label { position: absolute; left: 3px; top: 35px; width: 64px; padding: 1px 0; background: rgba(17,24,39,.72); color: #fff; text-align: center; font-weight: 700; } figcaption { margin-top: 2px; color: #6b7280; font-size: 8px; overflow-wrap: anywhere; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; } thead { display: table-header-group; } th,td { border: 1px solid #d1d5db; padding: 5px; vertical-align: top; overflow-wrap: anywhere; } th { background: #f0fdfa; color: #0f766e; } .issues { color: #991b1b; }
  </style></head><body data-print-report-id="${escapeHtml(model.sourceReportId)}">
    <header class="cover"><h1>${escapeHtml(model.header.title)}</h1>${model.header.productModel ? `<p>${escapeHtml(model.header.productModel)}</p>` : ''}</header>
    ${renderProductInfo(model)}${model.summary.text ? `<section><h2>总结</h2><p>${escapeHtml(model.summary.text)}</p></section>` : ''}
    ${renderIssues(model)}${renderFunctions(model)}${matrix}
  </body></html>`;
}
