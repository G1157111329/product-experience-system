import { expect, test } from '@playwright/test';
import { loginForE2E } from './auth-session';

test.beforeEach(async ({ page }) => {
  await loginForE2E(page, 'dockeradmin', 'DockerLocal2026');
});

test('顶部任务栏呈现上下文状态和两个主操作', async ({ page }) => {
  await page.goto('/tasks/golden-task-single');

  const context = page.getByRole('region', { name: '任务上下文' });
  await expect(context).toBeVisible();
  await expect(context.getByRole('heading', { name: 'GT-01 原汁机双口径指标表', exact: true })).toBeVisible();
  await expect(context.getByRole('button', { name: '生成总结', exact: true })).toHaveCount(1);
  await expect(context.getByRole('button', { name: '生成报告', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: '生成总结', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: '生成报告', exact: true })).toHaveCount(1);

  for (const label of ['五感体验', '单一食谱功能', '数据矩阵', '对比矩阵', '报告信息', '问题管理']) {
    await expect(context.getByText(label, { exact: true })).toBeVisible();
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test('素材证据位于主工作区底部而非录入目录', async ({ page }) => {
  await page.goto('/tasks/golden-task-single');
  await page.getByRole('button', { name: '功能效果', exact: true }).click();

  const directory = page.getByRole('complementary').filter({
    has: page.getByRole('heading', { name: '录入目录', exact: true }),
  });
  await expect(directory).toBeVisible();
  await expect(directory.getByRole('heading', { name: '素材证据', exact: true })).toHaveCount(0);

  const evidenceRegion = page.getByRole('region', { name: '任务级素材证据' });
  await expect(evidenceRegion).toBeVisible();
  await expect(evidenceRegion.locator('[data-slot="scroll-area-viewport"]')).toBeVisible();
  await expect(evidenceRegion.getByRole('button', { name: '相册图片', exact: true })).toBeVisible();

  const materialButtons = evidenceRegion.locator('[data-slot="scroll-area-viewport"] button');
  if ((await materialButtons.count()) > 0) {
    await expect(materialButtons.first()).toBeEnabled();
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
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
