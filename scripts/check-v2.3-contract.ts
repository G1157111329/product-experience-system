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

function assertNotIncludes(file: string, unexpected: string) {
  const content = read(file);
  if (content.includes(unexpected)) {
    throw new Error(`${file} still contains obsolete contract token: ${unexpected}`);
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

const comparisonWorkspace = 'src/app/(main)/tasks/[id]/components/comparison-workspace.tsx';

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

assertExists(comparisonWorkspace);
assertIncludes('src/lib/server/comparison-assembly.ts', 'findAssemblyForTask');
assertIncludes('src/app/api/tasks/[id]/comparison/init/route.ts', 'findAssemblyForTask');
assertIncludes('src/app/api/tasks/route.ts', 'createAssemblyFromComparisonTask');
assertIncludes('src/app/api/tasks/route.ts', 'comparison_assembly_id');

assertIncludes(comparisonWorkspace, 'initializeAssembly');
assertIncludes(comparisonWorkspace, 'completeMatrixCells');
assertIncludes(comparisonWorkspace, 'renderCellEditor');
assertIncludes(comparisonWorkspace, '<MaterialPicker');
assertIncludes(comparisonWorkspace, '<Textarea');
assertIncludes(comparisonWorkspace, 'effect_summary');
assertIncludes(comparisonWorkspace, 'process_notes_text');
assertIncludes(comparisonWorkspace, 'problem_points_text');
assertIncludes(comparisonWorkspace, 'manual_score');
assertIncludes(comparisonWorkspace, 'conclusion_tag');
assertIncludes(comparisonWorkspace, 'saveCell');
assertIncludes(comparisonWorkspace, 'syncCellMedia');
assertIncludes(comparisonWorkspace, 'dropMaterialToCell');
assertIncludes(comparisonWorkspace, 'comparisonCellId');
assertIncludes(comparisonWorkspace, '/media');
assertIncludes(comparisonWorkspace, 'inline_media');
assertIncludes(comparisonWorkspace, 'appendix_media');
assertIncludes(comparisonWorkspace, 'OBJECT_COLUMN_WIDTH');
assertIncludes(comparisonWorkspace, 'LEFT_COLUMN_WIDTH');
assertIncludes(comparisonWorkspace, 'tableMinWidth');
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

assertIncludes('src/app/(main)/tasks/[id]/page.tsx', "activeTab === 'comparison'");
assertIncludes('src/app/(main)/tasks/[id]/components/report-authoring-shell.tsx', "key: 'comparison'");
assertIncludes('src/app/(main)/tasks/page.tsx', 'creating ||');
assertIncludes('src/app/(main)/tasks/[id]/page.tsx', 'initialLayoutType={task.comparison_layout_type}');

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

assertNotIncludes(comparisonWorkspace, 'autoInitializeAssembly');
assertNotIncludes(comparisonWorkspace, 'cellSaveStatus');
assertNotIncludes(comparisonWorkspace, 'changeLayoutType');
assertNotIncludes(comparisonWorkspace, 'DialogContent');

console.log('Comparison report asset contract check passed');
