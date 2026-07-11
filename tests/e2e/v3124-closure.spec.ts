import { expect, test } from '@playwright/test';
import { loginForE2E } from './auth-session';

test.beforeEach(async ({ page }) => {
  await loginForE2E(page, 'dockeradmin', 'DockerLocal2026');
});

test('four issue states and AI assistant labels are visible without legacy branding', async ({ page }) => {
  await page.goto('/issues');
  for (const label of ['待整改', '整改中', '不整改', '已整改']) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByText('已验证', { exact: true })).toHaveCount(0);

  await page.goto('/agent');
  await expect(page.getByText(/Hermes/i)).toHaveCount(0);
  await expect(page.getByRole('button', { name: '上传图片或视频' })).toBeVisible();
  await expect(page.getByLabel('AI助手对话输入')).toBeVisible();
});

test('AI assistant operation panel is reachable and applies only allowed task actions', async ({ page }) => {
  await page.goto('/tasks/golden-task-single');
  await expect(page.getByText('AI助手平台操作', { exact: true })).toBeVisible();
  await expect(page.getByText(/AI Agent/i)).toHaveCount(0);

  await page.goto('/agent?mode=actions&task=golden-task-single');
  await expect(page.getByRole('button', { name: '平台操作' })).toBeVisible();
  await expect(page.getByLabel('选择体验计划')).toHaveValue('golden-task-single');
  await expect(page.getByText('AI助手平台操作', { exact: true })).toBeVisible();

  const marker = `E2E AI助手问题 ${Date.now()}`;
  let issueId = '';
  try {
    const applyResponse = await page.request.post('/api/tasks/golden-task-single/agent-actions', {
      data: {
        actions: [{
          id: 'e2e_issue_create',
          type: 'issue_create',
          title: '新增问题点',
          risk: 'low',
          payload: { title: marker, description: '操作链验收', level: '二类' },
        }],
      },
    });
    const applyPayload = await applyResponse.json();
    expect(applyPayload.code, applyPayload.message).toBe(0);
    expect(applyPayload.data.results[0].status).toBe('applied');
    expect(applyPayload.data.results[0].data.status).toBe('open');
    issueId = applyPayload.data.results[0].data.id as string;

    const denied = await page.request.post('/api/tasks/golden-task-single/agent-actions', {
      data: {
        actions: [{ id: 'blocked_delete', type: 'recipe_step_delete', title: '删除步骤', risk: 'high', payload: { step_id: 'none' } }],
      },
    });
    expect(denied.status()).toBe(400);
  } finally {
    if (issueId) await page.request.delete(`/api/issues/${issueId}`);
  }
});

test('report detail share requires an expiry choice', async ({ page }) => {
  await page.goto('/reports/golden-report-single');
  await page.getByRole('button', { name: /分享/ }).first().click();
  await expect(page.getByRole('dialog')).toContainText('7天');
  await expect(page.getByRole('dialog')).toContainText('30天');
  await expect(page.getByRole('dialog')).toContainText('永久');
});

test('public share uses only the frozen report layout', async ({ page }) => {
  const created = await page.request.post('/api/reports/share', {
    data: { report_id: 'golden-report-single', duration: '7d' },
  });
  const payload = await created.json();
  expect(payload.code, payload.message).toBe(0);
  try {
    await page.goto(`/reports/share/${payload.data.share_token}`);
    await expect(page.getByTestId('share-frozen-report-view')).toBeVisible();
    await expect(page.getByTestId('share-legacy-content')).toHaveCount(0);
  } finally {
    await page.request.delete(`/api/reports/share/list?id=${encodeURIComponent(payload.data.id)}`);
  }
});

test('binding OAuth configuration never exposes stored secrets', async ({ page }) => {
  const response = await page.request.get('/api/v1/admin/wecom-bindings/config');
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  expect(payload.code, payload.message).toBe(0);
  for (const provider of ['wechat', 'wecom'] as const) {
    expect(payload.data[provider]).toHaveProperty('ready');
    expect(payload.data[provider]).toHaveProperty('secretConfigured');
    expect(payload.data[provider]).not.toHaveProperty('secret');
    expect(payload.data[provider]).not.toHaveProperty('secretEncrypted');
  }
});

test('print export uses the report name as the suggested filename', async ({ page }) => {
  const response = await page.request.get('/api/reports/golden-report-single');
  const payload = await response.json();
  expect(payload.code, payload.message).toBe(0);
  const title = payload.data.title as string;

  await page.goto('/reports/print?id=golden-report-single&mode=fast');
  await expect(page).toHaveTitle(title.replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|\r\n\t]+/g, '_'));
});

