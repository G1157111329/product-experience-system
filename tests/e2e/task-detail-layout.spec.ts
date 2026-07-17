import { expect, test } from '@playwright/test';
import { loginForE2E } from './auth-session';

test('task floating AI shows exploration choices and only prefills the draft', async ({ page }) => {
  const taskAgentRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/agent-chat')) taskAgentRequests.push(request.url());
  });

  await loginForE2E(page, 'dockeradmin', 'DockerLocal2026');
  await page.goto('/tasks/golden-task-single');
  await expect(page.getByText('AI五感体验', { exact: true })).toHaveCount(0);
  await expect(page.getByText('食谱功能AI探索', { exact: true })).toHaveCount(0);

  await page.getByTestId('task-floating-assistant').click();
  const entries = page.getByTestId('task-ai-entry-choices');
  await expect(entries).toBeVisible();
  await entries.getByRole('button', { name: /AI五感体验/ }).click();

  const prompt = page.getByRole('textbox', { name: 'AI任务助手输入' });
  await expect(prompt).toHaveValue(/AI五感体验/);
  await expect(prompt).toHaveValue(/不要直接写入/);
  expect(taskAgentRequests).toEqual([]);
});

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

  for (const label of ['五感体验', '单一食谱功能', '数据矩阵', '对比矩阵', '报告信息']) {
    await expect(context.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(context.getByText('问题管理', { exact: true })).toHaveCount(0);
  await expect(page.getByText('录入目录', { exact: true })).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});

test('素材证据是唯一底部素材区并使用紧凑添加入口', async ({ page }) => {
  await page.goto('/tasks/golden-task-single');
  await page.getByRole('button', { name: /单一食谱功能/ }).click();

  const evidenceRegion = page.getByRole('region', { name: '任务级素材证据' });
  await expect(evidenceRegion).toBeVisible();
  await expect(evidenceRegion.locator('[data-slot="scroll-area-viewport"]')).toBeVisible();
  await expect(evidenceRegion.getByRole('button', { name: /添加素材/ })).toBeVisible();
  await expect(evidenceRegion.getByText('可直接粘贴剪贴板图片', { exact: true })).toBeVisible();
  await expect(page.getByText('问题输出', { exact: true })).toHaveCount(0);

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
    await page.getByRole('button', { name: /单一食谱功能/ }).click();
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
  await page.getByRole('button', { name: /单一食谱功能/ }).click();
  await page.getByRole('button', { name: '新增', exact: true }).click();

  await expect(page.getByRole('textbox', { name: '新食材 1 名称' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '新食材 1 克重' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '新食材 1 单位' })).toBeVisible();
});

test('食谱问题点失焦后自动进入问题管理，无需二次确认', async ({ page }) => {
  const recipeName = `自动问题同步-${Date.now()}`;
  const issueTitle = `口感偏粗-${Date.now()}`;
  let recipeId = '';
  let issueId = '';
  try {
    const recipeResponse = await page.request.post('/api/recipes', {
      data: { task_id: 'golden-task-single', name: recipeName, recipe_type: '功能', ingredients: '' },
    });
    const recipePayload = await recipeResponse.json();
    expect(recipePayload.code, recipePayload.message).toBe(0);
    recipeId = recipePayload.data.id as string;

    await page.goto('/tasks/golden-task-single');
    await page.getByRole('button', { name: /单一食谱功能/ }).click();
    await page.getByText(recipeName, { exact: true }).click();
    await page.getByRole('button', { name: '新增问题点', exact: true }).click();
    const problemInput = page.getByPlaceholder('描述问题点...').last();
    await problemInput.fill(issueTitle);
    await problemInput.blur();

    await expect.poll(async () => {
      const response = await page.request.get(`/api/issues?recipe_id=${encodeURIComponent(recipeId)}&limit=20`);
      const payload = await response.json();
      const issue = payload.data?.list?.find((item: { title: string }) => item.title === issueTitle);
      issueId = issue?.id || '';
      return Boolean(issue);
    }).toBe(true);
    await expect(page.getByText('问题输出', { exact: true })).toHaveCount(0);
  } finally {
    if (issueId) await page.request.delete(`/api/issues/${issueId}`);
    if (recipeId) await page.request.delete(`/api/recipes/${recipeId}`);
  }
});

test('素材区支持粘贴图片并从原图预览进入完整编辑器', async ({ page }) => {
  const fileName = `e2e-paste-${Date.now()}.png`;
  let materialId = '';
  let uploadedFileName = '';
  try {
    await page.goto('/tasks/golden-task-single');
    await page.getByRole('button', { name: /单一食谱功能/ }).click();
    await expect(page.getByTestId('task-evidence-upload')).toBeVisible();
    const beforeResponse = await page.request.get('/api/materials?task_id=golden-task-single');
    const beforePayload = await beforeResponse.json();
    const existingIds = new Set<string>((beforePayload.data || []).map((item: { id: string }) => item.id));

    await page.getByTestId('task-evidence-upload').evaluate((element, name) => {
      const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), (char) => char.charCodeAt(0));
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], name, { type: 'image/png' }));
      const event = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', { value: transfer });
      element.dispatchEvent(event);
    }, fileName);

    await expect.poll(async () => {
      const response = await page.request.get('/api/materials?task_id=golden-task-single');
      const payload = await response.json();
      const material = payload.data?.find((item: { id: string; material_type: string }) => !existingIds.has(item.id) && item.material_type === 'image');
      materialId = material?.id || '';
      uploadedFileName = material?.file_name || '';
      return Boolean(material);
    }).toBe(true);

    const materialButton = page.getByText(uploadedFileName, { exact: true }).locator('xpath=ancestor::button');
    await expect(materialButton).toBeVisible();
    await materialButton.dblclick();
    await page.getByRole('button', { name: '编辑图片' }).click();
    const editor = page.getByRole('dialog', { name: '编辑图片' });
    await expect(editor).toBeVisible();
    await expect(editor.getByRole('button', { name: '裁剪' })).toBeVisible();
    await expect(editor.getByRole('button', { name: '画笔' })).toBeVisible();
    await expect(editor.getByRole('button', { name: '水平翻转' })).toBeVisible();
    await expect(editor.getByRole('button', { name: '垂直翻转' })).toBeVisible();
    await expect(editor.getByRole('button', { name: '撤销编辑' })).toBeVisible();
  } finally {
    if (materialId) await page.request.delete(`/api/materials?id=${materialId}`);
  }
});
