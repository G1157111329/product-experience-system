/**
 * V3 dynamic matrix → report projection adapter.
 *
 * PRD V3.1.2.4 §88 (ADR-06): report generation freezes the V3 projection into
 * report_snapshots.snapshot_json.matrix_projection. This adapter converts the
 * V3MatrixProjection into a report-friendly frozen shape (no live DB refs).
 *
 * The report detail renderer reads this frozen shape; it does NOT import the
 * live projection module (§88 no-drift principle).
 */
import type { V3MatrixProjection, V3HierarchyNode, V3Column, V3CellValue } from './v3-types';
import { cellKey } from './v3-types';
import { formatMatrixNumber } from './number-format';

// ---------------------------------------------------------------------------
// Frozen report shape
// ---------------------------------------------------------------------------

export interface ReportV3HierarchyNode {
  id: string;
  label: string;
  level: 1 | 2 | 3;
  children: ReportV3HierarchyNode[];
}

export interface ReportV3Column {
  id: string;
  zone: string;
  label: string;
  dataType: string;
  unitText: string | null;
  displayOrder: number;
  /** Frozen display precision for numeric and formula values. */
  decimalPlaces: number | null;
}

export interface ReportV3Row {
  id: string;
  level1Label: string;
  level2Label: string | null;
  level3Label: string | null;
  visibleRowIndex: number;
  cells: Record<string, string>; // columnId → display string
}

export interface ReportV3NarrativeBlock {
  blockType: string;
  content: string;
  showInReport: boolean;
}

export interface ReportV3IssuePoint {
  id: string;
  /** Immutable issue-point identity used to join the canonical mutable issue. */
  sourceCellId: string;
  leafRowId: string;
  columnId: string;
  leafRowIndex: number;
  issueText: string;
  linkedIssueId: string | null;
  status: string;
  materialIds: string[];
  createdAt?: string | null;
}

export interface ReportV3CellMedia {
  materialId: string;
  materialType: string;
  fileName: string | null;
  /** Immutable storage key; renderers re-sign this instead of trusting frozen URLs. */
  filePath: string | null;
  fileUrl: string | null;
  /** Stable video preview descriptor retained with the frozen source cell. */
  thumbnailUrl: string | null;
  durationSec: number | null;
}

export interface ReportV3MatrixProjection {
  /** Discriminator for report readers (Wave 6). */
  matrixProjectionVersion: 'v3';
  matrixId: string;
  matrixName: string;
  frozenAt: string;
  hierarchy: ReportV3HierarchyNode[];
  columns: ReportV3Column[];
  rows: ReportV3Row[];
  /** Media keyed by `${leafRowId}:${columnId}` — frozen URLs at report time. */
  cellMedia: Record<string, ReportV3CellMedia[]>;
  narratives: ReportV3NarrativeBlock[];
  issuePoints: ReportV3IssuePoint[];
  summary: {
    totalRows: number;
    totalColumns: number;
    filledCells: number;
  };
}

/** True when a frozen snapshot / content payload is V3 excel-like (not V2 groups). */
export function isFrozenV3MatrixProjection(value: unknown): value is ReportV3MatrixProjection {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.matrixProjectionVersion === 'v3') return true;
  return (
    typeof v.matrixId === 'string' &&
    Array.isArray(v.columns) &&
    Array.isArray(v.rows) &&
    !Array.isArray(v.groups)
  );
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

function freezeHierarchy(nodes: V3HierarchyNode[]): ReportV3HierarchyNode[] {
  return nodes.map((n) => ({
    id: n.id,
    label: n.nodeLabel,
    level: n.level,
    children: freezeHierarchy(n.children),
  }));
}

export function formatFrozenMatrixNumber(value: unknown, decimalPlaces: number | null | undefined): string {
  return formatMatrixNumber(value, decimalPlaces);
}

