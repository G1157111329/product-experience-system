import { dataMatrixPrintColumns, dataMatrixReadLayout, type ReportDataMatrixReadCard, type ReportDataMatrixReadNarrative } from '@/lib/report-data-matrix-layout';
import { evaluationStatusLabel, normalizeEvaluationStatus } from '@/lib/evaluation-status';
import { frozenMediaDedupeKey, normalizeFrozenIssueLevel, type FrozenIssue, type FrozenMedia, type FrozenRecipeContext, type FrozenReportViewModel, type FrozenRetestSummary } from '@/lib/report-frozen-view';
import { PRINT_GOLDEN_YELLOW, PRINT_GOLDEN_YELLOW_INK, PRINT_GOLDEN_YELLOW_SOFT, PRINT_TYPOGRAPHY } from '@/lib/report-print-theme';
import { isPrintVideoSource } from '@/lib/print-assets';

type Row = Record<string, unknown>;

export type PrintMedia = FrozenMedia & { posterUrl?: string };

export type PrintIssueProjectionInput = Record<string, unknown>;

type PrintRectificationProjection = {
  plan: string;
  responsible: string;
  time: string;
  retest: string;
};

type PrintIssue = FrozenIssue & { rectificationProjection: PrintRectificationProjection };

export type PrintComparisonCell = {
  value: string;
  score: string;
  notes: string[];
  problems: string[];
  media: PrintMedia[];
};

export type PrintComparisonRow = {
  id: string;
  rowKind: 'group' | 'item' | 'summary';
  label: string;
  group: string;
  summaryText: string;
  /** Kept for compatibility with older print consumers. */
  path: string[];
  cells: Record<string, PrintComparisonCell>;
};

export type PrintMatrix =
  | {
    kind: 'comparison';
    title: string;
    /** Explicitly frozen comparison layout, if the snapshot supplied one. */
    layoutProfile: string;
    columns: Array<{ id: string; label: string }>;
    rows: PrintComparisonRow[];
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
  issues: PrintIssue[];
  functionEffects: FrozenReportViewModel['functionEffects'];
  matrix: PrintMatrix | null;
  /** A report can freeze a comparison matrix and a data matrix at the same time. */
  dataMatrix: PrintMatrix | null;
};

export type PrintSummaryContent = {
  tag: string;
  summary: string;
  strengths: string[];
  risks: string[];
  suggestions: string[];
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

function latestRectification(input: PrintIssueProjectionInput) {
  const history = Array.isArray(input.rectificationHistory) ? input.rectificationHistory.filter((item): item is PrintIssueProjectionInput => Boolean(item && typeof item === 'object')) : [];
  return [...history].sort((left, right) => text(right.created_at || right.updated_at).localeCompare(text(left.created_at || left.updated_at)))[0] ?? input;
}

function rectificationProjection(input: PrintIssueProjectionInput | undefined): PrintRectificationProjection {
  if (!input) return { plan: '', responsible: '', time: '', retest: '' };
  const latest = latestRectification(input);
  const responsible = [text(latest.responsible_person || input.responsible_person), text(latest.responsible_dept || input.responsible_dept)].filter(Boolean).join(' / ');
  const latestRetest = input.latestReEvaluation && typeof input.latestReEvaluation === 'object' ? input.latestReEvaluation as PrintIssueProjectionInput : {};
  const retestResult = text(latestRetest.result || latestRetest.evaluation_result || latestRetest.conclusion);
  const retestDescription = text(latestRetest.description || latestRetest.evaluation_description || latestRetest.verification_note);
  return {
    plan: text(latest.action_plan || latest.improve_plan || latest.rectification || input.improve_plan || input.rectification || input.no_improve_reason),
    responsible,
    time: text(latest.actual_complete_date || latest.plan_complete_date || input.actual_complete_date || input.plan_complete_date || input.due_at),
    retest: [retestResult ? evaluationStatusLabel(retestResult) : '', retestDescription].filter(Boolean).join('：'),
  };
}

function videoType(type: string, url: string) {
  return isPrintVideoSource(type, url);
}

function posterDerivativeUrl(url: string) {
  const withoutQuery = url.split('?')[0] || '';
  let pathname = withoutQuery;
  try {
    pathname = new URL(url, 'http://print.local').pathname;
  } catch {
    // Keep the unparsed path for historical storage keys.
  }
  let key = '';
  if (pathname.startsWith('/api/materials/file/')) key = pathname.slice('/api/materials/file/'.length);
  else if (pathname.startsWith('/uploads/')) key = pathname.slice('/uploads/'.length);
  else if (!/^(?:https?:|data:|blob:|\/api\/)/i.test(withoutQuery)) key = withoutQuery.replace(/^\/+/, '');
  return key ? `/api/materials/poster/${key.split('/').map((segment) => {
    try { return encodeURIComponent(decodeURIComponent(segment)); } catch { return encodeURIComponent(segment); }
  }).join('/')}` : '';
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
  const keys = new Set<string>();
  return items.filter((item) => {
    const id = text(item.id);
    const url = normalizedMediaUrl(text(item.url));
    const name = text(item.name);
    const key = id ? `id:${id}` : url ? `url:${url}` : name ? `name:${name}` : '';
    if (!key || keys.has(key)) return false;
    keys.add(key);
    return true;
  });
}

function mediaFromUnknown(value: unknown): PrintMedia[] {
  const projected = rows(value).flatMap((item) => {
    const url = text(item.url || item.file_url || item.fileUrl || item.file_path || item.filePath);
    if (!url) return [];
    const declaredType = text(item.type || item.material_type || item.materialType, 'image');
    const type = videoType(declaredType, url) ? 'video' : declaredType;
    const explicitPoster = text(item.posterUrl || item.poster_url || item.thumbnailUrl || item.thumbnail_url);
    return [{
      id: text(item.id || item.material_id || item.materialId),
      name: text(item.name || item.file_name || item.fileName, '素材'),
      type,
      url,
      ...(videoType(type, url) ? { posterUrl: explicitPoster || posterDerivativeUrl(url) || undefined } : {}),
    }];
  });
  return dedupeMedia(projected);
}

function hasLiveRetestProjection(input: PrintIssueProjectionInput | undefined): boolean {
  return Boolean(input && (
    Object.prototype.hasOwnProperty.call(input, 'latestReEvaluation')
    || Object.prototype.hasOwnProperty.call(input, 'reEvaluationCount')
  ));
}

function projectedRetestSummary(input: PrintIssueProjectionInput | undefined, frozen: FrozenRetestSummary): FrozenRetestSummary {
  if (!hasLiveRetestProjection(input)) return frozen;
  const latest = record(input?.latestReEvaluation);
  if (Object.keys(latest).length === 0) return { count: Math.max(0, Number(input?.reEvaluationCount) || 0), latest: null, history: [] };
  const row = {
    id: text(latest.id, 'latest-retest'),
    result: normalizeEvaluationStatus(latest.result || latest.evaluation_result || latest.conclusion),
    description: text(latest.description || latest.evaluation_description || latest.conclusion),
    createdAt: text(latest.created_at) || null,
    createdBy: text(latest.created_by_name || latest.created_by || latest.creator_name) || null,
    evidence: mediaFromUnknown(latest.materials),
  };
  return { count: Math.max(1, Number(input?.reEvaluationCount) || 0), latest: row, history: [row] };
}

function textList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => typeof item === 'string' ? item.trim() : text(record(item).text || record(item).value)).filter(Boolean)
    : [];
}

