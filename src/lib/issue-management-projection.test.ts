import assert from 'node:assert/strict';
import { buildIssueManagementRows } from './issue-management-projection';

const taskId = 'task-noodle';
const reportId = 'report-noodle';
const records = Array.from({ length: 19 }, (_, index) => ({
  id: `record-${index}`,
  check_item: `五感问题 ${index + 1}`,
  evaluation_result: '不合格',
  problem_description: `五感描述 ${index + 1}`,
}));
const cells = Array.from({ length: 15 }, (_, index) => ({
  id: `cell-${index}`,
  object_id: 'object-a',
  item_node_id: `item-${index}`,
  effect_summary: `对比结论 ${index + 1}`,
  problem_points: [`问题 ${index + 1}`, `补充问题 ${index + 1}`],
}));
const liveIssues = [
  ...records.flatMap((record) => [
    { id: `archived-${record.id}`, task_id: taskId, record_id: record.id, title: `旧${record.check_item}`, source_type: 'record_fail', source_report_id: 'old-report', status: 'open', created_at: '2026-07-14T00:00:00.000Z' },
    { id: `live-${record.id}`, task_id: taskId, record_id: record.id, title: record.check_item, source_type: 'record_fail', source_report_id: null, status: 'open', created_at: '2026-07-16T00:00:00.000Z' },
  ]),
  ...cells.flatMap((cell) => [
    { id: `comparison-a-${cell.id}`, task_id: taskId, source_cell_id: cell.id, title: `[对比]${cell.id} 问题 1`, source_type: 'recipe_problem', source_report_id: 'old-report', status: 'open', created_at: '2026-07-14T00:00:00.000Z' },
    { id: `comparison-b-${cell.id}`, task_id: taskId, source_cell_id: cell.id, title: `[对比]${cell.id} 问题 2`, source_type: 'recipe_problem', source_report_id: 'old-report', status: 'open', created_at: '2026-07-14T00:01:00.000Z' },
  ]),
];

const rows = buildIssueManagementRows({
  issues: liveIssues,
  reports: [{
    id: 'report-noodle-old',
    task_id: taskId,
    title: '全自动面条机ODM报告（旧版）',
    report_type: 'comparison_report',
    status: 'archived',
    product_model: 'PF03P3',
    created_at: new Date('2026-07-14T12:00:00.000Z'),
    content: { records },
    snapshot_id: 'snapshot-noodle-old',
  }, {
    id: reportId,
    task_id: taskId,
    title: '全自动面条机ODM报告',
    report_type: 'comparison_report',
    status: '已完成',
    product_model: 'PF03P3',
    created_at: new Date('2026-07-16T12:00:00.000Z'),
    content: { records },
    snapshot_id: 'snapshot-noodle',
  }],
  snapshots: [{
    id: 'snapshot-noodle-old',
    snapshot_json: { report_content: { records } },
  }, {
    id: 'snapshot-noodle',
    snapshot_json: {
      report_content: { records },
      objects: [{ id: 'object-a', object_name: '刀头模具' }],
      item_nodes: cells.map((cell, index) => ({ id: cell.item_node_id, node_label: `细项 ${index + 1}` })),
      cells,
    },
  }],
});

assert.equal(rows.length, 34, '19 条五感记录 + 15 个有问题的对比单元格必须计为 34 个问题点');
assert.equal(rows.filter((row) => row.source_kind === 'sensory').length, 19, '五感体验按检查记录计数');
assert.equal(rows.filter((row) => row.source_kind === 'comparison').length, 15, '对比矩阵按对象与细项的单元格计数，不按问题文本行数计数');
assert.equal(rows.every((row) => row.source_report_id === reportId), true, '冻结报告投影必须替代旧报告残留行');

console.log('issue management projection contract passed');
