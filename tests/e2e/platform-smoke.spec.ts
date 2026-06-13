import { expect, test, type Page } from '@playwright/test';

const account = process.env.E2E_ACCOUNT || 'dockeradmin';
const password = process.env.E2E_PASSWORD || 'DockerLocal2026';

async function login(page: Page) {
  const response = await page.request.post('/api/auth/login', {
    data: { account, password },
  });
  expect(response.ok(), 'login API should return 2xx').toBeTruthy();
  const payload = await response.json();
  expect(payload.code, payload.message || 'login API should succeed').toBe(0);
}

async function expectAppLoaded(page: Page) {
  await expect(page.getByText('This page couldn\'t load')).toHaveCount(0);
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
  const task = (tasksPayload.data?.list || tasksPayload.data || [])[0];
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
  const report = (reportsPayload.data || [])[0];
  expect(report?.id, 'Docker smoke data should include at least one report').toBeTruthy();

  await page.goto(`/reports/${report.id}`);
  await expect(page).toHaveURL(new RegExp(`/reports/${report.id}`));
  await expectAppLoaded(page);

  await page.locator('a[href="/tasks"]').first().click();
  await expect(page).toHaveURL(/\/tasks/);
  await expectAppLoaded(page);
});
