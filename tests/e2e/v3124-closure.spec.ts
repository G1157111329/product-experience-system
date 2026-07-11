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

test('public share uses only the frozen report layout without a login session', async ({ page, browser }) => {
  const created = await page.request.post('/api/reports/share', {
    data: { report_id: 'golden-report-single', duration: '7d' },
  });
  const payload = await created.json();
  expect(payload.code, payload.message).toBe(0);
  const anonymousContext = await browser.newContext();
  const anonymousPage = await anonymousContext.newPage();
  try {
    await anonymousPage.goto(`/reports/share/${payload.data.share_token}`);
    await expect(anonymousPage).not.toHaveURL(/\/login/);
    await expect(anonymousPage.getByTestId('share-frozen-report-view')).toBeVisible();
    await expect(anonymousPage.getByTestId('share-legacy-content')).toHaveCount(0);
  } finally {
    await anonymousContext.close();
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

test('new data matrix keeps the first level-three item editable without an orphan row', async ({ page }) => {
  const marker = `E2E三级细项-${Date.now()}`;
  const taskResponse = await page.request.post('/api/tasks', {
    data: { task_name: marker, product_category: '通用标准', product: 'E2E', product_model: marker, task_mode: 'single' },
  });
  const taskPayload = await taskResponse.json();
  expect(taskPayload.code, taskPayload.message).toBe(0);
  const taskId = taskPayload.data.id as string;
  let matrixId = '';
  try {
    const created = await page.request.post(`/api/v1/tasks/${taskId}/matrices`, {
      data: { name: `${marker}-矩阵`, view_mode: 'excel_like_dynamic_matrix' },
    });
    const payload = await created.json();
    expect(payload.code, payload.message).toBe(0);
    matrixId = payload.data.id as string;

    const projectionResponse = await page.request.get(`/api/v1/matrices/${matrixId}/v3-projection`);
    const projectionPayload = await projectionResponse.json();
    expect(projectionPayload.code, projectionPayload.message).toBe(0);
    const level2Id = projectionPayload.data.hierarchy[0].children[0].id as string;
    expect(projectionPayload.data.rows).toHaveLength(1);

    const level3Response = await page.request.post(`/api/v1/matrices/${matrixId}/hierarchy-nodes`, {
      data: { level: 3, parentId: level2Id, nodeLabel: '首个三级细项' },
    });
    const level3Payload = await level3Response.json();
    expect(level3Payload.code, level3Payload.message).toBe(0);

    const updatedResponse = await page.request.get(`/api/v1/matrices/${matrixId}/v3-projection`);
    const updatedPayload = await updatedResponse.json();
    expect(updatedPayload.data.rows).toHaveLength(1);
    expect(updatedPayload.data.rows[0].level3NodeId).toBe(level3Payload.data.node.id);

    await page.goto(`/tasks/${taskId}?tab=matrix`);
    await expect(page.locator('input[value="默认大类"]')).toBeVisible();
    await expect(page.locator('input[value="默认细项"]')).toBeVisible();
    await expect(page.locator('input[value="首个三级细项"]')).toBeVisible();
    await expect(page.getByText('素材池', { exact: true })).toHaveCount(0);
  } finally {
    if (matrixId) await page.request.post(`/api/v1/matrices/${matrixId}/lifecycle`, { data: { action: 'archive', reason: 'e2e_cleanup' } });
    await page.request.delete(`/api/tasks/${taskId}`);
  }
});

test('matrix cell saves on blur and new columns stay inside their semantic zones', async ({ page }) => {
  const marker = `E2E矩阵失焦保存-${Date.now()}`;
  const taskResponse = await page.request.post('/api/tasks', {
    data: { task_name: marker, product_category: '通用标准', product: 'E2E', product_model: marker, task_mode: 'single' },
  });
  const taskPayload = await taskResponse.json();
  expect(taskPayload.code, taskPayload.message).toBe(0);
  const taskId = taskPayload.data.id as string;
  let matrixId = '';
  try {
    const created = await page.request.post(`/api/v1/tasks/${taskId}/matrices`, {
      data: { name: `${marker}-矩阵`, view_mode: 'excel_like_dynamic_matrix' },
    });
    const createdPayload = await created.json();
    matrixId = createdPayload.data.id as string;

    const calculationResponse = await page.request.post(`/api/v1/matrices/${matrixId}/columns`, {
      data: { columnZone: 'calculation_dimension', columnLabel: '计算结果', dataType: 'formula' },
    });
    expect((await calculationResponse.json()).code).toBe(0);
    const detailResponse = await page.request.post(`/api/v1/matrices/${matrixId}/columns`, {
      data: { columnZone: 'detail_dimension', columnLabel: '新增对比指标', dataType: 'text' },
    });
    expect((await detailResponse.json()).code).toBe(0);

    const orderedProjectionResponse = await page.request.get(`/api/v1/matrices/${matrixId}/v3-projection`);
    const orderedProjection = (await orderedProjectionResponse.json()).data;
    const labels = orderedProjection.columns.map((column: { columnLabel: string }) => column.columnLabel);
    expect(labels.indexOf('新增对比指标')).toBeLessThan(labels.indexOf('计算结果'));
    expect(labels.indexOf('计算结果')).toBeLessThan(labels.indexOf('效果素材'));

    await page.goto(`/tasks/${taskId}?tab=matrix`);
    const header = page.getByRole('columnheader', { name: /效果评价/ });
    await expect(header).toBeVisible();
    const columnIndex = await header.evaluate((element) => (element as HTMLTableCellElement).cellIndex);
    const input = page.locator('tbody tr').first().locator('td').nth(columnIndex).getByLabel('矩阵单元格');
    await input.fill('离开单元格后保存');

    const beforeBlurResponse = await page.request.get(`/api/v1/matrices/${matrixId}/v3-projection`);
    expect(JSON.stringify((await beforeBlurResponse.json()).data)).not.toContain('离开单元格后保存');

    await input.blur();
    await expect.poll(async () => {
      const response = await page.request.get(`/api/v1/matrices/${matrixId}/v3-projection`);
      return JSON.stringify((await response.json()).data);
    }).toContain('离开单元格后保存');
    await expect(page.getByText('加载矩阵数据…')).toHaveCount(0);
  } finally {
    if (matrixId) await page.request.post(`/api/v1/matrices/${matrixId}/lifecycle`, { data: { action: 'archive', reason: 'e2e_cleanup' } });
    await page.request.delete(`/api/tasks/${taskId}`);
  }
});

test('data-matrix problem and appendix material reach report detail and print', async ({ page }) => {
  const marker = `E2E矩阵报告问题-${Date.now()}`;
  const issueTitle = `效果波动-${Date.now()}`;
  const taskResponse = await page.request.post('/api/tasks', {
    data: { task_name: marker, product_category: '通用标准', product: 'E2E', product_model: marker, task_mode: 'single' },
  });
  const taskPayload = await taskResponse.json();
  const taskId = taskPayload.data.id as string;
  let matrixId = '';
  let materialId = '';
  let reportId = '';
  try {
    const matrixResponse = await page.request.post(`/api/v1/tasks/${taskId}/matrices`, {
      data: { name: `${marker}-矩阵`, view_mode: 'excel_like_dynamic_matrix' },
    });
    matrixId = (await matrixResponse.json()).data.id as string;
    const projectionResponse = await page.request.get(`/api/v1/matrices/${matrixId}/v3-projection`);
    const projection = (await projectionResponse.json()).data;
    const leafRowId = projection.rows[0].id as string;
    const mediaColumnId = projection.columns.find((column: { columnZone: string }) => column.columnZone === 'effect_media').id as string;
    const issueColumnId = projection.columns.find((column: { columnZone: string }) => column.columnZone === 'issue_point').id as string;

    const uploadResponse = await page.request.post('/api/materials/upload', {
      multipart: {
        task_id: taskId,
        file: {
          name: `${marker}.png`,
          mimeType: 'image/png',
          buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
        },
      },
    });
    const uploadPayload = await uploadResponse.json();
    expect(uploadPayload.code, uploadPayload.message).toBe(0);
    materialId = uploadPayload.data.id as string;

    const bindResponse = await page.request.post(`/api/v1/matrices/${matrixId}/cells/${leafRowId}/${mediaColumnId}/media`, {
      data: { materialId },
    });
    expect((await bindResponse.json()).code).toBe(0);
    const issueResponse = await page.request.post(`/api/v1/matrices/${matrixId}/issue-points`, {
      data: { leafRowId, columnId: issueColumnId, issueText: issueTitle },
    });
    expect((await issueResponse.json()).code).toBe(0);

    const reportResponse = await page.request.post('/api/reports', { data: { task_id: taskId, title: `${marker}报告` } });
    const reportPayload = await reportResponse.json();
    expect(reportPayload.code, reportPayload.message).toBe(0);
    reportId = reportPayload.data.id as string;

    const headerResponse = await page.request.get(`/api/reports/${reportId}/header`);
    expect((await headerResponse.json()).data.availableTabs).toContain('matrix');
    const issuesResponse = await page.request.get(`/api/reports/${reportId}/issues`);
    const reportIssues = (await issuesResponse.json()).data as Array<Record<string, unknown>>;
    const reportIssue = reportIssues.find((issue) => issue.title === issueTitle);
    expect(reportIssue?.source_type).toBe('matrix_problem');
    expect((reportIssue?.materials as Array<{ id: string }>).map((material) => material.id)).toContain(materialId);

    await page.goto(`/reports/print?id=${reportId}&mode=fast`);
    await expect(page.getByText(issueTitle, { exact: true }).first()).toBeVisible();
    await expect(page.getByText('附录素材：', { exact: true })).toBeVisible();
    await expect(page.getByText(/整改：/).first()).toBeVisible();
  } finally {
    if (reportId) await page.request.delete(`/api/reports/${reportId}`);
    if (materialId) await page.request.delete(`/api/materials?id=${materialId}`);
    if (matrixId) await page.request.post(`/api/v1/matrices/${matrixId}/lifecycle`, { data: { action: 'archive', reason: 'e2e_cleanup' } });
    await page.request.delete(`/api/tasks/${taskId}`);
  }
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

    page.once('dialog', (dialog) => {
      expect(dialog.message()).toBe('将清空本矩阵的单元格、问题、小结和素材关联，并移入回收区。矩阵将不进入后续生成的报告；已冻结报告不受影响。是否继续？');
      void dialog.accept();
    });
    await page.getByRole('button', { name: /清空并停用矩阵/ }).first().click();
    await expect.poll(async () => {
      const response = await page.request.get(`/api/v1/tasks/${taskId}/matrix-tab-state`);
      const payload = await response.json();
      const activeMatrices = payload.data.matrices.filter((matrix: { status: string }) => matrix.status !== 'archived');
      return activeMatrices.length === 1 && activeMatrices[0].id !== matrixId ? activeMatrices[0].id : '';
    }, { timeout: 10_000 }).not.toBe('');
    await expect(page.locator('input[value="默认大类"]')).toBeVisible();
    const recreatedState = await page.request.get(`/api/v1/tasks/${taskId}/matrix-tab-state`);
    const recreatedPayload = await recreatedState.json();
    const activeMatrices = recreatedPayload.data.matrices.filter((matrix: { status: string }) => matrix.status !== 'archived');
    expect(activeMatrices).toHaveLength(1);
    expect(activeMatrices[0].id).not.toBe(matrixId);
    expect(recreatedPayload.data.matrices).toContainEqual(expect.objectContaining({ id: matrixId, status: 'archived' }));
    matrixId = activeMatrices[0].id as string;
  } finally {
    if (matrixId) {
      await page.request.post(`/api/v1/matrices/${matrixId}/lifecycle`, { data: { action: 'archive', reason: 'e2e_cleanup' } });
    }
    await page.request.delete(`/api/tasks/${taskId}`);
  }
});

test('concurrent first matrix creation is idempotent without opening the matrix tab', async ({ page }) => {
  const marker = `E2E concurrent matrix ${Date.now()}`;
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
    const responses = await Promise.all([
      page.request.post(`/api/v1/tasks/${taskId}/matrices`, {
        data: { name: `${marker} - 数据矩阵1`, view_mode: 'excel_like_dynamic_matrix' },
      }),
      page.request.post(`/api/v1/tasks/${taskId}/matrices`, {
        data: { name: `${marker} - 数据矩阵1`, view_mode: 'excel_like_dynamic_matrix' },
      }),
      page.request.post(`/api/v1/tasks/${taskId}/matrices`, {
        data: { name: `${marker} - 数据矩阵1`, view_mode: 'excel_like_dynamic_matrix' },
      }),
    ]);
    for (const response of responses) {
      expect(response.ok(), `${response.status()} ${await response.text()}`).toBeTruthy();
    }
    const payloads = await Promise.all(responses.map((response) => response.json()));
    expect(payloads.every((payload) => payload.code === 0)).toBeTruthy();
    expect(new Set(payloads.map((payload) => payload.data.id)).size).toBe(1);
    expect(payloads.map((payload) => payload.data.created).sort()).toEqual([false, false, true]);
    matrixId = payloads[0].data.id as string;

    const stateResponse = await page.request.get(`/api/v1/tasks/${taskId}/matrix-tab-state`);
    const statePayload = await stateResponse.json();
    expect(statePayload.code, statePayload.message).toBe(0);
    expect(statePayload.data.matrices.filter((matrix: { status: string }) => matrix.status !== 'archived')).toHaveLength(1);
  } finally {
    if (matrixId) {
      await page.request.post(`/api/v1/matrices/${matrixId}/lifecycle`, { data: { action: 'archive', reason: 'e2e_cleanup' } });
    }
    await page.request.delete(`/api/tasks/${taskId}`);
  }
});

test('disposable V3 matrix visibility freezes value across report generations and archive', async ({ page }) => {
  const marker = `E2E report visibility V3 ${Date.now()}`;
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
  const reportIds: string[] = [];

  const generateReport = async () => {
    const response = await page.request.post('/api/reports', { data: { task_id: taskId } });
    const payload = await response.json();
    expect(payload.code, payload.message).toBe(0);
    const reportId = payload.data.id as string;
    reportIds.push(reportId);
    return reportId;
  };

  try {
    const matrixResponse = await page.request.post(`/api/v1/tasks/${taskId}/matrices`, {
      data: { name: `${marker} - V3`, view_mode: 'excel_like_dynamic_matrix' },
    });
    const matrixPayload = await matrixResponse.json();
    expect(matrixPayload.code, matrixPayload.message).toBe(0);
    matrixId = matrixPayload.data.id as string;

    const emptyProjectionResponse = await page.request.get(`/api/v1/matrices/${matrixId}/v3-projection`);
    const emptyProjectionPayload = await emptyProjectionResponse.json();
    expect(emptyProjectionPayload.code, emptyProjectionPayload.message).toBe(0);
    const emptyProjection = emptyProjectionPayload.data as {
      rows: Array<{ id: string }>;
      columns: Array<{ id: string; columnZone: string; dataType: string }>;
    };
    const leafRowId = emptyProjection.rows.find((row) => row.id)?.id;
    const column = emptyProjection.columns.find((candidate) => candidate.columnZone === 'evaluation')
      ?? emptyProjection.columns.find((candidate) => candidate.dataType === 'long_text');
    expect(leafRowId).toBeTruthy();
    expect(column?.id).toBeTruthy();

    const reportV1 = await generateReport();
    const headerV1Response = await page.request.get(`/api/reports/${reportV1}/header`);
    const headerV1Payload = await headerV1Response.json();
    expect(headerV1Payload.code, headerV1Payload.message).toBe(0);
    expect(headerV1Payload.data.availableTabs).not.toContain('matrix');

    const cellResponse = await page.request.put(
      `/api/v1/matrices/${matrixId}/cells/${leafRowId}/${column!.id}`,
      { data: { valueText: '85℃', displayText: '85℃' } },
    );
    const cellPayload = await cellResponse.json();
    expect(cellPayload.code, cellPayload.message).toBe(0);
    expect(cellPayload.data.valueState).toBe('filled');

    const reportV2 = await generateReport();
    const headerV2Response = await page.request.get(`/api/reports/${reportV2}/header`);
    const headerV2Payload = await headerV2Response.json();
    expect(headerV2Payload.data.availableTabs).toContain('matrix');
    const matrixV2Response = await page.request.get(`/api/reports/${reportV2}/matrix`);
    const matrixV2Payload = await matrixV2Response.json();
    expect(matrixV2Payload.code, matrixV2Payload.message).toBe(0);
    expect(JSON.stringify(matrixV2Payload.data.dataMatrixV3)).toContain('85℃');

    const archiveResponse = await page.request.post(`/api/v1/matrices/${matrixId}/lifecycle`, {
      data: { action: 'clear_and_archive', reason: 'e2e_report_visibility' },
    });
    const archivePayload = await archiveResponse.json();
    expect(archivePayload.code, archivePayload.message).toBe(0);
    expect(archivePayload.data.status).toBe('archived');

    const reportV3 = await generateReport();
    const headerV3Response = await page.request.get(`/api/reports/${reportV3}/header`);
    const headerV3Payload = await headerV3Response.json();
    expect(headerV3Payload.data.availableTabs).not.toContain('matrix');

    const oldHeaderResponse = await page.request.get(`/api/reports/${reportV2}/header`);
    const oldHeaderPayload = await oldHeaderResponse.json();
    expect(oldHeaderPayload.data.availableTabs).toContain('matrix');
    const oldMatrixResponse = await page.request.get(`/api/reports/${reportV2}/matrix`);
    const oldMatrixPayload = await oldMatrixResponse.json();
    expect(JSON.stringify(oldMatrixPayload.data.dataMatrixV3)).toContain('85℃');
  } finally {
    if (matrixId) await page.request.post(`/api/v1/matrices/${matrixId}/lifecycle`, { data: { action: 'archive', reason: 'e2e_cleanup' } });
    for (const reportId of reportIds) await page.request.delete(`/api/reports/${reportId}`);
    await page.request.delete(`/api/tasks/${taskId}`);
  }
});

test('disposable comparison assembly hides report matrix after UI object deletion and deactivation', async ({ page }) => {
  const marker = `E2E comparison visibility ${Date.now()}`;
  const taskResponse = await page.request.post('/api/tasks', {
    data: {
      task_name: marker,
      product_category: '通用标准',
      product: 'E2E',
      product_model: marker,
      task_mode: 'comparison',
    },
  });
  const taskPayload = await taskResponse.json();
  expect(taskPayload.code, taskPayload.message).toBe(0);
  const taskId = taskPayload.data.id as string;
  const assemblyId = taskPayload.data.comparison_assembly_id as string;
  let reportId = '';

  try {
    const sectionResponse = await page.request.post('/api/comparison-item-nodes', {
      data: { assembly_id: assemblyId, node_type: 'section', node_label: `${marker} 大类` },
    });
    const sectionPayload = await sectionResponse.json();
    expect(sectionPayload.code, sectionPayload.message).toBe(0);
    const sectionId = sectionPayload.data.id as string;
    const itemResponse = await page.request.post('/api/comparison-item-nodes', {
      data: { assembly_id: assemblyId, parent_id: sectionId, node_type: 'item', node_label: `${marker} 细项` },
    });
    const itemPayload = await itemResponse.json();
    expect(itemPayload.code, itemPayload.message).toBe(0);

    for (const objectName of ['对象 A', '对象 B']) {
      const objectResponse = await page.request.post('/api/comparison-objects', {
        data: { assembly_id: assemblyId, task_id: taskId, object_name: objectName, object_type: 'product_model' },
      });
      const objectPayload = await objectResponse.json();
      expect(objectPayload.code, objectPayload.message).toBe(0);
    }

    await page.goto(`/tasks/${taskId}?tab=comparison`);
    const deleteObjectB = page.getByRole('button', { name: '删除对象 对象 B', exact: true });
    await expect(deleteObjectB).toBeVisible();
    await deleteObjectB.click();
    await expect.poll(async () => {
      const response = await page.request.get(`/api/comparison-matrix?assembly_id=${assemblyId}`);
      const payload = await response.json();
      return payload.data.objects.map((object: { object_name: string }) => object.object_name);
    }).toEqual(['对象 A']);

    const deactivateResponse = await page.request.post(`/api/comparison-assemblies/${assemblyId}/deactivate`, {
      data: { reason: 'e2e_report_visibility' },
    });
    const deactivatePayload = await deactivateResponse.json();
    expect(deactivatePayload.code, deactivatePayload.message).toBe(0);
    expect(deactivatePayload.data.status).toBe('archived');

    const reportResponse = await page.request.post('/api/reports', { data: { task_id: taskId } });
    const reportPayload = await reportResponse.json();
    expect(reportPayload.code, reportPayload.message).toBe(0);
    reportId = reportPayload.data.id as string;
    const headerResponse = await page.request.get(`/api/reports/${reportId}/header`);
    const headerPayload = await headerResponse.json();
    expect(headerPayload.data.availableTabs).not.toContain('matrix');

    const snapshotResponse = await page.request.post('/api/report-snapshots', {
      data: { assembly_id: assemblyId, report_type: 'comparison_report' },
    });
    expect(snapshotResponse.status()).toBe(409);
  } finally {
    if (reportId) await page.request.delete(`/api/reports/${reportId}`);
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