test('new data matrix has direct editable default hierarchy and no level-three column', async ({ page }) => {
  const created = await page.request.post('/api/v1/tasks/golden-task-single/matrices', {
    data: { name: `E2E直接录入矩阵-${Date.now()}`, view_mode: 'excel_like_dynamic_matrix' },
  });
  expect(created.ok()).toBeTruthy();
  const payload = await created.json();
  expect(payload.code, payload.message).toBe(0);
  const matrixId = payload.data.id as string;

  const projectionResponse = await page.request.get(`/api/v1/matrices/${matrixId}/v3-projection`);
  const projectionPayload = await projectionResponse.json();
  expect(projectionPayload.code, projectionPayload.message).toBe(0);
  expect(projectionPayload.data.hierarchy[0].nodeLabel).toBe('默认大类');
  expect(projectionPayload.data.hierarchy[0].children[0].nodeLabel).toBe('默认细项');
  expect(projectionPayload.data.rows).toHaveLength(1);
  expect(projectionPayload.data.rows[0].level3NodeId).toBeNull();

  await page.goto('/tasks/golden-task-single');
  await page.getByRole('button', { name: '数据矩阵', exact: true }).click();
  await page.getByText(`E2E直接录入矩阵-`, { exact: false }).first().click();
  await expect(page.locator('input[value="默认大类"]')).toBeVisible();
  await expect(page.locator('input[value="默认细项"]')).toBeVisible();
  await expect(page.getByText('空白动态数据矩阵')).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: /三级细项/ })).toHaveCount(0);

  await page.request.post(`/api/v1/matrices/${matrixId}/lifecycle`, { data: { action: 'archive', reason: 'e2e_cleanup' } });
});

test('first matrix entry auto-creates one default matrix and reuses it after tab switching', async ({ page }) => {
  const marker = `E2E auto matrix ${Date.now()}`;
  const taskResponse = await page.request.post('/api/tasks', {
    data: {
      task_name: marker,
      product_category: '通用标准',
      product: 'E2E',
      product_model: marker,
      task_mode: 'single',
    },
  });
  const taskPayload = await taskResponse.json();
  expect(taskPayload.code, taskPayload.message).toBe(0);
  const taskId = taskPayload.data.id as string;
  let matrixId = '';

  try {
    await page.goto(`/tasks/${taskId}?tab=matrix`);
    await expect(page.getByRole('button', { name: '新建数据矩阵', exact: true })).toHaveCount(0);
    await expect(page.getByText('当前任务尚未建立数据矩阵', { exact: true })).toHaveCount(0);
    await expect(page.locator('input[value="默认大类"]')).toBeVisible();

    const firstState = await page.request.get(`/api/v1/tasks/${taskId}/matrix-tab-state`);
    const firstPayload = await firstState.json();
    expect(firstPayload.code, firstPayload.message).toBe(0);
    expect(firstPayload.data.state).toBe('ready');
    expect(firstPayload.data.matrices.filter((matrix: { status: string }) => matrix.status !== 'archived')).toHaveLength(1);
    matrixId = firstPayload.data.matrices.find((matrix: { status: string }) => matrix.status !== 'archived').id as string;

    await page.goto(`/tasks/${taskId}?tab=info`);
    await expect(page.getByRole('heading', { name: marker, exact: true })).toBeVisible();
    await page.goto(`/tasks/${taskId}?tab=matrix`);
    await expect(page.locator('input[value="默认大类"]')).toBeVisible();

    const secondState = await page.request.get(`/api/v1/tasks/${taskId}/matrix-tab-state`);
    const secondPayload = await secondState.json();
    expect(secondPayload.data.matrices.filter((matrix: { status: string }) => matrix.status !== 'archived')).toHaveLength(1);
    expect(secondPayload.data.matrices[0].id).toBe(matrixId);

    const duplicatePosts = await Promise.all([
      page.request.post(`/api/v1/tasks/${taskId}/matrices`, { data: { name: `${marker} - 数据矩阵1`, view_mode: 'excel_like_dynamic_matrix' } }),
      page.request.post(`/api/v1/tasks/${taskId}/matrices`, { data: { name: `${marker} - 数据矩阵1`, view_mode: 'excel_like_dynamic_matrix' } }),
    ]);
    for (const response of duplicatePosts) {
      expect(response.ok(), `${response.status()} ${await response.text()}`).toBeTruthy();
    }
    const duplicatePayloads = await Promise.all(duplicatePosts.map((response) => response.json()));
    expect(duplicatePayloads.map((payload) => payload.data.created).sort()).toEqual([false, false]);

    const archived = await page.request.post(`/api/v1/matrices/${matrixId}/lifecycle`, {
      data: { action: 'archive', reason: 'e2e_recreate' },
    });
    const archivedPayload = await archived.json();
    expect(archivedPayload.code, archivedPayload.message).toBe(0);

    await page.goto(`/tasks/${taskId}?tab=info`);
    await page.goto(`/tasks/${taskId}?tab=matrix`);
    await expect(page.locator('input[value="默认大类"]')).toBeVisible();
    const recreatedState = await page.request.get(`/api/v1/tasks/${taskId}/matrix-tab-state`);
    const recreatedPayload = await recreatedState.json();
    const activeMatrices = recreatedPayload.data.matrices.filter((matrix: { status: string }) => matrix.status !== 'archived');
    expect(activeMatrices).toHaveLength(1);
    expect(activeMatrices[0].id).not.toBe(matrixId);
    matrixId = activeMatrices[0].id as string;
  } finally {
    if (matrixId) {
      await page.request.post(`/api/v1/matrices/${matrixId}/lifecycle`, { data: { action: 'archive', reason: 'e2e_cleanup' } });
    }
    await page.request.delete(`/api/tasks/${taskId}`);
  }
});

