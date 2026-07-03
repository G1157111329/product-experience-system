/**
 * Golden data-matrix schema for the 原汁机 (juicer) aperture comparison — the
 * canonical reference used by acceptance tests AT-11 through AT-18.
 *
 * The schema describes a 2-axis layout:
 *   - group axis `scenario`: the 食材/功能 being compared (e.g. 苹果-慢速).
 *   - row axis `subject`: three levels — 产品 (which juicer), 口径规则 (the
 *     aperture spec under test), 可选细项 (optional sub-items).
 *
 * Dimensions split into `observed` (operator-entered measurements) and
 * `calculated` (DSL-derived ratios). The three calculated dimensions are
 * produced by row-scoped formulas referencing observed weights; the seed
 * script compiles each formula with the shared formula engine and stores the
 * resulting AST + dependency list alongside the DSL source.
 */

import type { MatrixSchemaJson } from './types';

export const JUICER_APERTURE_SCHEMA: MatrixSchemaJson = {
  schemaKey: 'juicer_aperture_comparison',
  version: 1,
  title: '原汁机口径 × 食材性能对比',
  axes: [
    { axisCode: 'scenario', axisRole: 'group', levels: [{ levelNo: 1, label: '食材/功能' }] },
    {
      axisCode: 'subject',
      axisRole: 'row',
      levels: [
        { levelNo: 1, label: '产品' },
        { levelNo: 2, label: '口径规则' },
        { levelNo: 3, label: '可选细项', required: false },
      ],
    },
  ],
  dimensions: [
    { dimensionKey: 'duration', displayName: '耗时', columnGroup: 'observed', valueKind: 'duration', unitCode: 'mmss', required: true, sortOrder: 0, displayFormat: { durationFormat: 'mmss' } },
    { dimensionKey: 'ingredient_weight', displayName: '食物重量', columnGroup: 'observed', valueKind: 'number', unitCode: 'g', required: true, sortOrder: 1, displayFormat: { decimals: 1 } },
    { dimensionKey: 'juice_weight', displayName: '出汁重量', columnGroup: 'observed', valueKind: 'number', unitCode: 'g', required: true, sortOrder: 2, displayFormat: { decimals: 1 } },
    { dimensionKey: 'pulp_weight', displayName: '果渣重量', columnGroup: 'observed', valueKind: 'number', unitCode: 'g', required: false, sortOrder: 3, displayFormat: { decimals: 1 } },
    { dimensionKey: 'filtered_juice_weight', displayName: '果汁过筛后重量', columnGroup: 'observed', valueKind: 'number', unitCode: 'g', required: false, sortOrder: 4, displayFormat: { decimals: 1 } },
    { dimensionKey: 'pulp_in_juice_weight', displayName: '果汁内渣重量', columnGroup: 'observed', valueKind: 'number', unitCode: 'g', required: false, sortOrder: 5, displayFormat: { decimals: 1 } },
    { dimensionKey: 'juice_yield', displayName: '出汁率含渣', columnGroup: 'calculated', valueKind: 'number', unitCode: '%', required: false, editable: false, sortOrder: 6, displayFormat: { decimals: 4 } },
    { dimensionKey: 'pure_juice_yield', displayName: '纯汁率', columnGroup: 'calculated', valueKind: 'number', unitCode: '%', required: false, editable: false, sortOrder: 7, displayFormat: { decimals: 4 } },
    { dimensionKey: 'pulp_ratio', displayName: '果汁含渣率', columnGroup: 'calculated', valueKind: 'number', unitCode: '%', required: false, editable: false, sortOrder: 8, displayFormat: { decimals: 4 } },
  ],
  formulas: [
    { outputDimensionKey: 'juice_yield', formulaDsl: 'ROUND(SELF("juice_weight") / SELF("ingredient_weight"), 4)', scope: 'row', formulaVersion: 'v1' },
    { outputDimensionKey: 'pure_juice_yield', formulaDsl: 'ROUND(SELF("filtered_juice_weight") / SELF("juice_weight"), 4)', scope: 'row', formulaVersion: 'v1' },
    { outputDimensionKey: 'pulp_ratio', formulaDsl: 'ROUND(SELF("pulp_in_juice_weight") / SELF("juice_weight"), 4)', scope: 'row', formulaVersion: 'v1' },
  ],
};
