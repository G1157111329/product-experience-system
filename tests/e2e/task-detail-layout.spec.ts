import { expect, test } from '@playwright/test';
import { loginForE2E } from './auth-session';

test.beforeEach(async ({ page }) => {
  await loginForE2E(page, 'dockeradmin', 'DockerLocal2026');
});

test('食谱常态显示食材标签而不是常驻大表单', async ({ page }) => {
  const recipeName = `紧凑食材-${Date.now()}`;
  let recipeId = '';

  try {
    const response = await page.request.post('/api/recipes', {
      data: {
        task_id: 'golden-task-single',
        name: recipeName,
        recipe_type: '食谱',
        ingredients: '',
        ingredient_items: [{ name: '香蕉切块', quantity: 100, unit: 'g', note: '' }],
      },
    });
    const payload = await response.json();
    expect(payload.code, payload.message).toBe(0);
    recipeId = payload.data.id;

    await page.goto('/tasks/golden-task-single');
    await page.getByRole('button', { name: '功能效果', exact: true }).click();
    await page.getByText(recipeName, { exact: true }).click();

    await expect(page.getByRole('region', { name: '食材参数' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '编辑食材参数' })).toBeVisible();
    await expect(page.getByText('香蕉切块 100g', { exact: true })).toBeVisible();
  } finally {
    if (recipeId) await page.request.delete(`/api/recipes/${recipeId}`);
  }
});

test('新建食谱时完整录入结构化食材', async ({ page }) => {
  await page.goto('/tasks/golden-task-single');
  await page.getByRole('button', { name: '功能效果', exact: true }).click();
  await page.getByRole('button', { name: '新增', exact: true }).click();

  await expect(page.getByRole('textbox', { name: '新食材 1 名称' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '新食材 1 克重' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '新食材 1 单位' })).toBeVisible();
});