function cellToDisplay(cell: V3CellValue | undefined, column: V3Column): string {
  if (!cell || cell.valueState === 'empty') return '';
  if (column.dataType === 'number' || column.dataType === 'percentage' || column.dataType === 'formula') {
    const value = cell.valueNumber ?? cell.valuePercentage ?? cell.valueText ?? cell.displayText;
    return formatFrozenMatrixNumber(value, column.decimalPlaces);
  }
  if (cell.displayText) return cell.displayText;
  if (column.dataType === 'duration') {
    if (cell.valueDurationSeconds === null) return '';
    const mins = Math.floor(cell.valueDurationSeconds / 60);
    const secs = cell.valueDurationSeconds % 60;
    return `${mins}'${String(secs).padStart(2, '0')}"`;
  }
  return cell.valueText ?? '';
}

/**
 * Convert a live V3MatrixProjection into a frozen report-safe shape.
 * Call this during report generation and store the result in the snapshot.
 */
export function freezeV3MatrixForReport(
  projection: V3MatrixProjection,
): ReportV3MatrixProjection {
  // Build node label lookup for row ancestry.
  const nodeLabels = new Map<string, string>();
  const indexLabels = (nodes: V3HierarchyNode[]) => {
    for (const n of nodes) {
      nodeLabels.set(n.id, n.nodeLabel);
      indexLabels(n.children);
    }
  };
  indexLabels(projection.hierarchy);

  const rows: ReportV3Row[] = projection.rows.map((leaf) => {
    const cells: Record<string, string> = {};
    for (const col of projection.columns) {
      const cell = projection.cells[cellKey(leaf.id, col.id)];
      cells[col.id] = cellToDisplay(cell, col);
    }
    return {
      id: leaf.id,
      level1Label: nodeLabels.get(leaf.level1NodeId) ?? '',
      level2Label: leaf.level2NodeId ? nodeLabels.get(leaf.level2NodeId) ?? null : null,
      level3Label: leaf.level3NodeId ? nodeLabels.get(leaf.level3NodeId) ?? null : null,
      visibleRowIndex: leaf.visibleRowIndex,
      cells,
    };
  });

  const narratives: ReportV3NarrativeBlock[] = projection.narratives
    .filter((n) => n.showInReport && n.content)
    .map((n) => ({
      blockType: n.blockType,
      content: n.content ?? '',
      showInReport: n.showInReport,
    }));

  const issuePoints: ReportV3IssuePoint[] = projection.issuePoints.map((ip) => {
    const leafRow = projection.rows.find((r) => r.id === ip.leafRowId);
    return {
      id: ip.id,
      sourceCellId: ip.id,
      leafRowId: ip.leafRowId,
      columnId: ip.columnId,
      leafRowIndex: leafRow?.visibleRowIndex ?? -1,
      issueText: ip.issueText,
      linkedIssueId: ip.linkedIssueId,
      status: ip.status,
      createdAt: ip.createdAt ?? null,
      materialIds: Object.entries(projection.cellMedia ?? {})
        .filter(([key]) => key.startsWith(`${ip.leafRowId}:`))
        .flatMap(([, items]) => items.map((item) => item.materialId)),
    };
  });

  const cellMedia: Record<string, ReportV3CellMedia[]> = {};
  for (const [key, items] of Object.entries(projection.cellMedia ?? {})) {
    cellMedia[key] = items.map((m) => ({
      materialId: m.materialId,
      materialType: m.materialType,
      fileName: m.fileName,
      filePath: m.filePath,
      fileUrl: m.fileUrl,
      thumbnailUrl: m.thumbnailUrl,
      durationSec: m.durationSec,
    }));
  }

  return {
    matrixProjectionVersion: 'v3',
    matrixId: projection.matrix.id,
    matrixName: projection.matrix.name,
    frozenAt: new Date().toISOString(),
    hierarchy: freezeHierarchy(projection.hierarchy),
    columns: projection.columns.map((c) => ({
      id: c.id,
      zone: c.columnZone,
      label: c.columnLabel,
      dataType: c.dataType,
      unitText: c.unitText,
      displayOrder: c.displayOrder,
      decimalPlaces: c.decimalPlaces,
    })),
    rows,
    cellMedia,
    narratives,
    issuePoints,
    summary: {
      totalRows: projection.summary.activeLeafRows,
      totalColumns: projection.columns.length,
      filledCells: projection.summary.filledCells,
    },
  };
}