export function printSummaryContent(summary: FrozenReportViewModel['summary']): PrintSummaryContent | null {
  const source = summary.aiSummary ?? (summary.text ? { summary: summary.text } : null);
  if (!source) return null;
  const content = {
    tag: text(source.tag),
    summary: text(source.summary),
    strengths: textList(source.strengths),
    risks: textList(source.risks),
    suggestions: textList(source.suggestions),
  };
  return content.summary || content.tag || content.strengths.length > 0 ? content : null;
}

function cloneMedia(items: FrozenMedia[]): PrintMedia[] {
  return mediaFromUnknown(items);
}

function cloneFrozenModelParts(model: FrozenReportViewModel, issueProjections: PrintIssueProjectionInput[] = []) {
  const cloneRecipe = (recipe: FrozenRecipeContext): FrozenRecipeContext => ({
    ...recipe,
    parameters: typeof recipe.parameters === 'object' && recipe.parameters !== null ? { ...recipe.parameters } : recipe.parameters,
    evidence: cloneMedia(Array.isArray(recipe.evidence) ? recipe.evidence : []),
    steps: (Array.isArray(recipe.steps) ? recipe.steps : []).map((step) => ({
      ...step,
      problemPoints: Array.isArray(step.problemPoints) ? step.problemPoints : [],
      evidence: cloneMedia(Array.isArray(step.evidence) ? step.evidence : []),
    })),
  });
  const projectionsById = new Map(issueProjections.map((item) => [text(item.id), item]));
  const issues: PrintIssue[] = model.issues.map((issue) => {
    const projection = projectionsById.get(issue.liveIssueId || issue.id);
    const frozenRetest = {
      ...issue.liveOverlay.retest,
      latest: issue.liveOverlay.retest.latest
        ? { ...issue.liveOverlay.retest.latest, evidence: cloneMedia(issue.liveOverlay.retest.latest.evidence) }
        : null,
      history: issue.liveOverlay.retest.history.map((retest) => ({ ...retest, evidence: cloneMedia(retest.evidence) })),
    };
    return {
      ...issue,
      evidence: cloneMedia(issue.evidence),
      liveOverlay: {
        ...issue.liveOverlay,
        evidence: cloneMedia(issue.liveOverlay.evidence),
        retest: projectedRetestSummary(projection, frozenRetest),
      },
      ...(issue.recipe ? { recipe: cloneRecipe(issue.recipe) } : {}),
      rectificationProjection: rectificationProjection(projection),
    };
  });
  const claimedByRecipe = new Map<string, Set<string>>();
  for (const issue of issues) {
    if (!issue.recipe) continue;
    const keys = claimedByRecipe.get(issue.recipe.recipeId) ?? new Set<string>();
    [...issue.recipe.evidence, ...issue.recipe.steps.flatMap((step) => step.evidence), ...issue.evidence]
      .forEach((item) => keys.add(frozenMediaDedupeKey(item)));
    claimedByRecipe.set(issue.recipe.recipeId, keys);
  }
  const functionEffects = model.tabs.includes('function_effect') ? model.functionEffects.map(cloneRecipe).map((effect) => {
    const claimed = claimedByRecipe.get(effect.recipeId);
    if (!claimed) return effect;
    return {
      ...effect,
      evidence: effect.evidence.filter((item) => !claimed.has(frozenMediaDedupeKey(item))),
      steps: effect.steps.map((step) => ({
        ...step,
        evidence: step.evidence.filter((item) => !claimed.has(frozenMediaDedupeKey(item))),
      })),
    };
  }) : [];
  return {
    header: { ...model.header },
    summary: {
      ...model.summary,
      aiSummary: model.summary.aiSummary ? { ...model.summary.aiSummary } : null,
      taskInfo: model.summary.taskInfo ? { ...model.summary.taskInfo } : null,
      stats: { ...model.summary.stats },
    },
    issues,
    functionEffects,
  };
}

