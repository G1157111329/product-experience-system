import { existsSync, readFileSync } from 'fs';
import path from 'path';

const root = process.cwd();

function read(relativePath: string) {
  return readFileSync(path.join(root, relativePath), 'utf8');
}

function assertIncludes(file: string, expected: string) {
  const content = read(file);
  if (!content.includes(expected)) {
    throw new Error(`${file} is missing: ${expected}`);
  }
}

function assertTableIncludes(file: string, tableName: string, expected: string) {
  const content = read(file);
  const match = content.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${tableName} \\([\\s\\S]*?\\n\\);`));
  if (!match?.[0].includes(expected)) {
    throw new Error(`${file}.${tableName} is missing: ${expected}`);
  }
}

function assertExists(relativePath: string) {
  if (!existsSync(path.join(root, relativePath))) {
    throw new Error(`${relativePath} does not exist`);
  }
}

for (const file of [
  'database-schema.sql',
  'scripts/v2.3-migration.sql',
]) {
  assertTableIncludes(file, 'comparison_assemblies', 'source_task_ids JSONB');
  assertTableIncludes(file, 'comparison_assemblies', 'source_report_ids JSONB');
}

assertIncludes('src/storage/database/shared/schema.ts', 'sourceTaskIds: jsonb("source_task_ids")');
assertIncludes('src/storage/database/shared/schema.ts', 'sourceReportIds: jsonb("source_report_ids")');
assertIncludes('src/storage/database/pg-query.ts', 'comparison_assemblies: comparisonAssemblies');
assertIncludes('src/storage/database/pg-query.ts', 'comparison_matrix_cells: comparisonMatrixCells');

assertExists('src/app/api/comparison-matrix/route.ts');
assertExists('src/app/api/comparison-cells/[id]/route.ts');
assertExists('src/app/api/comparison-cells/[id]/media/route.ts');
assertIncludes('src/app/api/comparison-cells/[id]/route.ts', 'validateScoreValue');
assertIncludes('src/app/api/comparison-cells/[id]/media/route.ts', 'MAX_INLINE_MEDIA = 5');
assertIncludes('src/app/api/comparison-cells/[id]/media/route.ts', 'cell_primary');
assertIncludes('src/app/api/comparison-cells/[id]/media/route.ts', 'cell_secondary');
assertIncludes('src/app/api/comparison-cells/[id]/media/route.ts', 'appendix');
assertIncludes('src/app/api/materials/upload/route.ts', 'comparison_cell_id');
assertIncludes('src/app/api/materials/route.ts', 'comparison_cell_id');
assertExists('src/app/(main)/tasks/[id]/components/comparison-workspace.tsx');
assertIncludes('src/lib/server/comparison-assembly.ts', 'findAssemblyForTask');
assertIncludes('src/app/api/tasks/[id]/comparison/init/route.ts', 'findAssemblyForTask');
assertIncludes('src/app/api/tasks/route.ts', 'createAssemblyFromComparisonTask');
assertIncludes('src/app/api/tasks/route.ts', 'comparison_assembly_id');
assertIncludes('src/app/(main)/tasks/[id]/components/comparison-workspace.tsx', 'autoInitializeAssembly');
assertIncludes('src/app/(main)/tasks/[id]/components/comparison-workspace.tsx', 'syncMatrixCells');
assertIncludes('src/app/(main)/tasks/[id]/components/comparison-workspace.tsx', 'params_text');
assertIncludes('src/app/(main)/tasks/[id]/components/comparison-workspace.tsx', 'process_notes_text');
assertIncludes('src/app/(main)/tasks/[id]/components/comparison-workspace.tsx', 'problem_points_text');
assertIncludes('src/app/(main)/tasks/[id]/components/comparison-workspace.tsx', 'cellSaveStatus');
assertIncludes('src/app/(main)/tasks/[id]/components/comparison-workspace.tsx', '/media');
assertIncludes('src/app/(main)/tasks/[id]/components/comparison-workspace.tsx', 'inline_media');
assertIncludes('src/app/(main)/tasks/[id]/components/comparison-workspace.tsx', 'appendix_media');
assertIncludes('src/app/(main)/tasks/[id]/components/comparison-workspace.tsx', 'comparisonCellId');
assertIncludes('src/components/material-picker.tsx', 'comparisonCellId');
assertIncludes('src/lib/server/comparison-assembly.ts', 'buildComparisonReportSnapshot');
assertIncludes('src/lib/server/comparison-assembly.ts', 'inline_media');
assertIncludes('src/lib/server/comparison-assembly.ts', 'appendix_media');
assertExists('src/app/api/report-snapshots/route.ts');
assertIncludes('src/app/api/report-snapshots/route.ts', 'comparison_report');
assertIncludes('src/app/api/report-snapshots/route.ts', 'report_snapshots');
assertIncludes('src/app/api/report-snapshots/route.ts', 'snapshot_json');
assertExists('src/app/api/comparison-cells/[id]/ai/route.ts');
assertExists('src/app/api/comparison-ai-results/[id]/route.ts');
assertIncludes('src/app/api/comparison-cells/[id]/ai/route.ts', 'comparison_cell_ai');
assertIncludes('src/app/api/comparison-ai-results/[id]/route.ts', 'confirmed');
assertIncludes('src/app/api/comparison-ai-results/[id]/route.ts', 'rejected');
assertIncludes('src/app/(main)/tasks/[id]/components/comparison-workspace.tsx', 'generateCellAi');
assertIncludes('src/app/(main)/tasks/[id]/components/comparison-workspace.tsx', 'confirmCellAiResult');
assertIncludes('src/app/(main)/tasks/[id]/page.tsx', "activeTab === 'comparison'");
assertIncludes('src/app/(main)/tasks/[id]/components/report-authoring-shell.tsx', "key: 'comparison'");
assertIncludes('src/app/(main)/tasks/page.tsx', "task_mode: 'single'");
assertIncludes('src/app/(main)/tasks/page.tsx', "task_mode: 'comparison'");
assertIncludes('src/app/(main)/tasks/page.tsx', 'comparison_layout_type');
assertIncludes('src/app/(main)/tasks/page.tsx', 'tab=comparison');
assertIncludes('src/app/(main)/tasks/page.tsx', 'creating ||');
assertExists('src/lib/server/report-snapshots.ts');
assertIncludes('src/lib/server/report-snapshots.ts', 'attachLatestSnapshotForComparisonReport');
assertIncludes('src/app/api/reports/[id]/route.ts', 'attachLatestSnapshotForComparisonReport');
assertIncludes('src/app/api/reports/share/route.ts', 'attachLatestSnapshotForComparisonReport');
assertExists('src/components/reports/comparison-report-view.tsx');
assertIncludes('src/components/reports/comparison-report-view.tsx', 'ComparisonReportView');
assertIncludes('src/app/(main)/reports/[id]/page.tsx', 'ComparisonReportView');
assertIncludes('src/app/(main)/reports/[id]/page.tsx', "report_type === 'comparison_report'");
assertIncludes('src/app/reports/share/[token]/page.tsx', 'ComparisonReportView');
assertIncludes('src/app/reports/share/[token]/page.tsx', "report_type === 'comparison_report'");
assertExists('src/lib/server/comparison-pdf.ts');
assertIncludes('src/lib/server/comparison-pdf.ts', 'comparison_image_matrix_a3_landscape');
assertIncludes('src/lib/server/comparison-pdf.ts', 'buildComparisonPdfPreflight');
assertIncludes('src/lib/server/comparison-pdf.ts', 'renderComparisonPdfHtml');
assertExists('src/app/api/reports/[id]/pdf/route.ts');
assertIncludes('src/app/api/reports/[id]/pdf/route.ts', "import('playwright')");
assertIncludes('src/app/api/reports/[id]/pdf/route.ts', 'preflight');
assertIncludes('src/app/api/reports/[id]/pdf/route.ts', 'application/pdf');
assertIncludes('src/app/api/reports/[id]/pdf/route.ts', 'share_token');
assertIncludes('src/app/(main)/reports/[id]/page.tsx', `/api/reports/${'${id}'}/pdf`);
assertIncludes('src/app/reports/share/[token]/page.tsx', `/api/reports/${'${report.id}'}/pdf?share_token=${'${token}'}`);
assertIncludes('Dockerfile', 'mcr.microsoft.com/playwright:v1.60.0-noble');
assertIncludes('Dockerfile', 'PLAYWRIGHT_BROWSERS_PATH=/ms-playwright');
assertIncludes('package.json', '"playwright": "1.60.0"');
assertIncludes('src/app/(main)/tasks/[id]/components/comparison-workspace.tsx', 'INITIAL_VISIBLE_NODE_LIMIT');
assertIncludes('src/app/(main)/tasks/[id]/components/comparison-workspace.tsx', '横向滑动录入');
assertIncludes('src/app/(main)/tasks/[id]/components/comparison-workspace.tsx', 'matrixTableMinWidth');
assertIncludes('src/app/(main)/tasks/[id]/components/comparison-workspace.tsx', '加载更多项目');
assertIncludes('src/app/(main)/tasks/[id]/components/comparison-workspace.tsx', '图片矩阵型');
assertIncludes('src/app/(main)/tasks/[id]/components/comparison-workspace.tsx', '指标表格型');
assertIncludes('src/app/(main)/tasks/[id]/components/comparison-workspace.tsx', 'changeLayoutType');
assertIncludes('src/app/(main)/tasks/[id]/components/comparison-workspace.tsx', 'layout_type: normalizeLayoutType(initialLayoutType)');
assertIncludes('src/app/(main)/tasks/[id]/page.tsx', 'initialLayoutType={task.comparison_layout_type}');

console.log('V2.3 contract check passed');
