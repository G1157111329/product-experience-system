import type { ReportDetailModel, ReportDetailSectionBlock } from './report-detail';

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isBlankMatrixText(value: string | undefined) {
  const normalized = (value || '').trim();
  return normalized === '' || normalized === '-' || normalized === '—' || normalized === '暂无' || normalized === '无';
}

function isMatrixCellEmpty(cell: NonNullable<NonNullable<ReportDetailSectionBlock['matrix']>['rows'][number]['cells'][string]> | undefined) {
  if (!cell) return true;
  return isBlankMatrixText(cell.value)
    && isBlankMatrixText(cell.conclusion)
    && (cell.processNotes || []).length === 0
    && isBlankMatrixText(cell.score)
    && isBlankMatrixText(cell.anomaly)
    && isBlankMatrixText(cell.conclusionTag)
    && cell.problems.length === 0
    && cell.media.length === 0;
}

function renderMatrixText(cell: { value: string; conclusion: string; processNotes?: string[] }) {
  const process = (cell.processNotes || []).length
    ? `<p><strong>过程记录：</strong>${escapeHtml((cell.processNotes || []).join('；'))}</p>`
    : '';
  const conclusion = !isBlankMatrixText(cell.conclusion)
    ? `<p><strong>效果结论：</strong>${escapeHtml(cell.conclusion)}</p>`
    : '';
  const value = cell.value && cell.value !== cell.conclusion
    ? `<p>${escapeHtml(cell.value)}</p>`
    : '';
  return `${process}${conclusion || `<b>${escapeHtml(cell.value)}</b>`}${conclusion ? value : ''}`;
}

function renderBlock(block: ReportDetailSectionBlock) {
  const title = `<h3>${escapeHtml(block.title)}</h3>`;
  const description = block.description ? `<p class="description">${escapeHtml(block.description)}</p>` : '';
  if (block.type === 'facts' || block.type === 'list') {
    const rows = (block.items || []).map((item) => `
      <li class="${escapeHtml(item.status || 'default')}">
        <b>${escapeHtml(item.label)}</b>
        <span>${escapeHtml(item.value)}</span>
        ${item.note ? `<em>${escapeHtml(item.note)}</em>` : ''}
        ${renderMedia(item.media || [])}
      </li>
    `).join('');
    return `<div class="block ${escapeHtml(block.type)}">${title}${description}<ul>${rows || `<li class="empty">${escapeHtml(block.emptyMessage || 'No content')}</li>`}</ul></div>`;
  }
  if (block.type === 'table') {
    const columns = block.columns || [];
    const head = columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('');
    const body = (block.rows || []).map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(row[column] || '-')}</td>`).join('')}</tr>`).join('');
    return `<div class="block table">${title}${description}<table><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${Math.max(1, columns.length)}">${escapeHtml(block.emptyMessage || 'No rows')}</td></tr>`}</tbody></table></div>`;
  }
  if (block.type === 'matrix') {
    const matrix = block.matrix;
    if (!matrix || matrix.rows.length === 0) {
      return `<div class="block matrix">${title}${description}<p class="empty">${escapeHtml(block.emptyMessage || matrix?.emptyMessage || 'No matrix data')}</p></div>`;
    }
    const head = [
      '<th class="matrix-item">维度/项目</th>',
      ...matrix.objects.map((object) => `<th>${escapeHtml(object.label)}<small>${escapeHtml([object.subtitle, object.objectType].filter(Boolean).join(' / '))}</small></th>`),
    ].join('');
    let lastGroup = '';
    const body = matrix.rows.map((row) => {
      const group = row.group || '';
      const groupRow = group && group !== lastGroup
        ? `<tr class="matrix-group"><td colspan="${matrix.objects.length + 1}">${escapeHtml(group)}</td></tr>`
        : '';
      lastGroup = group;
      if (row.rowKind === 'summary') {
        const summary = row.summaryText || row.rowConclusion || '本大类暂无小结。';
        return `
      ${groupRow}
      <tr class="matrix-summary">
        <td class="matrix-item"><b>${escapeHtml(row.label || '本大类小结')}</b></td>
        <td colspan="${Math.max(1, matrix.objects.length)}">${escapeHtml(summary)}</td>
      </tr>
    `;
      }
      return `
      ${groupRow}
      <tr>
        <td class="matrix-item"><b>${escapeHtml(row.label)}</b></td>
        ${matrix.objects.map((object) => {
          const cell = row.cells[object.id];
          if (isMatrixCellEmpty(cell)) return '<td class="matrix-empty">-</td>';
          if (!cell) return '<td class="matrix-empty">-</td>';
          const media = renderMedia(cell.media);
          const problems = cell.problems.length ? `<p class="cell-risk">${escapeHtml(cell.problems.join('；'))}</p>` : '';
          const anomaly = cell.anomaly ? `<p class="cell-warning">${escapeHtml(cell.anomaly)}</p>` : '';
          return `<td class="${escapeHtml(cell.conclusionTag || 'default')}">
            ${renderMatrixText(cell)}
            ${cell.score ? `<em>Score: ${escapeHtml(cell.score)}</em>` : ''}
            ${problems}
            ${anomaly}
            ${cell.aiStatus ? `<em>AI: ${escapeHtml(cell.aiStatus)}</em>` : ''}
            ${media}
          </td>`;
        }).join('')}
      </tr>
    `;
    }).join('');
    return `<div class="block matrix">${title}${description}<table class="matrix-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }
  if (block.type === 'media') {
    return `<div class="block media-block">${title}${description}${renderMedia(block.media || []) || `<p class="empty">${escapeHtml(block.emptyMessage || 'No media')}</p>`}</div>`;
  }
  return `<div class="block summary">${title}${description || `<p class="empty">${escapeHtml(block.emptyMessage || 'No summary')}</p>`}</div>`;
}