function comparisonMatrix(snapshotValue: unknown): PrintMatrix {
  const snapshot = record(snapshotValue);
  const assembly = record(snapshot.assembly);
  const objects = rows(snapshot.objects);
  const allNodes = rows(snapshot.item_nodes);
  const nodesById = new Map(allNodes.map((node) => [text(node.id), node]));
  const printableItemTypes = new Set(['item', 'condition', 'process_node', 'metric', 'issue_group']);
  const sectionTypes = new Set(['section', 'group', 'category']);
  const summaryTypes = new Set(['summary', 'section_summary', 'group_summary']);
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
    rows: allNodes.flatMap<PrintComparisonRow>((node, rowIndex) => {
      const id = text(node.id, String(rowIndex));
      const nodeType = text(node.node_type, 'item');
      if (!printableItemTypes.has(nodeType) && !sectionTypes.has(nodeType) && !summaryTypes.has(nodeType)) return [];
      const nodeLabel = text(node.node_label || node.label, `Item ${rowIndex + 1}`);
      const itemAncestors: string[] = [];
      const itemVisited = new Set<string>();
      let itemParent = nodesById.get(text(node.parent_id));
      while (itemParent && !itemVisited.has(text(itemParent.id))) {
        itemVisited.add(text(itemParent.id));
        const label = text(itemParent.node_label || itemParent.label);
        if (label) itemAncestors.unshift(label);
        itemParent = nodesById.get(text(itemParent.parent_id));
      }
      const group = text(node.group_label || node.parent_label || itemAncestors[0] || (sectionTypes.has(nodeType) ? nodeLabel : ''));
      if (sectionTypes.has(nodeType)) {
        return [{ id, rowKind: 'group' as const, label: nodeLabel, group: nodeLabel, summaryText: '', path: [nodeLabel], cells: {} }];
      }
      const config = record(node.config_json || node.config || node.metadata);
      if (summaryTypes.has(nodeType)) {
        const attachedCellText = cells
          .filter((candidate) => text(candidate.item_node_id) === id)
          .map((candidate) => text(candidate.summary_text || candidate.effect_summary || candidate.value || candidate.text || candidate.conclusion))
          .filter(Boolean)
          .join(' / ');
        const summaryText = text(
          node.summary_text || node.content || node.description || node.value
          || config.summary_text || config.summary || config.content || config.description
          || attachedCellText,
          '-',
        );
        return [{ id, rowKind: 'summary' as const, label: nodeLabel || '本大类小结', group, summaryText, path: [...itemAncestors, nodeLabel].filter(Boolean), cells: {} }];
      }
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
      return [{
        id,
        rowKind: 'item' as const,
        label: nodeLabel,
        group,
        summaryText: '',
        path: [...ancestors, text(node.parent_label || node.group_label), text(node.node_label || node.label, `项目 ${rowIndex + 1}`)].filter(Boolean),
        cells: cellMap,
      }];
    }),
  };
}

function projectMatrix(matrix: FrozenReportViewModel['matrix'] | FrozenReportViewModel['dataMatrix']): PrintMatrix | null {
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
      media: cloneMedia(card.media),
      issues: card.issues.map((item) => ({ ...item })),
      narratives: card.narratives.map((item) => ({ ...item })),
      ...(card.issueSummary ? { issueSummary: { count: card.issueSummary.count, levels: [...card.issueSummary.levels] } } : {}),
    })),
    narratives: layout.narratives.map((item) => ({ ...item })),
  };
}

