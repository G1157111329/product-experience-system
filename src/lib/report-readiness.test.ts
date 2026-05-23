import assert from 'node:assert/strict';
import { buildReportReadiness } from './report-readiness';

const readiness = buildReportReadiness({
  task: {
    task_name: '清洁效果体验',
    product_category: '厨电',
    product_model: 'X100',
    project_type: '自研',
  },
  records: [
    {
      id: 'r1',
      check_item: '杯盖清洁',
      evaluation_result: '不合格',
      problem_description: '',
      materials: [],
    },
    {
      id: 'r2',
      check_item: '机身噪音',
      evaluation_result: '合格',
      problem_description: null,
      materials: [],
    },
  ],
  recipes: [
    {
      id: 'recipe-1',
      name: '高温洗',
      effect_description: '',
      effect_score: null,
      effect_problem_point: '[{"text":"高温洗清洁力度不足","material_ids":["m1"]}]',
      effect_materials: [{ id: 'm1', material_type: 'image', file_name: 'a.jpg', file_url: '/a.jpg', file_size: 10 }],
      recipe_steps: [
        {
          id: 's1',
          step_number: 1,
          operation: '启动高温洗',
          problem_point: '杯盖残留',
          materials: [],
        },
      ],
    },
  ],
  aiSummary: null,
});

assert.equal(readiness.score, 46);
assert.equal(readiness.stats.records, 2);
assert.equal(readiness.stats.recipes, 1);
assert.equal(readiness.stats.media, 1);
assert.equal(readiness.items.filter((item) => item.severity === 'critical' && item.status === 'missing').length, 3);
assert.ok(readiness.items.some((item) => item.id === 'record-problem-description'));
assert.ok(readiness.items.some((item) => item.id === 'record-evidence'));
assert.ok(readiness.items.some((item) => item.id === 'ai-summary'));
assert.ok(readiness.items.some((item) => item.id === 'recipe-effect-description'));
assert.ok(readiness.items.some((item) => item.id === 'recipe-step-evidence'));
assert.ok(readiness.items.some((item) => item.id === 'raw-json-problem-points'));

const complete = buildReportReadiness({
  task: {
    task_name: '完整报告输入',
    product_category: '厨电',
    product_model: 'X200',
    project_type: '自研',
  },
  records: [
    {
      id: 'r1',
      check_item: '杯盖清洁',
      evaluation_result: '不合格',
      problem_description: '杯盖仍有明显残留',
      materials: [{ id: 'm2', material_type: 'image', file_name: 'b.jpg', file_url: '/b.jpg', file_size: 10 }],
    },
  ],
  recipes: [
    {
      id: 'recipe-1',
      name: '高温洗',
      effect_description: '整体清洁效果稳定',
      effect_score: '8.5',
      effect_problem_point: '杯盖边缘仍需优化',
      effect_materials: [{ id: 'm1', material_type: 'image', file_name: 'a.jpg', file_url: '/a.jpg', file_size: 10 }],
      recipe_steps: [
        {
          id: 's1',
          step_number: 1,
          operation: '启动高温洗',
          problem_point: '杯盖残留',
          materials: [{ id: 'm3', material_type: 'image', file_name: 'c.jpg', file_url: '/c.jpg', file_size: 10 }],
        },
      ],
    },
  ],
  aiSummary: {
    tag: '稳定',
    satisfaction_score: 8,
    summary: '整体表现稳定',
    strengths: [],
    risks: [],
    historical_position: '',
    suggestions: [],
  },
});

assert.equal(complete.score, 100);
assert.equal(complete.items.filter((item) => item.status === 'missing').length, 0);

console.log('report-readiness tests passed');
