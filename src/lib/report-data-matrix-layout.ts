export type ReportDataMatrixFieldGroup = 'inputs' | 'calculated' | 'evaluation';

export interface ReportDataMatrixReadField {
  id: string;
  label: string;
  value: string | number;
  group: ReportDataMatrixFieldGroup;
  unit?: string;
}

export interface ReportDataMatrixReadMedia {
  id: string;
  name: string;
  type: string;
  url: string;
}

export interface ReportDataMatrixReadIssue {
  id: string;
  text: string;
  status?: string;
}

export interface ReportDataMatrixReadNarrative {
  id: string;
  label: string;
  text: string;
}

export interface ReportDataMatrixReadCard {
  id: string;
  path: string[];
  fields: ReportDataMatrixReadField[];
  media: ReportDataMatrixReadMedia[];
  issues: ReportDataMatrixReadIssue[];
  narratives: ReportDataMatrixReadNarrative[];
}

export interface ReportDataMatrixReadLayout {
  title: string;
  summary?: string;
  cards: ReportDataMatrixReadCard[];
  narratives: ReportDataMatrixReadNarrative[];
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function nonEmptyValue(value: unknown): value is string | number {
  return (typeof value === 'number' && Number.isFinite(value))
    || (typeof value === 'string' && value.trim() !== '' && value.trim() !== '-');
}

function metricDisplay(value: unknown): string | number | undefined {
  const metric = record(value);
  for (const candidate of [metric.display, metric.value, metric.numericValue, metric.text, metric.textValue, metric.enumValue]) {
    if (nonEmptyValue(candidate)) return typeof candidate === 'string' ? candidate.trim() : candidate;
  }
  if (typeof metric.durationMs === 'number' && Number.isFinite(metric.durationMs)) {
    return `${Math.round(metric.durationMs / 1000)}s`;
  }
  return undefined;
}

function fieldGroup(value: UnknownRecord): ReportDataMatrixFieldGroup {
  const zone = text(value.zone || value.columnZone || value.column_group || value.columnGroup).toLowerCase();
  if (zone === 'calculated' || zone === 'calculation_dimension') return 'calculated';
  if (zone === 'evaluation') return 'evaluation';
  const semanticLabel = text(value.displayName || value.label || value.dimensionKey || value.key).toLowerCase();
  if (semanticLabel.includes('评价') || semanticLabel.includes('evaluation')) return 'evaluation';
  return 'inputs';
}

function mediaItem(value: unknown, fallbackId: string): ReportDataMatrixReadMedia | null {
  const item = record(value);
  const url = text(item.url || item.fileUrl || item.file_url || item.filePath || item.file_path);
  if (!url) return null;
  return {
    id: text(item.id || item.materialId || item.material_id) || fallbackId,
    name: text(item.name || item.fileName || item.file_name) || '素材',
    type: text(item.type || item.materialType || item.material_type) || 'image',
    url,
  };
}

function isV3Projection(source: UnknownRecord): boolean {
  return source.matrixProjectionVersion === 'v3'
    || source.projectionVersion === 'v3'
    || (Array.isArray(source.columns) && Array.isArray(source.rows) && !Array.isArray(source.groups));
}

function v2Layout(source: UnknownRecord): ReportDataMatrixReadLayout {
  const schema = record(source.schema);
  const dimensions = array(schema.dimensions).map(record);
  const cards = array(source.groups).flatMap((groupValue, groupIndex) => {
    const group = record(groupValue);
    const groupLabel = text(group.label) || `分组 ${groupIndex + 1}`;
    return array(group.rows).map((rowValue, rowIndex): ReportDataMatrixReadCard => {
      const row = record(rowValue);
      const rowId = text(row.id) || `${groupIndex}:${rowIndex}`;
      const metrics = record(row.metrics);
      const slots = record(row.slots);
      const result = record(slots.result);
      const process = record(slots.process);
      const issueSlot = record(slots.issues);
      const evidence = record(row.evidence);
      const fields = dimensions.flatMap((dimension, dimensionIndex): ReportDataMatrixReadField[] => {
        const id = text(dimension.dimensionKey || dimension.key) || String(dimensionIndex);
        const value = metricDisplay(metrics[id]);
        if (value === undefined) return [];
        return [{
          id,
          label: text(dimension.displayName || dimension.label || dimension.dimensionKey || dimension.key) || id,
          value,
          group: fieldGroup(dimension),
          unit: text(dimension.unitCode || dimension.unitText) || undefined,
        }];
      });
      const conclusion = text(result.summary || result.status);
      if (conclusion) {
        fields.push({ id: `${rowId}:result`, label: '效果结论', value: conclusion, group: 'evaluation' });
      }
      const issues = array(issueSlot.severitySummary).flatMap((issue, issueIndex): ReportDataMatrixReadIssue[] => {
        const issueText = text(issue);
        return issueText ? [{ id: `${rowId}:issue:${issueIndex}`, text: issueText }] : [];
      });
      const media = array(evidence.media).flatMap((item, itemIndex) => {
        const mapped = mediaItem(item, `${rowId}:media:${itemIndex}`);
        return mapped ? [mapped] : [];
      });
      const narratives: ReportDataMatrixReadNarrative[] = [];
      const conditionSummary = text(group.conditionSummary || group.description);
      if (conditionSummary) narratives.push({ id: `${rowId}:condition`, label: '分组说明', text: conditionSummary });
      const processNote = text(process.note);
      if (processNote) narratives.push({ id: `${rowId}:process`, label: '过程记录', text: processNote });
      return {
        id: rowId,
        path: [groupLabel, text(record(row.subject).label) || rowId].filter(Boolean),
        fields,
        media,
        issues,
        narratives,
      };
    });
  });

  const viewport = record(source.viewport);
  const totalRows = typeof viewport.totalRows === 'number' ? viewport.totalRows : cards.length;
  const totalGroups = typeof viewport.totalGroups === 'number' ? viewport.totalGroups : array(source.groups).length;
  return {
    title: text(schema.name) || '数据矩阵',
    summary: `${totalGroups} 个分组 / ${totalRows} 行`,
    cards,
    narratives: [],
  };
}

function v3Layout(source: UnknownRecord): ReportDataMatrixReadLayout {
  const columns = array(source.columns).map(record).sort(
    (left, right) => Number(left.displayOrder ?? 0) - Number(right.displayOrder ?? 0),
  );
  const cellMedia = record(source.cellMedia);
  const issuePoints = array(source.issuePoints).map(record);
  const cards = array(source.rows).map((rowValue, rowIndex): ReportDataMatrixReadCard => {
    const row = record(rowValue);
    const rowId = text(row.id) || String(rowIndex);
    const cells = record(row.cells);
    const fields = columns.flatMap((column, columnIndex): ReportDataMatrixReadField[] => {
      const zone = text(column.zone || column.columnZone);
      if (['hierarchy', 'primary_media', 'effect_media', 'issue_point'].includes(zone)) return [];
      const id = text(column.id) || String(columnIndex);
      const value = cells[id];
      if (!nonEmptyValue(value)) return [];
      return [{
        id,
        label: text(column.label || column.columnLabel) || id,
        value: typeof value === 'string' ? value.trim() : value,
        group: fieldGroup(column),
        unit: text(column.unitText) || undefined,
      }];
    });
    const media = Object.entries(cellMedia).flatMap(([key, items]) => {
      if (!key.startsWith(`${rowId}:`)) return [];
      return array(items).flatMap((item, itemIndex) => {
        const mapped = mediaItem(item, `${key}:${itemIndex}`);
        return mapped ? [mapped] : [];
      });
    });
    const issues = issuePoints.flatMap((issue, issueIndex): ReportDataMatrixReadIssue[] => {
      if (text(issue.leafRowId) !== rowId) return [];
      const issueText = text(issue.issueText);
      return issueText ? [{
        id: text(issue.id) || `${rowId}:issue:${issueIndex}`,
        text: issueText,
        status: text(issue.status) || undefined,
      }] : [];
    });
    return {
      id: rowId,
      path: [text(row.level1Label), text(row.level2Label), text(row.level3Label)].filter(Boolean),
      fields,
      media,
      issues,
      narratives: [],
    };
  });
  const narratives = array(source.narratives).flatMap((narrativeValue, index): ReportDataMatrixReadNarrative[] => {
    const narrative = record(narrativeValue);
    if (narrative.showInReport === false) return [];
    const narrativeText = text(narrative.content);
    if (!narrativeText) return [];
    const blockType = text(narrative.blockType);
    return [{
      id: `${blockType || 'narrative'}:${index}`,
      label: blockType === 'summary' ? '小结' : '备注',
      text: narrativeText,
    }];
  });
  const summary = record(source.summary);
  return {
    title: text(source.matrixName) || '数据矩阵',
    summary: `${Number(summary.totalRows ?? cards.length)} 行 / ${Number(summary.totalColumns ?? columns.length)} 列`,
    cards,
    narratives,
  };
}

export function dataMatrixReadLayout(projection: unknown): ReportDataMatrixReadLayout {
  const source = record(projection);
  return isV3Projection(source) ? v3Layout(source) : v2Layout(source);
}

export function dataMatrixReadCards(projection: unknown): ReportDataMatrixReadCard[] {
  return dataMatrixReadLayout(projection).cards;
}
