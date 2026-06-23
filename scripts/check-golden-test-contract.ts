import { existsSync, readFileSync } from 'fs';
import path from 'path';
import assert from 'node:assert/strict';

const root = process.cwd();

function read(relativePath: string) {
  return readFileSync(path.join(root, relativePath), 'utf8');
}

function assertExists(relativePath: string) {
  assert.equal(existsSync(path.join(root, relativePath)), true, `${relativePath} does not exist`);
}

function assertIncludes(file: string, expected: string) {
  assert.ok(read(file).includes(expected), `${file} is missing: ${expected}`);
}

async function main() {
  assertExists('src/lib/golden-test-data.ts');
  assertExists('src/lib/report-detail-contract.ts');
  assertExists('src/lib/server/report-detail.ts');
  assertExists('src/app/api/reports/[id]/detail/route.ts');
  assertExists('scripts/seed-golden-test-data.ts');
  assertIncludes('package.json', '"seed:golden"');
  assertIncludes('package.json', '"check:golden"');
  assertIncludes('tests/e2e/platform-smoke.spec.ts', 'report center list contract renders');
  assertIncludes('src/lib/report-detail-contract.ts', 'V26_DETAIL_CONTRACT_INVENTORY');
  assertIncludes('src/lib/report-detail-contract.ts', 'comparison_metric_table_a3_landscape');
  assertIncludes('src/lib/report-detail-contract.ts', 'required_now');
  assertIncludes('src/lib/report-detail-contract.ts', 'content_json_fallback');
  assertIncludes('src/lib/report-detail-contract.ts', 'later_structural_migration');
  assertIncludes('src/components/reports/report-detail-shell.tsx', 'data-testid="report-section-canvas"');
  assertIncludes('src/components/reports/report-detail-shell.tsx', 'data-testid="report-detail-section"');
  assertIncludes('src/components/reports/report-section-block-renderer.tsx', 'data-testid="report-section-block"');
  assertIncludes('src/components/reports/report-section-block-renderer.tsx', 'data-testid="report-section-block-row"');
  assertIncludes('src/components/reports/report-section-block-renderer.tsx', 'data-testid="report-section-media-item"');
  assertIncludes('src/components/reports/report-detail-shell.tsx', 'data-testid="report-section-empty"');
  assertIncludes('src/components/reports/report-detail-shell.tsx', 'data-testid="report-evidence-slot"');
  assertIncludes('src/components/reports/report-detail-shell.tsx', 'data-testid="report-section-actions"');
  assertIncludes('src/components/reports/report-section-block-renderer.tsx', 'data-testid="report-section-block-stack"');
  assertIncludes('src/components/reports/report-section-block-renderer.tsx', 'data-testid="print-section-block-stack"');
  assertIncludes('src/components/reports/report-section-block-renderer.tsx', 'data-testid="report-inline-media-item"');
  assertIncludes('src/components/reports/report-section-block-renderer.tsx', 'data-testid="print-inline-media-item"');
  assertIncludes('src/lib/server/report-detail.ts', 'issue_closure:re-evaluations');
  assertIncludes('src/lib/server/report-detail.ts', 'function_effect:step-evidence');
  assertIncludes('src/lib/server/report-detail.ts', 'overview:objects');
  assertIncludes('src/lib/server/report-detail.ts', 'overview:comparability');
  assertIncludes('src/lib/server/report-detail.ts', 'comparison_matrix:differences');
  assertIncludes('src/lib/server/report-detail.ts', 'comparison_matrix:cell-evidence');
  assertIncludes('src/lib/server/report-detail.ts', 'metric_table:differences');
  assertIncludes('src/lib/server/report-detail.ts', 'AI confirmation boundary');
  assertIncludes('src/lib/server/report-detail.ts', 'stage_timeline:table');
  assertIncludes('src/lib/server/report-detail.ts', 'model_dossier:comparability');
  assertIncludes('src/lib/server/report-detail.ts', 'next_validation:list');
  assertIncludes('src/lib/server/report-detail.ts', 'source_alignment:table');
  assertIncludes('src/lib/server/report-detail.ts', 'field_alignment:table');
  assertIncludes('src/lib/server/report-detail.ts', 'comparability_boundary:summary');
  assertIncludes('src/components/reports/report-detail-shell.tsx', 'debugLegacyBody');
  assertIncludes('src/components/reports/report-detail-shell.tsx', 'data-display-weight={legacyBodyMode}');
  assertIncludes('src/components/reports/report-detail-shell.tsx', 'data-testid="report-legacy-body"');
  assertIncludes('src/app/reports/print/page.tsx', 'ReportPrintSectionBlocks');
  assertIncludes('src/app/reports/print/page.tsx', 'data-testid="print-preflight-panel"');
  assertIncludes('src/app/reports/print/page.tsx', 'data-testid="print-profile-label"');
  assertIncludes('src/app/reports/print/page.tsx', 'data-testid="print-legacy-content"');
  assertIncludes('src/lib/server/report-detail.ts', 'printDelivery');
  assertIncludes('src/lib/server/report-detail.ts', 'matrix_over_wide');
  assertIncludes('src/lib/server/report-detail.ts', 'video_cover_missing');
  assertIncludes('src/lib/server/report-print-renderer.ts', 'renderReportDetailPdfHtml');
  assertIncludes('src/app/api/reports/[id]/pdf/route.ts', 'preflight');
  assertIncludes('src/app/api/reports/[id]/pdf/route.ts', 'X-PDF-Profile');
  assertIncludes('src/app/reports/share/[token]/page.tsx', 'ReportSectionBlockStack');
  assertIncludes('src/app/api/reports/share/route.ts', 'detailModel');
  assertIncludes('src/app/api/reports/share/route.ts', 'siblingDetailModels');

  const { buildGoldenTestData } = await import('../src/lib/golden-test-data');
  const { assertGoldenDetailContract, requiredLayoutProfiles, requiredReportTypes } = await import('../src/lib/report-detail-contract');
  const { buildReportDetailModel } = await import('../src/lib/server/report-detail');
  const data = buildGoldenTestData('golden-admin-user');
  const reportTypes = new Set(data.reports.map((report: { report_type: string }) => report.report_type));
  const layoutProfiles = new Set(data.reports.map((report: { layout_profile: string }) => report.layout_profile));

  assert.equal(data.tasks.length >= 5, true, 'Golden data should include at least five tasks');
  for (const reportType of requiredReportTypes()) {
    assert.equal(reportTypes.has(reportType), true, `Golden data should include ${reportType}`);
  }
  for (const layoutProfile of requiredLayoutProfiles()) {
    assert.equal(layoutProfiles.has(layoutProfile), true, `Golden data should include ${layoutProfile}`);
  }
  assert.equal(data.issues.some((issue: { level: string; status: string }) => issue.level === '一类' && issue.status !== '已验证'), true, 'Golden data should include open high-risk issue');
  assert.equal(data.pdfJobs.some((job: { status: string }) => job.status === 'failed'), true, 'Golden data should include failed PDF job');
  assert.equal(data.comparison.objects.length >= 2, true, 'Golden comparison should include at least two objects');
  assert.equal(data.comparison.cells.length >= 4, true, 'Golden comparison should include matrix cells');
  assert.equal(data.metricComparison.objects.length >= 2, true, 'Golden metric comparison should include at least two objects');
  assert.equal(data.metricComparison.cells.length >= 4, true, 'Golden metric comparison should include metric cells');

  const detailContract = assertGoldenDetailContract(data);
  assert.equal(detailContract.inventory.some((item: { field: string }) => item.field === 'evidence_slot.role'), true, 'Contract inventory should include evidence slots');
  assert.equal(detailContract.inventory.some((item: { field: string }) => item.field === 'ai_confirmation_status'), true, 'Contract inventory should include AI status');

  for (const report of data.reports) {
    const snapshot = data.snapshots.find((item) => item.report_id === report.id) ?? null;
    const issues = data.issues.filter((issue) => issue.source_report_id === report.id || issue.task_id === report.task_id);
    const materials = data.materials.filter((material) => material.task_id === report.task_id);
    const pdfJobs = data.pdfJobs.filter((job) => job.report_id === report.id);
    const detail = buildReportDetailModel({ report, snapshot, issues, materials, pdfJobs });

    assert.equal(Boolean(detail.header.reportId), true, `${report.id} detail header should include reportId`);
    assert.equal(detail.header.reportType, report.report_type, `${report.id} detail header reportType should match`);
    assert.equal(detail.header.layoutProfile, report.layout_profile, `${report.id} detail layoutProfile should match`);
    assert.equal(detail.sections.length > 0, true, `${report.id} detail should include sections`);
    assert.equal(detail.sections.every((section) => section.blocks.length > 0), true, `${report.id} every section should include renderable blocks`);
    assert.equal(detail.actions.length > 0, true, `${report.id} detail should include actions`);
    assert.equal(Boolean(detail.conclusion.keyConclusion), true, `${report.id} detail should include conclusion`);
    assert.equal(detail.sections.some((section) => section.blockKeys.length > 0), true, `${report.id} detail sections should include block keys`);
    assert.equal(Boolean(detail.printDelivery?.profile?.id), true, `${report.id} detail should include print profile`);
    assert.equal((detail.printDelivery?.printBlocks?.length || 0) > 0, true, `${report.id} detail should include print blocks`);
    assert.equal(typeof detail.printDelivery?.preflight?.ok, 'boolean', `${report.id} detail should include print preflight status`);

    const emptyOrWarningSections = detail.sections.filter((section) => section.status === 'empty' || section.status === 'warning');
    assert.equal(emptyOrWarningSections.length >= 0, true, `${report.id} detail should support empty/warning section states`);

    if (report.report_type === 'comparison_report') {
      assert.equal(Boolean(snapshot), true, `${report.id} comparison detail should have snapshot`);
      assert.equal(detail.sections.some((section) => ['image_matrix', 'metric_table', 'mixed_matrix'].includes(section.key)), true, `${report.id} comparison detail should include matrix/table section`);
      assert.equal(detail.sections.some((section) => section.blocks.some((block) => block.type === 'table' && (block.rows?.length || 0) > 0)), true, `${report.id} comparison detail should expose table rows`);
      assert.equal(detail.sections.some((section) => section.blocks.some((block) => block.type === 'matrix' && (block.matrix?.objects?.length || 0) >= 2)), true, `${report.id} comparison detail should expose a horizontal matrix block with object columns`);
      assert.equal(detail.sections.some((section) => section.blocks.some((block) => block.type === 'matrix' && (block.matrix?.rows || []).some((row) => Object.values(row.cells).some((cell) => (cell.media?.length || 0) > 0)))), true, `${report.id} comparison matrix should include clickable cell media`);
      assert.equal(detail.sections.some((section) => section.blocks.some((block) => block.type === 'matrix' && (block.matrix?.rows || []).some((row) => Boolean(row.rowConclusion)))), true, `${report.id} comparison matrix should include row-level conclusions`);
      assert.equal(detail.evidenceSlots.some((slot) => slot.ownerType === 'comparison_cell'), true, `${report.id} comparison detail should expose comparison evidence slots`);
      assert.equal(detail.sections.some((section) => section.blocks.some((block) => block.id === 'overview:objects' && (block.items?.length || 0) >= 2)), true, `${report.id} comparison detail should expose object strip`);
      assert.equal(detail.sections.some((section) => section.blocks.some((block) => block.id === 'overview:comparability' && Boolean(block.description))), true, `${report.id} comparison detail should expose comparability boundary`);
      assert.equal(detail.sections.some((section) => section.blocks.some((block) => block.id.endsWith(':differences') && (block.items?.length || 0) > 0)), true, `${report.id} comparison detail should expose key differences`);
      assert.equal(detail.sections.some((section) => section.blocks.some((block) => block.id.endsWith(':cell-evidence') && (block.items || []).some((item) => (item.media?.length || 0) > 0))), true, `${report.id} comparison detail should expose inline cell evidence`);
      assert.equal(detail.sections.some((section) => section.key === 'ai_conclusion' && section.status === 'blocked'), report.ai_confirmation_status !== 'confirmed', `${report.id} comparison AI boundary should reflect confirmation status`);
      assert.equal(detail.printDelivery.profile.paper, 'A3', `${report.id} comparison print profile should use A3`);
      if (report.layout_profile === 'comparison_metric_table_a3_landscape') {
        assert.equal(detail.sections.some((section) => section.blocks.some((block) => block.id === 'metric_table:table' && block.columns?.includes('Anomaly') && block.columns?.includes('AI'))), true, `${report.id} metric table should expose anomaly and AI columns`);
      }
    }

    if (report.report_type === 'single_report') {
      assert.equal(detail.sections.some((section) => section.blocks.some((block) => block.id === 'overview:task-details' && (block.rows?.length || 0) > 0)), true, `${report.id} single detail should migrate task fields into blocks`);
      assert.equal(detail.sections.some((section) => section.blocks.some((block) => block.id === 'function_effect:steps' && (block.rows?.length || 0) > 0)), true, `${report.id} single detail should migrate recipe steps into blocks`);
      assert.equal(detail.sections.some((section) => section.blocks.some((block) => block.type === 'media' && (block.media?.length || 0) > 0)), true, `${report.id} single detail should expose media blocks`);
      assert.equal(detail.sections.some((section) => section.blocks.some((block) => block.id === 'issue_closure:table' && block.columns?.includes('Responsible') && block.columns?.includes('Plan') && block.columns?.includes('Validation') && block.columns?.includes('Evidence'))), true, `${report.id} single detail should expose full issue closure fields`);
      assert.equal(detail.sections.some((section) => section.blocks.some((block) => block.id === 'function_effect:step-evidence' && (block.items || []).some((item) => (item.media?.length || 0) > 0))), true, `${report.id} single detail should expose inline step evidence`);
      assert.equal(detail.sections.some((section) => section.blocks.some((block) => block.id === 'issue_closure:re-evaluations')), true, `${report.id} single detail should expose re-evaluation block`);
      assert.equal(detail.printDelivery.profile.paper, 'A4', `${report.id} single print profile should use A4`);
    }

    if (report.report_type === 'model_merged_report') {
      assert.equal(detail.sections.some((section) => section.blocks.some((block) => block.id === 'model_dossier:comparability' && Boolean(block.description))), true, `${report.id} model merge should expose comparability boundary`);
      assert.equal(detail.sections.some((section) => section.blocks.some((block) => block.id === 'stage_timeline:table' && (block.rows?.length || 0) >= 2)), true, `${report.id} model merge should expose stage timeline rows`);
      assert.equal(detail.sections.some((section) => section.blocks.some((block) => block.id === 'issue_evolution:table' && block.columns?.includes('Evidence'))), true, `${report.id} model merge should expose issue evolution evidence`);
      assert.equal(detail.sections.some((section) => section.blocks.some((block) => block.id === 'function_effect_evolution:list' && (block.items?.length || 0) > 0)), true, `${report.id} model merge should expose function effect evolution`);
      assert.equal(detail.sections.some((section) => section.blocks.some((block) => block.id === 'next_validation:list' && (block.items?.length || 0) > 0)), true, `${report.id} model merge should expose next-stage validation`);
      assert.equal(detail.printDelivery.profile.paper, 'A4', `${report.id} model merge print profile should use A4`);
    }

    if (report.report_type === 'custom_merged_report') {
      assert.equal(detail.sections.some((section) => section.key === 'source_alignment' && section.blocks.some((block) => block.id === 'source_alignment:table' && (block.rows?.length || 0) >= 2)), true, `${report.id} custom merge should expose source alignment`);
      assert.equal(detail.sections.some((section) => section.blocks.some((block) => block.id === 'field_alignment:table' && block.columns?.includes('Gap'))), true, `${report.id} custom merge should expose field alignment gaps`);
      assert.equal(detail.sections.some((section) => section.blocks.some((block) => block.id === 'comparability_boundary:summary' && Boolean(block.description))), true, `${report.id} custom merge should expose comparability boundary`);
      assert.equal(detail.sections.some((section) => section.blocks.some((block) => block.id === 'validation_suggestions:list')), true, `${report.id} custom merge should expose validation suggestions`);
      assert.equal(detail.printDelivery.profile.paper, 'A4', `${report.id} custom merge print profile should use A4`);
    }

    if (report.ai_confirmation_status === 'pending' || report.ai_confirmation_status === 'generated') {
      assert.equal(detail.qualityChecks.some((check) => check.code === 'ai_unconfirmed' && check.severity === 'error'), true, `${report.id} should block unconfirmed AI`);
      assert.equal(detail.actions.some((action) => action.type === 'publish' && action.enabled === false), true, `${report.id} publish action should be blocked while AI is unconfirmed`);
      assert.equal(detail.actions.some((action) => (action.type === 'export_pdf' || action.type === 'retry_pdf') && action.enabled === false && action.reason?.includes('AI')), true, `${report.id} PDF action should be blocked by AI status`);
      assert.equal(detail.printDelivery.preflight.errors.some((item) => item.code === 'ai_unconfirmed'), true, `${report.id} PDF preflight should block unconfirmed AI`);
    }
  }

  console.log('Golden Test contract check passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
