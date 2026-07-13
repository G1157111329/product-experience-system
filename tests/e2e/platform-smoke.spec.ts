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
  const firstItem = [...(matrixPayload.data?.item_nodes || [])]
    .filter((node: { node_type?: string }) => ['item', 'condition', 'metric', 'process_node', 'issue_group'].includes(node.node_type || ''))
    .sort((a: { sort_order?: number }, b: { sort_order?: number }) => (a.sort_order || 0) - (b.sort_order || 0))[0];
  const firstObject = matrixPayload.data?.objects?.[0];
  const targetCell = matrixPayload.data?.cells?.find((cell: { item_node_id?: string; object_id?: string }) => (
    cell.item_node_id === firstItem?.id && cell.object_id === firstObject?.id
  ));
  expect(targetCell?.id, 'Golden comparison matrix should include cells').toBeTruthy();
  const selectableMaterialId = 'golden-task-comparison-mat-1';

  const resetMediaResponse = await page.request.post(`/api/comparison-cells/${targetCell.id}/media`, {
    data: { material_ids: [] },
  });
  expect(resetMediaResponse.ok(), 'comparison cell media reset should return 2xx').toBeTruthy();

  await page.goto('/tasks/golden-task-comparison?tab=comparison');
  const expandSection = page.getByRole('button', { name: '展开大类' }).first();
  if (await expandSection.count()) await expandSection.click();
  await page.getByRole('button', { name: '展开细项' }).first().click();
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

test('report detail, print, and share keep the frozen report contract', async ({ page }) => {
  for (const reportId of ['golden-report-single', 'golden-report-comparison', 'golden-report-model', 'golden-report-custom']) {
    const headerResponse = await page.request.get(`/api/reports/${reportId}/header`);
    expect(headerResponse.ok(), `${reportId} header API should return 2xx`).toBeTruthy();
    const headerPayload = await headerResponse.json();
    expect(headerPayload.code, headerPayload.message || `${reportId} header API should succeed`).toBe(0);
    expect(headerPayload.data.availableTabs).not.toContain('matrix');
    if (reportId === 'golden-report-comparison') {
      expect(headerPayload.data.availableTabs).toContain('comparison_matrix');
      expect(headerPayload.data.availableTabs).not.toContain('data_matrix');
    }

    await page.goto(`/reports/${reportId}`);
    await expect(page.getByTestId('report-frozen-detail')).toBeVisible();
    await expect(page.getByRole('button', { name: '总结', exact: true })).toBeVisible();
    await expect(page.getByTestId('report-detail-shell')).toHaveCount(0);
    await expect(page.getByTestId('report-legacy-content')).toHaveCount(0);
    await expectAppLoaded(page);
  }

  await page.goto('/reports/golden-report-comparison');
  await page.getByRole('button', { name: '对比矩阵', exact: true }).click();
  await expect(page.getByTestId('report-frozen-detail')).toBeVisible();

  await page.goto('/reports/print?id=golden-report-single&mode=text');
  await expect(page.getByTestId('print-product-info')).toBeVisible();
  await expect(page.getByTestId('print-legacy-content')).toHaveCount(0);

  const singlePdfPreflightResponse = await page.request.get('/api/reports/golden-report-single/pdf?preflight=1');
  expect(singlePdfPreflightResponse.ok(), 'single PDF preflight API should return 2xx').toBeTruthy();
  const singlePdfPreflight = await singlePdfPreflightResponse.json();
  expect(singlePdfPreflight.data?.profile?.id, 'single preflight should expose A4 profile').toBe('single_a4_portrait');
  expect(singlePdfPreflight.data?.preflight?.ok, 'single PDF should pass blocking preflight').toBe(true);

  const singlePdfResponse = await page.request.get('/api/reports/golden-report-single/pdf');
  expect(singlePdfResponse.ok(), 'single PDF API should return a PDF').toBeTruthy();
  expect(singlePdfResponse.headers()['content-type'], 'single PDF should be a PDF response').toContain('application/pdf');
  expect(singlePdfResponse.headers()['content-disposition'], 'PDF filename should use the report title').toContain('filename*=UTF-8');

  const shareResponse = await page.request.post('/api/reports/share', {
    data: { report_id: 'golden-report-single', duration: '7d' },
  });
  const sharePayload = await shareResponse.json();
  expect(sharePayload.code, sharePayload.message || 'share API should succeed').toBe(0);
  try {
    await page.goto(`/reports/share/${sharePayload.data.share_token}`);
    await expect(page.getByTestId('share-frozen-report-view')).toBeVisible();
    await expect(page.getByTestId('share-legacy-content')).toHaveCount(0);
  } finally {
    await page.request.delete(`/api/reports/share/list?id=${encodeURIComponent(sharePayload.data.id)}`);
  }
});

test('permissions, share access, and mobile detail path are guarded', async ({ page, request, browser }) => {
  const anonymousDetail = await request.get('/api/reports/golden-report-single/detail');
  expect(anonymousDetail.status(), 'anonymous detail API should reject').toBe(401);

  const anonymousPdf = await request.get('/api/reports/golden-report-single/pdf?preflight=1');
  expect(anonymousPdf.status(), 'anonymous PDF preflight should reject').toBe(401);

  const invalidShare = await request.get('/api/reports/share?token=not-a-real-token');
  expect([403, 404], 'invalid share token should not expose data').toContain(invalidShare.status());

  await page.goto('/reports/golden-report-single');
  await expect(page.getByTestId('report-frozen-detail')).toBeVisible();

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
    await expect(anonymousSharePage.getByTestId('share-frozen-report-view'), 'share read-only page should render the frozen report view').toBeVisible();
    await expect(anonymousSharePage.getByTestId('share-legacy-content')).toHaveCount(0);
    await expect(anonymousSharePage.getByText('Confirm AI')).toHaveCount(0);
    await expect(anonymousSharePage.getByText('Publish snapshot')).toHaveCount(0);
  } finally {
    await anonymousShareContext.close();
  }
  await page.request.delete(`/api/reports/share/list?id=${encodeURIComponent(sharePayload.data.id)}`);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/reports/golden-report-single');
  await expect(page.getByTestId('report-frozen-detail')).toBeVisible();
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
