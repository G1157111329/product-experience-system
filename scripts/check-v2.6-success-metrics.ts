import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { buildGoldenTestData } from '../src/lib/golden-test-data';
import { buildReportDetailModel } from '../src/lib/server/report-detail';

const root = process.cwd();

function read(relativePath: string) {
  return readFileSync(path.join(root, relativePath), 'utf8');
}

function assertIncludes(file: string, expected: string) {
  assert.ok(read(file).includes(expected), `${file} is missing: ${expected}`);
}

function assertExists(relativePath: string) {
  assert.equal(existsSync(path.join(root, relativePath)), true, `${relativePath} does not exist`);
}

function hasRankingLanguage(value: unknown) {
  const text = JSON.stringify(value).toLowerCase();
  return /\b(best|winner|top ranked|recommended winner|rank\s*#?1)\b/.test(text)
    || text.includes('\u6700\u4f18')
    || text.includes('\u6392\u540d\u7b2c\u4e00');
}

function main() {
  assertExists('tests/e2e/platform-smoke.spec.ts');
  assertExists('scripts/check-golden-test-contract.ts');
  assertExists('src/lib/server/report-detail.ts');
  assertExists('src/lib/server/report-print-renderer.ts');
  assertIncludes('package.json', '"check:v2.6-success"');

  const testFile = read('tests/e2e/platform-smoke.spec.ts');
  assert.equal(/test\.skip|test\.only|describe\.skip|describe\.only|test\.fixme/.test(testFile), false, 'E2E tests must not contain soft skips, only markers, or fixme markers');
  assert.equal(/console\.(log|warn|error)\(/.test(testFile), false, 'E2E tests must not rely on console-only checks');
  assertIncludes('tests/e2e/platform-smoke.spec.ts', 'permissions, share access, and mobile detail path are guarded');
  assertIncludes('tests/e2e/platform-smoke.spec.ts', 'setViewportSize');
  assertIncludes('tests/e2e/platform-smoke.spec.ts', 'scrollWidth');
  assertIncludes('tests/e2e/platform-smoke.spec.ts', 'share read-only page');
  assertIncludes('tests/e2e/platform-smoke.spec.ts', 'single PDF should be a PDF response');
  assertIncludes('tests/e2e/platform-smoke.spec.ts', 'anonymous detail API should reject');
  assertIncludes('tests/e2e/platform-smoke.spec.ts', 'ordinary user should not create share');

  const data = buildGoldenTestData('golden-admin-user');
  const requiredReports = [
    'golden-report-single',
    'golden-report-comparison',
    'golden-report-metric',
    'golden-report-model',
    'golden-report-custom',
  ];
  for (const reportId of requiredReports) {
    assert.equal(data.reports.some((report) => report.id === reportId), true, `RD Golden Test is missing ${reportId}`);
  }

  const details = data.reports.map((report) => {
    const snapshot = data.snapshots.find((item) => item.report_id === report.id) ?? null;
    const issues = data.issues.filter((issue) => issue.source_report_id === report.id || issue.task_id === report.task_id);
    const materials = data.materials.filter((material) => material.task_id === report.task_id);
    const pdfJobs = data.pdfJobs.filter((job) => job.report_id === report.id);
    return {
      report,
      detail: buildReportDetailModel({ report, snapshot, issues, materials, pdfJobs }),
    };
  });

  for (const { report, detail } of details) {
    assert.ok(detail.header.title, `${report.id} should expose first-screen title`);
    assert.ok(detail.conclusion.keyConclusion, `${report.id} should expose first-screen conclusion`);
    assert.ok(detail.actions.length > 0, `${report.id} should expose next actions`);
    assert.ok(detail.sections.length > 0, `${report.id} should expose target modules`);
    assert.ok(detail.printDelivery.printBlocks.length > 0, `${report.id} should expose print blocks`);
  }

  const exportEligible = details.filter(({ report }) => report.ai_confirmation_status === 'confirmed');
  const preflightPassRate = exportEligible.filter(({ detail }) => detail.printDelivery.preflight.ok).length / Math.max(1, exportEligible.length);
  assert.ok(preflightPassRate >= 0.9, `PDF preflight pass rate should be >= 90%, got ${preflightPassRate}`);

  const requiredEvidenceMissing = exportEligible.reduce((sum, { detail }) => sum + detail.printDelivery.preflight.counts.requiredEvidenceMissing, 0);
  assert.equal(requiredEvidenceMissing, 0, 'Published/export-eligible reports must have zero missing required evidence');

  for (const { report, detail } of details.filter(({ report }) => report.ai_confirmation_status !== 'confirmed')) {
    assert.equal(detail.actions.some((action) => action.type === 'publish' && action.enabled), false, `${report.id} must not allow publish with unconfirmed AI`);
    assert.equal(detail.actions.some((action) => (action.type === 'export_pdf' || action.type === 'retry_pdf') && action.enabled), false, `${report.id} must not allow PDF with unconfirmed AI`);
    assert.equal(detail.printDelivery.preflight.errors.some((item) => item.code === 'ai_unconfirmed'), true, `${report.id} must expose AI preflight block`);
  }

  for (const { report, detail } of details.filter(({ report }) => report.report_type === 'model_merged_report' || report.report_type === 'custom_merged_report')) {
    assert.equal(hasRankingLanguage(detail), false, `${report.id} must not imply weak-comparability ranking`);
  }

  const shareEvidence = testFile.includes('share-section-block-card')
    && testFile.includes('share-legacy-content')
    && testFile.includes('sharePayload.data.share_token');
  assert.equal(shareEvidence, true, 'Share page consistency must have hard E2E assertions');

  console.log('V2.6 success metrics check passed');
}

main();