export function printPageForMatrix(matrix: PrintMatrix | null): PrintReportViewModel['page'] {
  if (!matrix) return { paper: 'A4', orientation: 'portrait' };
  // Frozen comparison/data matrices remain one complete A4 landscape table,
  // rather than falling back to a split card layout or horizontal scrolling.
  return { paper: 'A4', orientation: 'landscape' };
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

export function buildPrintReportViewModel(model: FrozenReportViewModel, issueProjections: PrintIssueProjectionInput[] = []): PrintReportViewModel {
  const frozen = cloneFrozenModelParts(model, issueProjections);
  const primaryMatrix = projectMatrix(model.matrix);
  const secondaryDataMatrix = projectMatrix(model.dataMatrix);
  const matrix = primaryMatrix ?? secondaryDataMatrix;
  const dataMatrix = primaryMatrix ? secondaryDataMatrix : null;
  return {
    sourceReportId: model.header.id,
    snapshotResolution: model.snapshotResolution,
    page: printPageForMatrix(dataMatrix ?? matrix),
    ...frozen,
    matrix,
    dataMatrix,
  };
}

export function printReportMediaOccurrences(model: PrintReportViewModel): PrintMedia[] {
  const issueMedia = model.issues.flatMap((issue) => [
    ...issue.evidence,
    ...(issue.recipe?.evidence ?? []),
    ...(issue.recipe?.steps.flatMap((step) => step.evidence) ?? []),
    ...issue.liveOverlay.evidence,
    ...(issue.liveOverlay.retest.latest ? issue.liveOverlay.retest.latest.evidence : []),
  ]);
  const functionMedia = model.functionEffects.flatMap((effect) => [
    ...effect.evidence,
    ...effect.steps.flatMap((step) => step.evidence),
  ]);
  const matrixMedia = [model.matrix, model.dataMatrix].filter((matrix): matrix is PrintMatrix => Boolean(matrix)).flatMap((matrix) => matrix.kind === 'comparison'
    ? matrix.rows.flatMap((row) => Object.values(row.cells).flatMap((cell) => cell.media))
    : matrix.rows.flatMap((row) => row.media));
  return [...issueMedia, ...functionMedia, ...matrixMedia];
}

export function printReportMedia(model: PrintReportViewModel): PrintMedia[] {
  return dedupeMedia(printReportMediaOccurrences(model));
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMedia(items: PrintMedia[], options: { compact?: boolean } = {}) {
  if (items.length === 0) return '';
  const compact = options.compact === true;
  return `<div class="paper-media${compact ? ' paper-media-compact' : ''}">${items.map((item) => {
    const name = escapeHtml(item.name || item.id);
    if (videoType(item.type, item.url)) {
      const posterUrl = item.posterUrl || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 160 90%22%3E%3Crect width=%22160%22 height=%2290%22 fill=%22%231e293b%22/%3E%3Cpath d=%22M64 25l42 20-42 20z%22 fill=%22white%22/%3E%3C/svg%3E';
      const poster = `<img data-video-poster src="${escapeHtml(posterUrl)}" alt="${name}" />`;
      return `<figure class="paper-video" data-media-id="${escapeHtml(item.id)}">${poster}<div class="video-label">VIDEO</div></figure>`;
    }
    return `<figure data-media-id="${escapeHtml(item.id)}"><img src="${escapeHtml(item.url)}" alt="${name}" /></figure>`;
  }).join('')}</div>`;
}

function renderSummary(model: PrintReportViewModel) {
  const summary = printSummaryContent(model.summary);
  if (!summary) return '';
  const list = (title: string, items: string[], className: string) => items.length
    ? `<div class="summary-group ${className}"><h3>${title}</h3><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>`
    : '';
  return `<section class="report-summary"><div class="summary-heading"><h2>总结</h2>${summary.tag ? `<span class="summary-tag">${escapeHtml(summary.tag)}</span>` : ''}</div>${summary.summary ? `<p class="summary-copy">${escapeHtml(summary.summary)}</p>` : ''}${list('主要优势', summary.strengths, 'summary-strengths')}${list('主要风险', summary.risks, 'summary-risks')}${list('后续建议', summary.suggestions, 'summary-suggestions')}</section>`;
}

function renderDataMatrix(matrix: Extract<PrintMatrix, { kind: 'data_v2' | 'data_v3' }>) {
  const fieldColumns = dataMatrixPrintColumns(matrix.rows);
  const valueColumns = fieldColumns.filter((column) => column.group !== 'evaluation');
  const evaluationColumns = fieldColumns.filter((column) => column.group === 'evaluation');
  const hierarchyLabels = ['一级大类', '二级细项'];
  const hasNarratives = matrix.rows.some((row) => row.narratives.length > 0);
  const valueColumnWidth = (hasNarratives ? 34 : 44) / Math.max(valueColumns.length, 1);
  const colgroup = `<colgroup><col style="width:10%"><col style="width:12%">${valueColumns.map(() => `<col style="width:${valueColumnWidth}%">`).join('')}<col style="width:16%">${evaluationColumns.map(() => `<col style="width:${10 / Math.max(evaluationColumns.length, 1)}%">`).join('')}<col style="width:8%">${hasNarratives ? '<col style="width:10%">' : ''}</colgroup>`;
  const groups = matrix.rows.reduce<Array<{ label: string; rows: typeof matrix.rows }>>((items, row) => {
    const label = row.path[0] || '未分类';
    const current = items[items.length - 1];
    if (current?.label === label) current.rows.push(row);
    else items.push({ label, rows: [row] });
    return items;
  }, []);
  const head = [
    ...hierarchyLabels.map((label) => `<th>${label}</th>`),
    ...valueColumns.map((column) => `<th>${escapeHtml(column.label)}${column.unit ? ` (${escapeHtml(column.unit)})` : ''}</th>`),
    '<th>效果素材</th>',
    ...evaluationColumns.map((column) => `<th>${escapeHtml(column.label)}${column.unit ? ` (${escapeHtml(column.unit)})` : ''}</th>`),
    '<th>问题点</th>',
    ...(hasNarratives ? ['<th>过程/备注</th>'] : []),
  ].join('');
  const body = groups.flatMap((group) => group.rows.map((row, rowIndex) => {
    const values = new Map(row.fields.map((field) => [field.id, field]));
    const cells = valueColumns.map((column) => {
      const field = values.get(column.id);
      const value = field
        ? field.unit && !String(field.value).includes(field.unit) ? `${field.value} ${field.unit}` : String(field.value)
        : '-';
      return `<td>${escapeHtml(value)}</td>`;
    }).join('');
    const evaluations = evaluationColumns.map((column) => {
      const field = values.get(column.id);
      const value = field
        ? field.unit && !String(field.value).includes(field.unit) ? `${field.value} ${field.unit}` : String(field.value)
        : '-';
      return `<td>${escapeHtml(value)}</td>`;
    }).join('');
    const issues = [
      ...(row.issueSummary ? [`问题 ${row.issueSummary.count} 个${row.issueSummary.levels.length ? ` / ${row.issueSummary.levels.join('、')}` : ''}`] : []),
      ...row.issues.map((item) => `${item.text}${item.status ? `（${item.status}）` : ''}`),
    ].filter(Boolean).join('\n');
    const narratives = row.narratives.map((item) => `${item.label}：${item.text}`).join('\n');
    return `<tr data-matrix-row="${escapeHtml(row.id)}">${rowIndex === 0 ? `<th rowspan="${group.rows.length}">${escapeHtml(group.label)}</th>` : ''}<th>${escapeHtml(row.path[1] || '-')}</th>${cells}<td class="matrix-media-cell">${renderMedia(row.media, { compact: true })}</td>${evaluations}<td class="issues">${escapeHtml(issues || '-')}</td>${hasNarratives ? `<td>${escapeHtml(narratives || '-')}</td>` : ''}</tr>`;
  })).join('');
  const narratives = matrix.narratives.map((item) => `<p class="matrix-narrative"><b>${escapeHtml(item.label)}：</b>${escapeHtml(item.text)}</p>`).join('');
  return `<section class="print-matrix-section" data-print-matrix="${matrix.kind}"><h2>${escapeHtml(matrix.title)}</h2>${matrix.summary ? `<p class="muted">${escapeHtml(matrix.summary)}</p>` : ''}<table class="data-matrix-table">${colgroup}<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>${narratives}</section>`;
}

function renderComparison(matrix: Extract<PrintMatrix, { kind: 'comparison' }>) {
  const head = matrix.columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('');
  const colgroup = `<colgroup><col style="width:14%">${matrix.columns.map(() => `<col style="width:${86 / Math.max(matrix.columns.length, 1)}%">`).join('')}</colgroup>`;
  const body = matrix.rows.map((row) => {
    if (row.rowKind === 'group') {
      return `<tr class="comparison-group-row" data-comparison-group="${escapeHtml(row.id)}"><th colspan="${matrix.columns.length + 1}">${escapeHtml(row.label)}</th></tr>`;
    }
    if (row.rowKind === 'summary') {
      return `<tr class="comparison-summary-row" data-comparison-summary="${escapeHtml(row.id)}"><th>${escapeHtml(row.label || '本大类小结')}</th><td colspan="${matrix.columns.length}">${escapeHtml(row.summaryText || '-')}</td></tr>`;
    }
    return `<tr class="comparison-item-row"><th>${escapeHtml(row.label || row.path.join(' / '))}</th>${matrix.columns.map((column) => {
    const cell = row.cells[column.id];
    const notes = cell?.notes.map((item) => `<p><b>过程记录：</b>${escapeHtml(item)}</p>`).join('') || '';
    const problems = cell?.problems.map((item) => `<p class="issues"><b>问题点：</b>${escapeHtml(item)}</p>`).join('') || '';
    return `<td>${escapeHtml(cell?.value || '-')}${cell?.score ? `<p><b>评分：</b>${escapeHtml(cell.score)}</p>` : ''}${notes}${problems}${renderMedia(cell?.media || [], { compact: true })}</td>`;
    }).join('')}</tr>`;
  }).join('');
  return `<section class="print-matrix-section" data-print-matrix="comparison"><h2>${escapeHtml(matrix.title)}</h2><table class="comparison-table">${colgroup}<thead><tr><th>项目</th>${head}</tr></thead><tbody>${body}</tbody></table></section>`;
}

function renderIssues(model: PrintReportViewModel) {
  if (model.issues.length === 0) return '';
  return `<section><h2>问题</h2>${model.issues.map((issue) => {
    const recipe = issue.recipe;
    const parameters = recipe?.parameters
      ? typeof recipe.parameters === 'string' ? recipe.parameters : Object.entries(recipe.parameters).map(([key, value]) => `${key}：${String(value)}`).join('；')
      : '';
    const steps = recipe?.steps.length
      ? `<div><p><b>食谱步骤：</b>${recipe.steps.length}步</p>${recipe.steps.map((step, index) => `<div class="paper-step"><b>步骤 ${escapeHtml(step.stepNumber ?? index + 1)}</b> ${escapeHtml(step.operation)}${step.problemPoints.length ? `<p class="issues"><b>步骤问题点：</b>${escapeHtml(step.problemPoints.join('；'))}</p>` : ''}${renderMedia(step.evidence)}</div>`).join('')}</div>`
      : '';
    const latest = issue.liveOverlay.retest.latest;
    const retest = latest
      ? `<div class="reevaluation"><b>最新整改复测：</b>${escapeHtml(evaluationStatusLabel(latest.result))}${latest.description ? ` ${escapeHtml(latest.description)}` : ''}${latest.createdAt || latest.createdBy ? `<p class="meta">${escapeHtml([latest.createdAt, latest.createdBy].filter(Boolean).join(' · '))}</p>` : ''}${renderMedia(latest.evidence)}</div>`
      : '';
    const projection = issue.rectificationProjection;
    const rectification = projection.plan || projection.responsible || projection.time || projection.retest || issue.liveOverlay.rectification || issue.liveOverlay.evidence.length
      ? `<div class="rectification-projection">${projection.plan || issue.liveOverlay.rectification ? `<p><b>整改方案：</b>${escapeHtml(projection.plan || issue.liveOverlay.rectification)}</p>` : ''}${projection.responsible ? `<p><b>责任人：</b>${escapeHtml(projection.responsible)}</p>` : ''}${projection.time ? `<p><b>整改时间：</b>${escapeHtml(projection.time)}</p>` : ''}${projection.retest ? `<p><b>复测结果：</b>${escapeHtml(projection.retest)}</p>` : ''}${issue.liveOverlay.evidence.length ? `<p><b>整改素材：</b></p>${renderMedia(issue.liveOverlay.evidence)}` : ''}</div>`
      : '';
    const original = recipe
      ? `<p><b>食谱名称：</b>${escapeHtml(recipe.name)}</p>${recipe.formula ? `<p><b>食谱配方：</b>${escapeHtml(recipe.formula)}</p>` : ''}${parameters ? `<p><b>食谱参数：</b>${escapeHtml(parameters)}</p>` : ''}${steps}<p><b>食谱效果评价：</b>${escapeHtml(recipe.evaluation)}（${escapeHtml(evaluationStatusLabel(recipe.evaluationStatus))}）</p>${renderMedia(recipe.evidence)}${renderMedia(issue.evidence)}`
      : issue.sourceKind === 'comparison' || issue.sourceKind === 'matrix'
        ? `<p><b>问题：</b>${escapeHtml(issue.details || issue.title)}</p>${renderMedia(issue.evidence)}`
        : renderMedia(issue.evidence);
    const status = issue.liveOverlay.status ? escapeHtml(({ open: '待整改', rectifying: '整改中', verified_closed: '已整改', waived: '不整改' }[issue.liveOverlay.status] ?? issue.liveOverlay.status)) : '';
    const source = ({ sensory: '五感体验', function: '食谱/功能', comparison: '食谱/功能-对比矩阵', matrix: '数据矩阵' }[issue.sourceKind] ?? issue.sourceType);
    const issueContext = issue.context ?? { object: '', project: '', item: '' };
    const context = issue.sourceKind === 'sensory'
      ? `${issueContext.standardType ? `<p><b>检验标准类型：</b>${escapeHtml(issueContext.standardType)}</p>` : ''}${issueContext.inspectionRange ? `<p><b>检验要求及范围：</b>${escapeHtml(issueContext.inspectionRange)}</p>` : ''}${issueContext.inspectionStandard ? `<p><b>检查标准：</b>${escapeHtml(issueContext.inspectionStandard)}</p>` : ''}${issueContext.nonStandardContent ? `<p><b>描述检查项内容：</b>${escapeHtml(issueContext.nonStandardContent)}</p>` : ''}${issueContext.checkResult ? `<p><b>检查结果：</b>${escapeHtml(issueContext.checkResult)}</p>` : ''}`
      : issue.sourceKind === 'matrix'
        ? `${issueContext.primaryCategory ? `<p><b>一级大类：</b>${escapeHtml(issueContext.primaryCategory)}</p>` : ''}${issueContext.secondaryDetail ? `<p><b>二级细项/三级细项：</b>${escapeHtml(issueContext.secondaryDetail)}</p>` : ''}${issueContext.comparisonDimension ? `<p><b>对比维度：</b>${escapeHtml(issueContext.comparisonDimension)}</p>` : ''}`
        : `${issueContext.object ? `<p><b>对象：</b>${escapeHtml(issueContext.object)}</p>` : ''}${issueContext.project ? `<p><b>项目：</b>${escapeHtml(issueContext.project)}</p>` : ''}${issueContext.item ? `<p><b>细项：</b>${escapeHtml(issueContext.item)}</p>` : ''}`;
    const level = normalizeFrozenIssueLevel(issue.level);
    const metadata = `<div class="issue-meta" data-print-issue-meta><span class="issue-chip issue-level" data-print-issue-level>${escapeHtml(level)}</span><span class="issue-chip issue-source" data-print-issue-source>${escapeHtml(source)}</span><span class="issue-description" data-print-issue-description>${escapeHtml(issue.title)}</span>${status ? `<span class="issue-chip issue-status" data-print-issue-status>${status}</span>` : ''}</div>`;
    return `<article class="paper-row" data-print-issue-row>${metadata}${context}${original}${rectification}${retest}</article>`;
  }).join('')}</section>`;
}

function renderFunctions(model: PrintReportViewModel) {
  if (model.functionEffects.length === 0) return '';
  return `<section><h2>功能效果</h2>${model.functionEffects.map((effect) => {
    const steps = effect.steps.map((step, index) => {
      const historicalProblems = step.problemPoints.length
        ? `<p class="issues"><b>步骤问题点：</b>${escapeHtml(step.problemPoints.join('；'))}</p>`
        : '';
      return `<div class="function-step" data-function-step="${escapeHtml(step.id)}"><div class="function-step-copy"><b>步骤 ${escapeHtml(step.stepNumber ?? index + 1)}</b><span>${escapeHtml(step.operation)}</span>${historicalProblems}</div>${renderMedia(step.evidence, { compact: true })}</div>`;
    }).join('');
    const relatedIssueCount = model.issues.filter((issue) => issue.recipe?.recipeId === effect.recipeId).length;
    const parameters = effect.parameters
      ? typeof effect.parameters === 'string' ? effect.parameters : Object.entries(effect.parameters).map(([key, value]) => `${key}：${String(value)}`).join('；')
      : '';
    const ingredients = [effect.formula, parameters].filter(Boolean).join('；');
    const evaluationStatus = evaluationStatusLabel(effect.evaluationStatus);
    const statusClass = evaluationStatus === '合格' ? 'function-status-qualified' : evaluationStatus === '不合格' ? 'function-status-unqualified' : 'function-status-pending';
    return `<article class="function-card" data-function-effect="${escapeHtml(effect.recipeId)}"><header class="function-header"><h3><span class="function-kicker">食谱</span>${escapeHtml(effect.name)}</h3><div class="function-metrics"><span>步骤数：${effect.steps.length}</span><span class="function-status ${statusClass}">${escapeHtml(evaluationStatus)}</span><span>问题点：${relatedIssueCount}</span></div></header>${ingredients ? `<p class="function-ingredients"><b>食谱/食材：</b>${escapeHtml(ingredients)}</p>` : ''}<div class="function-evaluation"><b>效果评价</b><p>${escapeHtml(effect.evaluation || '—')}</p>${renderMedia(effect.evidence, { compact: true })}</div>${effect.steps.length ? `<div class="function-steps"><h4>食谱步骤：${effect.steps.length}步</h4>${steps}</div>` : ''}</article>`;
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
  const matrix = [model.matrix, model.dataMatrix].filter((item): item is PrintMatrix => Boolean(item)).map((item) => item.kind === 'comparison' ? renderComparison(item) : renderDataMatrix(item)).join('');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8" /><style>
    @page { size: ${model.page.paper} ${model.page.orientation}; margin: 12mm; }
    * { box-sizing: border-box; } body { margin: 0; color: #111827; font-family: -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif; font-size: ${PRINT_TYPOGRAPHY.body}px; line-height: 1.62; }
    h1 { margin: 0 0 4px; font-size: ${PRINT_TYPOGRAPHY.title}px; line-height: 1.3; } h2 { margin: 18px 0 8px; padding-bottom: 4px; border-bottom: 2px solid ${PRINT_GOLDEN_YELLOW}; color: ${PRINT_GOLDEN_YELLOW_INK}; font-size: ${PRINT_TYPOGRAPHY.sectionTitle}px; line-height: 1.4; break-after: avoid; } h3 { margin: 0 0 5px; font-size: ${PRINT_TYPOGRAPHY.subsectionTitle}px; line-height: 1.45; break-after: avoid; }
    section { break-inside: auto; } .print-matrix-section { break-before:page; } .cover,.paper-row { border: 1px solid #d1d5db; border-radius: 6px; padding: 9px; margin: 7px 0; background: #fff; break-inside: avoid; } .muted,.meta { color: #6b7280; }
    .paper-fields,.task-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 5px; } .paper-field { border: 1px solid #e5e7eb; border-radius: 4px; padding: 5px; } .paper-field span,.paper-field b { display: block; overflow-wrap: anywhere; } .task-grid p { margin: 0; } .task-grid span { color: #6b7280; } .overview-grid { display: grid; grid-template-columns: repeat(5,minmax(0,1fr)); gap: 5px; } .overview-grid div { border: 1px solid #d1d5db; padding: 6px; text-align: center; } .overview-grid b,.overview-grid span { display:block; } .overview-grid span { color:#6b7280; }
    .paper-media { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; } figure { width: 72px; margin: 0; border: 1px solid #d1d5db; border-radius: 4px; padding: 3px; break-inside: avoid; } figure img { width: 64px; height: 48px; object-fit: cover; display: block; background: #e5e7eb; } .paper-video { position: relative; } .video-label { position: absolute; left: 3px; top: 35px; width: 64px; padding: 1px 0; background: rgba(17,24,39,.72); color: #fff; text-align: center; font-weight: 700; }
    .paper-media-compact { display:flex; max-width:100%; overflow:hidden; flex-flow:row wrap; align-items:flex-start; gap:3px; margin-top:3px; } .paper-media-compact figure { width:38px; padding:2px; } .paper-media-compact figure img { width:32px; height:24px; } .paper-media-compact .video-label { left:2px; top:17px; width:32px; font-size:5px; } .matrix-media-cell { overflow:hidden; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; } thead { display: table-header-group; } th,td { border: 1px solid #d1d5db; padding: 5px; vertical-align: top; overflow-wrap: anywhere; } th { background: ${PRINT_GOLDEN_YELLOW_SOFT}; color: ${PRINT_GOLDEN_YELLOW_INK}; } .issues { color: #991b1b; } .issue-meta { display:flex; align-items:center; flex-wrap:wrap; gap:5px; margin-bottom:8px; padding-bottom:7px; border-bottom:1px solid #e5e7eb; } .issue-chip { display:inline-block; border:1px solid #d1d5db; border-radius:999px; padding:1px 6px; color:#374151; font-size:10px; line-height:1.35; } .issue-source { border-color:#d69700; background:#fff8dc; color:#7a5100; } .issue-description { flex:1 1 15ch; min-width:0; font-size:12px; font-weight:700; color:#111827; overflow-wrap:anywhere; } .issue-status { margin-left:auto; background:#f8fafc; }
    .data-matrix-table { max-width:100%; font-size:7px; } .data-matrix-table tr { break-inside:avoid; } .data-matrix-table th,.data-matrix-table td { padding:2px; } .comparison-group-row th { background:#f1f5f9; color:#111827; text-align:left; font-size:12px; } .comparison-summary-row th,.comparison-summary-row td { background:#fffbeb; font-weight:700; }
    .function-card { border:1px solid #cbd5e1; border-radius:6px; margin:8px 0; padding:10px; break-inside:avoid; } .function-header { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; padding-bottom:6px; border-bottom:1px solid #e2e8f0; } .function-header h3 { display:flex; align-items:center; gap:6px; } .function-kicker { color:${PRINT_GOLDEN_YELLOW_INK}; font-size:10px; } .function-metrics { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:4px; } .function-metrics span { border:1px solid #d1d5db; border-radius:999px; padding:1px 6px; color:#475569; font-size:9px; white-space:nowrap; } .function-metrics .function-status-qualified { border-color:#86efac; background:#f0fdf4; color:#15803d; } .function-metrics .function-status-unqualified { border-color:#fecaca; background:#fef2f2; color:#b91c1c; } .function-metrics .function-status-pending { border-color:#cbd5e1; background:#f8fafc; color:#475569; } .function-ingredients { margin:7px 0; } .function-evaluation { border-top:2px solid ${PRINT_GOLDEN_YELLOW}; padding-top:6px; } .function-evaluation>p { margin:3px 0; } .function-steps h4 { margin:8px 0 4px; font-size:11px; } .function-step { display:flex; justify-content:space-between; align-items:flex-start; gap:8px; padding:5px 0; border-top:1px solid #e5e7eb; } .function-step-copy { flex:1 1 auto; min-width:0; } .function-step-copy b,.function-step-copy span { display:block; } .function-step .paper-media { flex:0 0 auto; margin-top:0; max-width:48%; justify-content:flex-end; }
    .summary-heading { display:flex; align-items:center; gap:8px; border-bottom:2px solid ${PRINT_GOLDEN_YELLOW}; } .summary-heading h2 { flex:1; margin-bottom:0; border:0; } .summary-tag { border:1px solid #d1d5db; border-radius:999px; padding:1px 7px; color:#475569; font-size:${PRINT_TYPOGRAPHY.meta}px; } .summary-copy { margin:8px 0; white-space:pre-wrap; } .summary-group { margin-top:8px; padding-left:9px; border-left:3px solid #cbd5e1; } .summary-group h3 { margin-bottom:3px; } .summary-group ul { margin:0; padding-left:18px; } .summary-strengths { border-left-color:#10b981; } .summary-risks { border-left-color:#f59e0b; } .summary-suggestions { border-left-color:${PRINT_GOLDEN_YELLOW}; }
  </style></head><body data-print-report-id="${escapeHtml(model.sourceReportId)}">
    <header class="cover"><h1>${escapeHtml(model.header.title)}</h1></header>
    ${renderProductInfo(model)}${renderSummary(model)}
    ${renderIssues(model)}${renderFunctions(model)}${matrix}
  </body></html>`;
}
