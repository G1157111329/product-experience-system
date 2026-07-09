/**
 * V3 Dynamic Data Matrix — projection types.
 *
 * PRD V3.1.2.4 §8. The V3 model is an Excel-like user-designed matrix:
 *   - 3-level hierarchy (大类 → 二级细项 → 三级细项) with merged row headers
 *   - column zones (A~Q regions): hierarchy / primary_media / comparison_category /
 *     detail_dimension / calculation_dimension / effect_media / evaluation / issue_point
 *   - typed cell values (EAV), cell styles (safe tokens), formula defs,
 *     narrative blocks (summary + notes), issue points
 *
 * V2 tables (matrix_groups/matrix_rows/matrix_field_values) are cold-retained.
 */

// ---------------------------------------------------------------------------
// Hierarchy
// ---------------------------------------------------------------------------

export type HierarchyNodeType = 'level_1' | 'level_2' | 'level_3';

export interface V3HierarchyNode {
  id: string;
  matrixId: string;
  parentId: string | null;
  level: 1 | 2 | 3;
  nodeLabel: string;
  nodeType: HierarchyNodeType;
  sortOrder: number;
  rowspanCache: number | null;
  archivedAt: string | null;
  /** Nested children (level_2 under level_1, level_3 under level_2). */
  children: V3HierarchyNode[];
  /** Leaf rows that descend from this node (only populated on the deepest active level). */
  leafRowCount: number;
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

export type ColumnZone =
  | 'hierarchy'
  | 'primary_media'
  | 'comparison_category'
  | 'detail_dimension'
  | 'calculation_dimension'
  | 'effect_media'
  | 'evaluation'
  | 'issue_point';

export type ColumnDataType =
  | 'text'
  | 'long_text'
  | 'number'
  | 'duration'
  | 'percentage'
  | 'temperature'
  | 'volume'
  | 'image_slot'
  | 'media_slot'
  | 'formula'
  | 'issue_point';

export interface V3Column {
  id: string;
  matrixId: string;
  columnZone: ColumnZone;
  zoneRole: string;
  columnLabel: string;
  dataType: ColumnDataType;
  unitText: string | null;
  displayOrder: number;
  desktopWidthPx: number;
  minWidthPx: number | null;
  maxWidthPx: number | null;
  isPinned: boolean;
  isRequired: boolean;
  showInReport: boolean;
  maxMediaCount: number | null;
  resultFormat: string | null;
  decimalPlaces: number | null;
  archivedAt: string | null;
}

// ---------------------------------------------------------------------------
// Leaf rows + cells
// ---------------------------------------------------------------------------

export type CellValueState =
  | 'empty'
  | 'filled'
  | 'invalid'
  | 'calculation_pending'
  | 'calculation_failed'
  | 'archived';

export interface V3LeafRow {
  id: string;
  matrixId: string;
  level1NodeId: string;
  level2NodeId: string | null;
  level3NodeId: string | null;
  visibleRowIndex: number;
  groupRowIndex: number;
  status: 'active' | 'archived';
  archivedAt: string | null;
}

export interface V3CellValue {
  id: string;
  leafRowId: string;
  columnId: string;
  valueText: string | null;
  valueNumber: string | null;
  valueDurationSeconds: number | null;
  valuePercentage: string | null;
  displayText: string | null;
  valueState: CellValueState;
  errorCode: string | null;
  version: number;
}

export type CellStyleTargetType = 'column_header' | 'cell' | 'narrative_block';

export interface V3CellStyle {
  id: string;
  matrixId: string;
  targetType: CellStyleTargetType;
  targetId: string;
  fontColorToken: string | null;
  fontSizeToken: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | null;
  bold: boolean;
  italic: boolean;
}

// ---------------------------------------------------------------------------
// Narrative blocks + issue points
// ---------------------------------------------------------------------------

export type NarrativeBlockType =
  | 'summary'
  | 'note'
  | 'formula_note'
  | 'method_note'
  | 'limitation_note';

export interface V3NarrativeBlock {
  id: string;
  matrixId: string;
  blockType: NarrativeBlockType;
  scope: 'matrix' | 'level_1_group';
  scopeNodeId: string | null;
  content: string | null;
  aiSuggestionId: string | null;
  showInReport: boolean;
  sortOrder: number;
}

export interface V3IssuePoint {
  id: string;
  matrixId: string;
  leafRowId: string;
  columnId: string;
  issueText: string;
  linkedIssueId: string | null;
  status: 'text' | 'converted';
}

// ---------------------------------------------------------------------------
// Formula (Wave 3 will fill AST; V3 projection carries display metadata only)
// ---------------------------------------------------------------------------

export interface V3FormulaDefinition {
  id: string;
  matrixId: string;
  columnId: string;
  expressionDisplay: string;
  referenceMode: string;
  applyScope: 'matrix' | 'level_1_group' | 'group';
  resultFormat: string;
  decimalPlaces: number;
  status: 'active' | 'invalid' | 'archived';
}

// ---------------------------------------------------------------------------
// Top-level projection
// ---------------------------------------------------------------------------

export interface V3ViewDefinition {
  id: string;
  matrixId: string;
  versionNo: number;
  maxHierarchyLevel: number;
  leftFrozenColumnCount: number;
  formulaMode: string;
  styleMode: string;
  status: string;
  designHash: string | null;
}

export interface V3MatrixSummary {
  totalLeafRows: number;
  activeLeafRows: number;
  totalColumns: number;
  totalCells: number;
  filledCells: number;
  totalIssues: number;
  hasSummary: boolean;
  hasNotes: boolean;
}

export interface V3MatrixProjection {
  matrix: {
    id: string;
    name: string;
    status: string;
    currentViewDefinitionId: string | null;
  };
  viewDefinition: V3ViewDefinition | null;
  /** Nested hierarchy tree (level_1 roots → level_2 → level_3). */
  hierarchy: V3HierarchyNode[];
  /** Columns ordered by display_order. */
  columns: V3Column[];
  /** Flat leaf rows ordered by visible_row_index. */
  rows: V3LeafRow[];
  /** Cells keyed by `${leafRowId}:${columnId}`. */
  cells: Record<string, V3CellValue>;
  /** Styles keyed by `${targetType}:${targetId}`. */
  styles: Record<string, V3CellStyle>;
  narratives: V3NarrativeBlock[];
  issuePoints: V3IssuePoint[];
  formulas: V3FormulaDefinition[];
  summary: V3MatrixSummary;
}

/**
 * Build the cell key used in the projection's `cells` map.
 */
export function cellKey(leafRowId: string, columnId: string): string {
  return `${leafRowId}:${columnId}`;
}

/**
 * Build the style key used in the projection's `styles` map.
 */
export function styleKey(targetType: CellStyleTargetType, targetId: string): string {
  return `${targetType}:${targetId}`;
}