function renderMedia(media: NonNullable<ReportDetailSectionBlock['media']>) {
  if (media.length === 0) return '';
  return `<div class="media-grid">${media.map((item) => {
    const src = escapeHtml(item.url);
    const name = escapeHtml(item.name || item.id);
    if (item.type === 'video') {
      return `<div class="video-box"><video src="${src}" muted preload="metadata"></video><span>VIDEO</span><small>${name}</small></div>`;
    }
    return `<figure><img src="${src}" alt="${name}" /><figcaption>${name}</figcaption></figure>`;
  }).join('')}</div>`;
}

export function renderReportDetailPdfHtml(model: ReportDetailModel, generatedAt = new Date()) {
  const profile = model.printDelivery.profile;
  const pageSize = `${profile.paper} ${profile.orientation}`;
  const sections = model.sections.map((section) => `
    <section>
      <h2>${escapeHtml(section.title)}</h2>
      ${section.summary ? `<p class="section-summary">${escapeHtml(section.summary)}</p>` : ''}
      ${section.blocks.map(renderBlock).join('')}
    </section>
  `).join('');
  const preflight = [
    ...model.printDelivery.preflight.errors,
    ...model.printDelivery.preflight.warnings,
  ].map((issue) => `<li class="${escapeHtml(issue.severity)}"><b>${escapeHtml(issue.code)}</b>${escapeHtml(issue.message)}<em>${escapeHtml(issue.action)}</em></li>`).join('');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: ${pageSize}; margin: 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111827; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif; font-size: 12px; line-height: 1.55; }
    h1 { margin: 0 0 6px; font-size: 24px; letter-spacing: 0; }
    h2 { margin: 22px 0 10px; padding-bottom: 5px; border-bottom: 2px solid #0f766e; color: #0f766e; font-size: 17px; break-after: avoid; }
    h3 { margin: 0 0 6px; font-size: 13px; color: #111827; break-after: avoid; }
    section { break-inside: auto; }
    .cover { border: 1px solid #d1d5db; border-radius: 6px; padding: 12px; margin-bottom: 12px; background: #f9fafb; }
    .meta { color: #6b7280; margin-bottom: 8px; }
    .preflight { border: 1px solid #d1d5db; border-radius: 6px; padding: 8px; margin: 12px 0; background: #fff; }
    .preflight ul, .block ul { margin: 0; padding: 0; list-style: none; }
    .preflight li, .block li { border: 1px solid #e5e7eb; border-radius: 4px; padding: 6px; margin-bottom: 5px; break-inside: avoid; }
    .preflight .error { border-color: #fecaca; background: #fef2f2; color: #991b1b; }
    .preflight .warning, .warning { border-color: #fde68a; background: #fffbeb; color: #92400e; }
    .risk { border-color: #fecaca !important; background: #fef2f2 !important; color: #991b1b; }
    .positive { border-color: #bbf7d0 !important; background: #f0fdf4 !important; color: #166534; }
    .block { border: 1px solid #d1d5db; border-radius: 6px; padding: 8px; margin: 8px 0; background: #fff; break-inside: avoid; }
    .description, .section-summary, .empty { color: #6b7280; margin: 4px 0; white-space: pre-wrap; }
    .block li b { display: block; margin-bottom: 2px; }
    .block li em, .preflight li em { display: block; margin-top: 2px; color: #6b7280; font-style: normal; font-size: 10px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; break-inside: auto; }
    thead { display: table-header-group; }
    th, td { border: 1px solid #d1d5db; padding: 5px; vertical-align: top; word-break: break-word; }
    th { background: #f0fdfa; color: #0f766e; }
    .matrix { break-inside: auto; }
    .matrix-table { table-layout: fixed; font-size: 9px; }
    .matrix-table th, .matrix-table td { padding: 4px; }
    .matrix-table small { display: block; color: #6b7280; font-weight: 400; margin-top: 2px; }
    .matrix-item { width: 44mm; }
    .matrix-table p { margin: 2px 0; }
    .matrix-table em { display: block; color: #6b7280; font-style: normal; font-size: 8px; }
    .matrix-table .risk { background: #fef2f2; color: #991b1b; }
    .matrix-summary td { background: #fffbeb; color: #78350f; white-space: pre-wrap; }
    .cell-risk { color: #991b1b; }
    .cell-warning { color: #92400e; }
    .media-grid { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
    figure, .video-box { width: 86px; margin: 0; border: 1px solid #d1d5db; border-radius: 4px; padding: 3px; background: #f9fafb; break-inside: avoid; }
    img, video { width: 78px; height: 78px; object-fit: cover; display: block; background: #f3f4f6; }
    figcaption, .video-box small { display: block; margin-top: 2px; color: #6b7280; font-size: 8px; overflow-wrap: anywhere; }
    .video-box { position: relative; }
    .video-box span { position: absolute; left: 5px; top: 58px; color: #fff; background: rgba(0,0,0,.55); font-size: 8px; padding: 1px 3px; border-radius: 2px; }
  </style>
</head>
<body>
  <div class="cover">
    <h1>${escapeHtml(model.header.title)}</h1>
    <div class="meta">版式：${escapeHtml(profile.paper)} ${profile.orientation === 'landscape' ? '横向' : '纵向'} / 生成时间：${escapeHtml(generatedAt.toISOString())}</div>
    <div>${escapeHtml(model.conclusion.keyConclusion)}</div>
  </div>
  <div class="preflight" data-testid="pdf-preflight-summary">
    <b>打印预检：${model.printDelivery.preflight.ok ? '可导出' : '需处理'}</b>
    <ul>${preflight || '<li class="positive">暂无影响导出的预检问题。</li>'}</ul>
  </div>
  ${sections}
</body>
</html>`;
}