test('comparison categories default collapsed and names autosave without check buttons', async ({ page }) => {
  const initResponse = await page.request.get('/api/tasks/golden-task-comparison/comparison/init');
  const initPayload = await initResponse.json();
  expect(initPayload.code, initPayload.message).toBe(0);
  const assemblyId = initPayload.data.id as string;
  const matrixResponse = await page.request.get(`/api/comparison-matrix?assembly_id=${assemblyId}`);
  const matrixPayload = await matrixResponse.json();
  expect(matrixPayload.code, matrixPayload.message).toBe(0);
  const object = matrixPayload.data.objects[0] as { id: string; object_name: string };
  const sectionCount = matrixPayload.data.item_nodes.filter((node: { node_type: string }) => node.node_type === 'section').length;
  let createdSectionId = '';
  let seededSectionId = '';
  let seededItemId = '';
  const renamed = `E2E对象-${Date.now()}`;

  try {
    const seededSectionResponse = await page.request.post('/api/comparison-item-nodes', {
      data: {
        assembly_id: assemblyId,
        node_type: 'section',
        node_label: `E2E折叠大类-${Date.now()}`,
      },
    });
    const seededSectionPayload = await seededSectionResponse.json();
    expect(seededSectionPayload.code, seededSectionPayload.message).toBe(0);
    seededSectionId = seededSectionPayload.data.id;
    const seededItemResponse = await page.request.post('/api/comparison-item-nodes', {
      data: {
        assembly_id: assemblyId,
        parent_id: seededSectionId,
        node_type: 'item',
        node_label: 'E2E折叠细项',
      },
    });
    const seededItemPayload = await seededItemResponse.json();
    expect(seededItemPayload.code, seededItemPayload.message).toBe(0);
    seededItemId = seededItemPayload.data.id;

    await page.goto('/tasks/golden-task-comparison?tab=comparison');
    await expect(page.getByRole('button', { name: '展开大类' }).first()).toBeVisible();
    await page.getByRole('button', { name: '展开大类' }).first().click();
    await expect(page.getByRole('button', { name: '展开细项' }).first()).toBeVisible();
    await page.getByRole('button', { name: '展开细项' }).first().click();

    await page.getByRole('button', { name: object.object_name, exact: true }).first().click();
    const editor = page.getByLabel('编辑对象名称');
    await editor.fill(renamed);
    await editor.press('Enter');
    await expect(page.locator('button:has(svg.lucide-check)')).toHaveCount(0);
    await expect.poll(async () => {
      const response = await page.request.get(`/api/comparison-matrix?assembly_id=${assemblyId}`);
      const payload = await response.json();
      return payload.data.objects.find((item: { id: string }) => item.id === object.id)?.object_name;
    }).toBe(renamed);

    await page.getByRole('button', { name: '新增大类' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(async () => {
      const response = await page.request.get(`/api/comparison-matrix?assembly_id=${assemblyId}`);
      const payload = await response.json();
      const added = payload.data.item_nodes.find((node: { id: string; node_type: string }) => (
        node.node_type === 'section'
        && node.id !== seededSectionId
        && !matrixPayload.data.item_nodes.some((old: { id: string }) => old.id === node.id)
      ));
      createdSectionId = added?.id || '';
      return added?.node_label || '';
    }).toBe(`大类${sectionCount + 2}`);
  } finally {
    await page.request.put(`/api/comparison-objects/${object.id}`, { data: { object_name: object.object_name } });
    if (createdSectionId) await page.request.delete(`/api/comparison-item-nodes/${createdSectionId}`);
    if (seededItemId) await page.request.delete(`/api/comparison-item-nodes/${seededItemId}`);
    if (seededSectionId) await page.request.delete(`/api/comparison-item-nodes/${seededSectionId}`);
  }
});

test('no blocked cross-origin media request reaches the browser console', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (/violates the following Content Security Policy directive.*media-src/i.test(message.text())) {
      violations.push(message.text());
    }
  });
  await page.goto('/reports/golden-report-single');
  await page.waitForTimeout(1200);
  expect(violations).toEqual([]);
});
