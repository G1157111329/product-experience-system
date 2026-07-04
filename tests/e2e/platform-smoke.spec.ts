import { expect, test, type Page } from '@playwright/test';
import { loginForE2E } from './auth-session';

const account = process.env.E2E_ACCOUNT || 'dockeradmin';
const password = process.env.E2E_PASSWORD || 'DockerLocal2026';

async function login(page: Page) {
  await loginForE2E(page, account, password);
}

async function expectAppLoaded(page: Page) {
  await expect(page.getByText('This page couldn\'t load')).toHaveCount(0);
  await expect(page.getByText('Runtime SyntaxError')).toHaveCount(0);
  await expect(page.getByText('Unhandled Runtime Error')).toHaveCount(0);
  await expect(page.getByText('Unexpected end of JSON input')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveCSS('pointer-events', 'none');
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('standards recipe library tab loads and recipe detail can expand', async ({ page }) => {
  const apiResponse = await page.request.get('/api/recipe-library?limit=20&include_steps=1');
  expect(apiResponse.ok(), 'recipe library API should return 2xx').toBeTruthy();
  const apiPayload = await apiResponse.json();
  expect(apiPayload.code, apiPayload.message || 'recipe library API should succeed').toBe(0);
  expect(Array.isArray(apiPayload.data), 'recipe library API should return an array').toBeTruthy();
  expect(apiPayload.data.length, 'Docker smoke data should include at least one recipe library item').toBeGreaterThan(0);

  await page.goto('/standards');
  await expect(page).toHaveURL(/\/standards/);
  await expectAppLoaded(page);

  const recipeTab = page.getByTestId('recipe-library-section-tab');
  await recipeTab.click();
  await expectAppLoaded(page);

  const firstRecipe = apiPayload.data[0];
  await expect(page.getByText(firstRecipe.name, { exact: false })).toBeVisible();
  await page.getByText(firstRecipe.name, { exact: false }).first().click();
  await expectAppLoaded(page);
});

test('detail pages keep sidebar navigation clickable', async ({ page }) => {
  const tasksResponse = await page.request.get('/api/tasks?limit=20');
  expect(tasksResponse.ok(), 'tasks API should return 2xx').toBeTruthy();
  const tasksPayload = await tasksResponse.json();
  expect(tasksPayload.code, tasksPayload.message || 'tasks API should succeed').toBe(0);
  const tasks = tasksPayload.data?.list || tasksPayload.data || [];
  const task = tasks.find((item: { id?: string }) => item.id === 'golden-task-single') || tasks[0];
  expect(task?.id, 'Docker smoke data should include at least one task').toBeTruthy();

  await page.goto(`/tasks/${task.id}`);
  await expect(page).toHaveURL(new RegExp(`/tasks/${task.id}`));
  await expectAppLoaded(page);

  await page.locator('a[href="/reports"]').first().click();
  await expect(page).toHaveURL(/\/reports/);
  await expectAppLoaded(page);

  const reportsResponse = await page.request.get('/api/reports?limit=20');
  expect(reportsResponse.ok(), 'reports API should return 2xx').toBeTruthy();
  const reportsPayload = await reportsResponse.json();
  expect(reportsPayload.code, reportsPayload.message || 'reports API should succeed').toBe(0);
  const reports = reportsPayload.data || [];
  const report = reports.find((item: { id?: string }) => item.id === 'golden-report-single') || reports[0];
  expect(report?.id, 'Docker smoke data should include at least one report').toBeTruthy();

  await page.goto(`/reports/${report.id}`);
  await expect(page).toHaveURL(new RegExp(`/reports/${report.id}`));
  await expectAppLoaded(page);

  await page.locator('a[href="/tasks"]').first().click();
  await expect(page).toHaveURL(/\/tasks/);
  await expectAppLoaded(page);
});
test('comparison authoring saves inline cell text in an existing task', async ({ page }) => {
  const assemblyResponse = await page.request.get('/api/tasks/golden-task-comparison/comparison/init');
  expect(assemblyResponse.ok(), 'comparison assembly API should return 2xx').toBeTruthy();
  const assemblyPayload = await assemblyResponse.json();
  expect(assemblyPayload.code, assemblyPayload.message || 'comparison assembly API should succeed').toBe(0);
  const assemblyId = assemblyPayload.data?.id;
  expect(assemblyId, 'Golden comparison task should expose an assembly').toBeTruthy();

  const matrixResponse = await page.request.get(`/api/comparison-matrix?assembly_id=${assemblyId}`);
  expect(matrixResponse.ok(), 'comparison matrix API should return 2xx').toBeTruthy();
  const matrixPayload = await matrixResponse.json();
  expect(matrixPayload.code, matrixPayload.message || 'comparison matrix API should succeed').toBe(0);
  const targetCell = matrixPayload.data?.cells?.[0];
  expect(targetCell?.id, 'Golden comparison matrix should include cells').toBeTruthy();
  const selectableMaterialId = 'golden-task-comparison-mat-1';

  const resetMediaResponse = await page.request.post(`/api/comparison-cells/${targetCell.id}/media`, {
    data: { material_ids: [] },
  });
  expect(resetMediaResponse.ok(), 'comparison cell media reset should return 2xx').toBeTruthy();

  await page.goto('/tasks/golden-task-comparison?tab=comparison');
  await expect(page.locator('textarea').first(), 'inline matrix cell editor should be visible').toBeVisible();
  await expect(page.locator('button:has(svg.lucide-save)').first(), 'inline matrix save button should be visible').toBeVisible();

  await page.getByRole('button', { name: /选择素材/ }).first().click();
  const materialDialog = page.getByRole('dialog', { name: /选择素材/ });
  await expect(materialDialog, 'comparison cell material picker dialog should open').toBeVisible();
  await materialDialog.locator(`[data-testid="material-picker-item"][data-material-id="${selectableMaterialId}"]`).click();
  await expect(page.getByText(/已选\s*1\s*项/).first(), 'selected media count should update immediately after clicking a gallery image').toBeVisible();

  await expect.poll(async () => {
    const mediaResponse = await page.request.get(`/api/comparison-cells/${targetCell.id}/media`);
    const mediaPayload = await mediaResponse.json();
    const materials = mediaPayload.data?.materials || [];
    return materials.some((material: { id?: string }) => material.id === selectableMaterialId);
  }, { message: 'selected gallery image should persist on the comparison cell' }).toBe(true);

  const marker = `E2E inline effect ${Date.now()}`;
  await page.locator('textarea').first().fill(marker);
  await page.locator('button:has(svg.lucide-save)').first().click();

  await expect.poll(async () => {
    const updatedMatrixResponse = await page.request.get(`/api/comparison-matrix?assembly_id=${assemblyId}`);
    const updatedMatrixPayload = await updatedMatrixResponse.json();
    const updatedCell = updatedMatrixPayload.data?.cells?.find((cell: { id?: string }) => cell.id === targetCell.id);
    return updatedCell?.effect_summary || '';
  }, { message: 'inline cell text should persist through the matrix API' }).toBe(marker);
});

test('report detail renders v2 section canvas contract', async ({ page }) => {
  const reportsResponse = await page.request.get('/api/reports?limit=50');
  expect(reportsResponse.ok(), 'reports API should return 2xx').toBeTruthy();
  const reportsPayload = await reportsResponse.json();
  expect(reportsPayload.code, reportsPayload.message || 'reports API should succeed').toBe(0);
  const reports = reportsPayload.data || [];
  const report = reports.find((item: { id?: string }) => item.id === 'golden-report-metric') || reports[0];
  expect(report?.id, 'Docker smoke data should include at least one report').toBeTruthy();

  const detailResponse = await page.request.get(`/api/reports/${report.id}/detail`);
  expect(detailResponse.ok(), 'report detail model API should return 2xx').toBeTruthy();
  const detailPayload = await detailResponse.json();
  expect(detailPayload.code, detailPayload.message || 'report detail model API should succeed').toBe(0);
  expect(detailPayload.data?.sections?.length, 'detail model should include sections').toBeGreaterThan(0);
  expect(detailPayload.data?.sections?.some((section: { blocks?: Array<{ id?: string; columns?: string[] }> }) =>
    section.blocks?.some((block) => block.id === 'overview:objects'),
  ), 'comparison detail should include object strip').toBeTruthy();
  expect(detailPayload.data?.sections?.some((section: { blocks?: Array<{ id?: string; columns?: string[] }> }) =>
    section.blocks?.some((block) => block.id === 'metric_table:table' && block.columns?.includes('Anomaly')),
  ), 'metric comparison should include anomaly column').toBeTruthy();

  await page.goto(`/reports/${report.id}`);
  await expect(page.getByTestId('report-detail-shell')).toBeVisible();
  await expect(page.getByTestId('report-section-canvas')).toBeVisible();
  await expect(page.getByTestId('report-detail-section').first()).toBeVisible();
  await expect(page.getByTestId('report-section-block').first()).toBeVisible();
  await expect(page.getByTestId('report-section-block-row').first()).toBeVisible();
  await expect(page.getByTestId('report-section-actions').first()).toBeVisible();
  await expect(page.getByTestId('report-section-block').filter({ hasText: 'Object strip' })).toBeVisible();
  await expect(page.getByTestId('report-section-block').filter({ hasText: 'Comparability boundary' })).toBeVisible();
  await expect(page.getByTestId('report-section-block').filter({ hasText: 'Key differences and risks' })).toBeVisible();
  await expect(page.getByTestId('report-section-block').filter({ hasText: 'Cell evidence' })).toBeVisible();
  await expect(page.getByTestId('report-section-block').filter({ hasText: 'AI confirmation boundary' })).toBeVisible();
  await expect(page.getByTestId('report-inline-media-item').first()).toBeVisible();
  await expect(page.getByTestId('report-legacy-content')).toHaveCount(0);
  await expectAppLoaded(page);

  await page.goto('/reports/golden-report-comparison');
  await expect(page.getByTestId('report-section-block').filter({ hasText: 'Comparison matrix' }).first()).toBeVisible();
  await expect(page.getByTestId('report-section-block').filter({ hasText: 'Cell evidence' })).toBeVisible();
  await expect(page.getByTestId('report-inline-media-item').first()).toBeVisible();

  const singleDetailResponse = await page.request.get('/api/reports/golden-report-single/detail');
  expect(singleDetailResponse.ok(), 'single report detail model API should return 2xx').toBeTruthy();
  const singleDetailPayload = await singleDetailResponse.json();
  expect(singleDetailPayload.data?.sections?.some((section: { blocks?: Array<{ id?: string }> }) =>
    section.blocks?.some((block) => block.id === 'overview:task-details'),
  ), 'single report detail should include migrated task fields').toBeTruthy();

  await page.goto('/reports/golden-report-single');
  await expect(page.getByTestId('report-section-block').filter({ hasText: 'Task detail fields' })).toBeVisible();
  await expect(page.getByTestId('report-section-block').filter({ hasText: 'Recipe steps and problems' })).toBeVisible();
  await expect(page.getByTestId('report-section-block').filter({ hasText: 'Re-evaluation evidence' })).toBeVisible();
  await expect(page.getByTestId('report-section-media-item').first()).toBeVisible();
  await expect(page.getByTestId('report-inline-media-item').first()).toBeVisible();
  await expect(page.getByTestId('report-legacy-content')).toHaveCount(0);
  await expectAppLoaded(page);

  const modelDetailResponse = await page.request.get('/api/reports/golden-report-model/detail');
  expect(modelDetailResponse.ok(), 'model merged detail model API should return 2xx').toBeTruthy();
  const modelDetailPayload = await modelDetailResponse.json();
  expect(modelDetailPayload.data?.sections?.some((section: { blocks?: Array<{ id?: string; rows?: unknown[] }> }) =>
    section.blocks?.some((block) => block.id === 'stage_timeline:table' && (block.rows?.length || 0) >= 2),
  ), 'model merged detail should include stage timeline').toBeTruthy();

  await page.goto('/reports/golden-report-model');
  await expect(page.getByTestId('report-section-block').filter({ hasText: 'Stage timeline' }).first()).toBeVisible();
  await expect(page.getByTestId('report-section-block').filter({ hasText: 'Function effect evolution' }).first()).toBeVisible();
  await expect(page.getByTestId('report-section-block').filter({ hasText: 'Current risks' }).first()).toBeVisible();
  await expect(page.getByTestId('report-section-block').filter({ hasText: 'Next-stage validation' }).first()).toBeVisible();
  await expect(page.getByTestId('report-section-block').filter({ hasText: 'Comparability boundary' }).first()).toBeVisible();
  await expectAppLoaded(page);

  const customDetailResponse = await page.request.get('/api/reports/golden-report-custom/detail');
  expect(customDetailResponse.ok(), 'custom merged detail model API should return 2xx').toBeTruthy();
  const customDetailPayload = await customDetailResponse.json();
  expect(customDetailPayload.data?.sections?.some((section: { blocks?: Array<{ id?: string; rows?: unknown[] }> }) =>
    section.blocks?.some((block) => block.id === 'source_alignment:table' && (block.rows?.length || 0) >= 2),
  ), 'custom merged detail should include source alignment').toBeTruthy();

  await page.goto('/reports/golden-report-custom');
  await expect(page.getByTestId('report-section-block').filter({ hasText: 'Source alignment' }).first()).toBeVisible();
  await expect(page.getByTestId('report-section-block').filter({ hasText: 'Field alignment' }).first()).toBeVisible();
  await expect(page.getByTestId('report-section-block').filter({ hasText: 'Comparability boundary' }).first()).toBeVisible();
  await expect(page.getByTestId('report-section-block').filter({ hasText: 'Validation next steps' }).first()).toBeVisible();
  await expect(page.getByTestId('report-legacy-content')).toHaveCount(0);
  await expectAppLoaded(page);

  await page.goto('/reports/golden-report-single?parity=1');
  await expect(page.getByTestId('report-legacy-content')).toHaveAttribute('data-display-weight', 'parity');
  await expect(page.getByTestId('report-legacy-body')).toBeHidden();
  await expectAppLoaded(page);

  await page.goto('/reports/print?id=golden-report-single&mode=text');
  await expect(page.getByTestId('print-preflight-panel')).toBeVisible();
  await expect(page.getByTestId('print-profile-label')).toContainText('single_a4_portrait');
  await expect(page.getByTestId('print-section-block-stack').first()).toBeVisible();
  await expect(page.getByTestId('print-section-block').first()).toBeVisible();
  await expect(page.getByTestId('print-inline-media-item').first()).toBeVisible();
  await expect(page.getByTestId('print-legacy-content')).toHaveCount(0);

  const metricPreflightResponse = await page.request.get('/api/reports/golden-report-metric/pdf?preflight=1');
  expect(metricPreflightResponse.ok(), 'metric PDF preflight API should return 2xx').toBeTruthy();
  const metricPreflight = await metricPreflightResponse.json();
  expect(metricPreflight.data?.profile?.id, 'metric preflight should expose profile').toBe('comparison_metric_table_a3_landscape');
  expect(metricPreflight.data?.preflight?.ok, 'unconfirmed AI should block metric PDF').toBe(false);
  expect(metricPreflight.data?.preflight?.errors?.some((item: { code?: string }) => item.code === 'ai_unconfirmed'), 'metric PDF preflight should expose AI block').toBeTruthy();

  const singlePdfPreflightResponse = await page.request.get('/api/reports/golden-report-single/pdf?preflight=1');
  expect(singlePdfPreflightResponse.ok(), 'single PDF preflight API should return 2xx').toBeTruthy();
  const singlePdfPreflight = await singlePdfPreflightResponse.json();
  expect(singlePdfPreflight.data?.profile?.id, 'single preflight should expose A4 profile').toBe('single_a4_portrait');
  expect(singlePdfPreflight.data?.preflight?.ok, 'single PDF should pass blocking preflight').toBe(true);

  const singlePdfResponse = await page.request.get('/api/reports/golden-report-single/pdf');
  expect(singlePdfResponse.ok(), 'single PDF API should return a PDF').toBeTruthy();
  expect(singlePdfResponse.headers()['content-type'], 'single PDF should be a PDF response').toContain('application/pdf');
  expect(singlePdfResponse.headers()['x-pdf-profile'], 'single PDF should expose profile header').toBe('single_a4_portrait');

  const shareResponse = await page.request.post('/api/reports/share', {
    data: { report_id: 'golden-report-single', duration: '7d' },
  });
  expect(shareResponse.ok(), 'share API should return 2xx').toBeTruthy();
  const sharePayload = await shareResponse.json();
  expect(sharePayload.code, sharePayload.message || 'share API should succeed').toBe(0);
  await page.goto(`/reports/share/${sharePayload.data.share_token}`);
  await expect(page.getByTestId('share-section-block-card').first()).toBeVisible();
  await expect(page.getByTestId('report-section-block-stack').first()).toBeVisible();
  await expect(page.getByTestId('report-inline-media-item').first()).toBeVisible();
  await expect(page.getByTestId('share-legacy-content')).toHaveCount(0);
});

test('permissions, share access, and mobile detail path are guarded', async ({ page, request, browser }) => {
  const anonymousDetail = await request.get('/api/reports/golden-report-single/detail');
  expect(anonymousDetail.status(), 'anonymous detail API should reject').toBe(401);

  const anonymousPdf = await request.get('/api/reports/golden-report-single/pdf?preflight=1');
  expect(anonymousPdf.status(), 'anonymous PDF preflight should reject').toBe(401);

  const invalidShare = await request.get('/api/reports/share?token=not-a-real-token');
  expect([403, 404], 'invalid share token should not expose data').toContain(invalidShare.status());

  await page.goto('/reports/golden-report-single');
  await expect(page.getByTestId('report-detail-shell')).toBeVisible();
  await expect(page.getByTestId('report-section-actions').first()).toBeVisible();

  const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:5000';
  const ordinaryContext = await browser.newContext({ baseURL });
  const ordinaryPage = await ordinaryContext.newPage();
  try {
    await loginForE2E(ordinaryPage, 'goldenuser', 'GoldenUser2026');
    const ordinaryRead = await ordinaryPage.request.get('/api/reports/golden-report-single/detail');
    expect(ordinaryRead.ok(), 'ordinary user can read internal report detail').toBeTruthy();

    const ordinaryShare = await ordinaryPage.request.post('/api/reports/share', {
      data: { report_id: 'golden-report-single', duration: '7d' },
    });
    expect(ordinaryShare.status(), 'ordinary user should not create share for another owner report').toBe(403);
  } finally {
    await ordinaryContext.close();
  }

  const shareResponse = await page.request.post('/api/reports/share', {
    data: { report_id: 'golden-report-single', duration: '7d' },
  });
  expect(shareResponse.ok(), 'admin can create share for share read-only page').toBeTruthy();
  const sharePayload = await shareResponse.json();
  expect(sharePayload.code, sharePayload.message || 'share API should succeed').toBe(0);

  const anonymousShareContext = await browser.newContext({ baseURL });
  const anonymousSharePage = await anonymousShareContext.newPage();
  try {
    await anonymousSharePage.goto(`/reports/share/${sharePayload.data.share_token}`);
    await expect(anonymousSharePage.getByTestId('share-section-block-card').first(), 'share read-only page should render section blocks').toBeVisible();
    await expect(anonymousSharePage.getByTestId('share-legacy-content')).toHaveCount(0);
    await expect(anonymousSharePage.getByText('Confirm AI')).toHaveCount(0);
    await expect(anonymousSharePage.getByText('Publish snapshot')).toHaveCount(0);
  } finally {
    await anonymousShareContext.close();
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/reports/golden-report-single');
  await expect(page.getByTestId('report-detail-shell')).toBeVisible();
  await expect(page.getByTestId('report-section-block').filter({ hasText: 'Issue closure table' })).toBeVisible();
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(horizontalOverflow, 'mobile detail should not create page-level horizontal scrollWidth overflow').toBeLessThanOrEqual(24);
});

test('report center list contract renders in Docker baseline', async ({ page }) => {
  const reportsResponse = await page.request.get('/api/reports?limit=50');
  expect(reportsResponse.ok(), 'reports API should return 2xx').toBeTruthy();
  const reportsPayload = await reportsResponse.json();
  expect(reportsPayload.code, reportsPayload.message || 'reports API should succeed').toBe(0);
  expect(Array.isArray(reportsPayload.data), 'reports API should include report rows').toBeTruthy();

  await page.goto('/reports');
  await expect(page.locator('#delivery-board-title')).toHaveCount(0);
  await expect(page.getByText('Action Inbox')).toHaveCount(0);
  await expectAppLoaded(page);
});
