import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getMatrixZoneAnchors,
  getPinnedHierarchyOffsets,
} from './matrix-zone-layout';

type TestColumn = Parameters<typeof getMatrixZoneAnchors>[0][number];

function column(overrides: Partial<TestColumn> & Pick<TestColumn, 'id' | 'columnZone'>): TestColumn {
  return {
    id: overrides.id,
    columnZone: overrides.columnZone,
    zoneRole: overrides.zoneRole ?? '',
    displayOrder: overrides.displayOrder ?? 0,
    desktopWidthPx: overrides.desktopWidthPx ?? 120,
  };
}

test('matrix zone anchors follow the reading order and target the first column in each zone', () => {
  const anchors = getMatrixZoneAnchors([
    column({ id: 'evaluation', columnZone: 'evaluation', displayOrder: 70 }),
    column({ id: 'detail', columnZone: 'detail_dimension', displayOrder: 40 }),
    column({ id: 'comparison', columnZone: 'comparison_category', displayOrder: 30 }),
    column({ id: 'effect-media', columnZone: 'effect_media', displayOrder: 60 }),
    column({ id: 'hierarchy-b', columnZone: 'hierarchy', displayOrder: 20, zoneRole: 'B' }),
    column({ id: 'hierarchy-a', columnZone: 'hierarchy', displayOrder: 10, zoneRole: 'A' }),
    column({ id: 'issue', columnZone: 'issue_point', displayOrder: 80 }),
    column({ id: 'primary-media', columnZone: 'primary_media', displayOrder: 25 }),
    column({ id: 'calculation', columnZone: 'calculation_dimension', displayOrder: 50 }),
  ]);

  assert.deepEqual(anchors, [
    { zone: 'hierarchy', label: '层级', columnId: 'hierarchy-a', scrollLeft: 0 },
    { zone: 'primary_media', label: '主素材', columnId: 'primary-media', scrollLeft: 0 },
    { zone: 'comparison_input', label: '对比/输入', columnId: 'comparison', scrollLeft: 120 },
    { zone: 'calculation_dimension', label: '计算', columnId: 'calculation', scrollLeft: 360 },
    { zone: 'effect_media', label: '效果素材', columnId: 'effect-media', scrollLeft: 480 },
    { zone: 'evaluation', label: '效果评价', columnId: 'evaluation', scrollLeft: 600 },
    { zone: 'issue_point', label: '问题点', columnId: 'issue', scrollLeft: 720 },
  ]);
});

test('pinned hierarchy offsets use displayed widths and exclude non-hierarchy columns', () => {
  const offsets = getPinnedHierarchyOffsets([
    column({ id: 'level-1', columnZone: 'hierarchy', zoneRole: 'A', desktopWidthPx: 120, displayOrder: 10 }),
    column({ id: 'level-2', columnZone: 'hierarchy', zoneRole: 'B', desktopWidthPx: 160, displayOrder: 20 }),
    column({ id: 'media', columnZone: 'primary_media', desktopWidthPx: 180, displayOrder: 30 }),
    column({ id: 'level-3', columnZone: 'hierarchy', zoneRole: 'C', desktopWidthPx: 140, displayOrder: 40 }),
  ]);

  assert.deepEqual(offsets, {
    'level-1': 0,
    'level-2': 120,
    'level-3': 340,
  });
});
