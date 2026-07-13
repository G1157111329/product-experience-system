import { test, expect } from '@playwright/test';
import { loginForE2E } from './auth-session';

test('detail and anonymous share expose equivalent frozen reader content', async ({ browser }) => {
  const authenticated = await browser.newPage();
  await loginForE2E(authenticated, 'dockeradmin', 'DockerLocal2026');
  const response = await authenticated.request.post('/api/reports/share', {
    data: { report_id: 'golden-report-single', duration: '7d' },
  });
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();

  const anonymous = await browser.newPage();
  try {
    await authenticated.goto('/reports/golden-report-single');
    await anonymous.goto(`/reports/share/${payload.data.share_token}`);

    const detailReader = authenticated.getByTestId('frozen-report-reader');
    const shareReader = anonymous.getByTestId('frozen-report-reader');
    await expect(detailReader).toBeVisible();
    await expect(shareReader).toBeVisible();

    const detailLabels = await detailReader.getByRole('tab').allTextContents();
    const shareLabels = await shareReader.getByRole('tab').allTextContents();
    expect(shareLabels).toEqual(detailLabels);

    for (let index = 0; index < detailLabels.length; index += 1) {
      const label = detailLabels[index];
      await detailReader.getByRole('tab').nth(index).click();
      await shareReader.getByRole('tab').nth(index).click();
      const detailIds = await detailReader.locator('[role="tabpanel"]:not([hidden]) [data-content-id]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-content-id')));
      const shareIds = await shareReader.locator('[role="tabpanel"]:not([hidden]) [data-content-id]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-content-id')));
      expect(shareIds, `content identifiers for ${label}`).toEqual(detailIds);
    }
    await expect(anonymous.getByRole('button', { name: /整改|管理问题/ })).toHaveCount(0);
  } finally {
    await authenticated.request.delete(`/api/reports/share/list?id=${encodeURIComponent(payload.data.id)}`);
    await authenticated.close();
    await anonymous.close();
  }
});

test('comparison reader renders frozen objects rows and cell values', async ({ browser }) => {
  const authenticated = await browser.newPage();
  await loginForE2E(authenticated, 'dockeradmin', 'DockerLocal2026');
  const response = await authenticated.request.post('/api/reports/share', {
    data: { report_id: 'golden-report-comparison', duration: '7d' },
  });
  const payload = await response.json();
  const anonymous = await browser.newPage();
  try {
    await anonymous.goto(`/reports/share/${payload.data.share_token}`);
    await anonymous.getByRole('tab', { name: '对比矩阵' }).click();
    await expect(anonymous.getByText('中式面团效果')).toBeVisible();
    await expect(anonymous.getByText('成团稳定，表面较光滑')).toBeVisible();
    await expect(anonymous.getByText('成团略慢，边缘粘附')).toBeVisible();
    await expect(anonymous.getByRole('button', { name: '导出PDF' })).toBeVisible();
  } finally {
    await authenticated.request.delete(`/api/reports/share/list?id=${encodeURIComponent(payload.data.id)}`);
    await authenticated.close();
    await anonymous.close();
  }
});

test('anonymous reader presigns raw object keys without requesting them as page-relative media', async ({ page }) => {
  const rawRequests: string[] = [];
  let presignBody: Record<string, unknown> | null = null;
  page.on('request', (request) => {
    if (request.url().includes('garage/private/raw.jpg')) rawRequests.push(request.url());
  });
  await page.route('**/api/reports/share?token=raw-media', async (route) => {
    await route.fulfill({ json: {
      code: 0,
      data: {
        frozenViewModel: {
          snapshotResolution: 'anchored',
          header: { id: 'raw-report', title: 'Raw media report', reportType: 'single_report', status: 'published', productModel: null },
          tabs: ['summary', 'issues'],
          summary: { text: 'Raw summary', aiSummary: null },
          issues: [{ id: 'raw-issue', title: 'Raw issue', details: '', level: '', sourceType: '', evidence: [{ id: 'raw-material', name: 'raw.jpg', type: 'image', url: 'garage/private/raw.jpg' }], liveOverlay: { status: '', rectification: '', reEvaluations: [], evidence: [] } }],
          matrix: null,
          functionEffects: [],
          capabilities: { canManageIssues: false, canShare: false, canExport: true },
        },
        siblingReports: [],
        siblingFrozenViewModels: {},
      },
    } });
  });
  await page.route('**/api/materials/presign', async (route) => {
    presignBody = route.request().postDataJSON();
    await route.fulfill({ json: { code: 0, data: { 'garage/private/raw.jpg': 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==' } } });
  });

  await page.goto('/reports/share/raw-media');
  await page.getByRole('tab', { name: '问题' }).click();
  await expect.poll(() => presignBody).not.toBeNull();
  expect(presignBody).toMatchObject({ paths: ['garage/private/raw.jpg'], share_token: 'raw-media' });
  expect(rawRequests).toEqual([]);
  const remoteThumbnail = page.locator('[role="button"]').filter({ has: page.locator('img[src^="data:image/gif"]') });
  await expect(remoteThumbnail).toHaveCount(1);
  await remoteThumbnail.click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('anonymous reader preserves a successful local-public presign result', async ({ page }) => {
  const localPublicRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/uploads/garage/private/local.jpg')) localPublicRequests.push(request.url());
  });
  await page.route('**/api/reports/share?token=local-media', async (route) => {
    await route.fulfill({ json: {
      code: 0,
      data: {
        frozenViewModel: {
          snapshotResolution: 'anchored',
          header: { id: 'local-report', title: 'Local media report', reportType: 'single_report', status: 'published', productModel: null },
          tabs: ['summary', 'issues'], summary: { text: 'Summary', aiSummary: null },
          issues: [{ id: 'local-issue', title: 'Local issue', details: '', level: '', sourceType: '', evidence: [{ id: 'local-material', name: 'local.jpg', type: 'image', url: 'garage/private/local.jpg' }], liveOverlay: { status: '', rectification: '', reEvaluations: [], evidence: [] } }],
          matrix: null, functionEffects: [], capabilities: { canManageIssues: false, canShare: false, canExport: true },
        }, siblingReports: [], siblingFrozenViewModels: {},
      },
    } });
  });
  await page.route('**/api/materials/presign', async (route) => {
    await route.fulfill({ json: { code: 0, data: { 'garage/private/local.jpg': '/uploads/garage/private/local.jpg' } } });
  });
  await page.route('**/uploads/garage/private/local.jpg', async (route) => {
    await route.fulfill({ contentType: 'image/gif', body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64') });
  });

  await page.goto('/reports/share/local-media');
  await page.getByRole('tab', { name: '问题' }).click();
  await expect(page.getByText('素材不可用')).toHaveCount(0);
  const localThumbnail = page.locator('[role="button"]').filter({ has: page.locator('img[src="/uploads/garage/private/local.jpg"]') });
  await expect(localThumbnail).toHaveCount(1);
  await expect.poll(() => localPublicRequests.length).toBeGreaterThan(0);
  await localThumbnail.click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

for (const failure of [{ name: 'empty result', status: 200 }, { name: 'server error', status: 500 }]) {
  test(`failed media presign settles as unavailable for ${failure.name}`, async ({ page }) => {
    const rawRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('garage/private/failed.jpg')) rawRequests.push(request.url());
    });
    await page.route('**/api/reports/share?token=failed-media', async (route) => {
      await route.fulfill({ json: {
        code: 0,
        data: {
          frozenViewModel: {
            snapshotResolution: 'anchored',
            header: { id: 'failed-report', title: 'Failed media report', reportType: 'single_report', status: 'published', productModel: null },
            tabs: ['summary', 'issues'], summary: { text: 'Summary', aiSummary: null },
            issues: [{ id: 'failed-issue', title: 'Failed issue', details: '', level: '', sourceType: '', evidence: [{ id: 'failed-material', name: 'failed.jpg', type: 'image', url: 'garage/private/failed.jpg' }], liveOverlay: { status: '', rectification: '', reEvaluations: [], evidence: [] } }],
            matrix: null, functionEffects: [], capabilities: { canManageIssues: false, canShare: false, canExport: true },
          }, siblingReports: [], siblingFrozenViewModels: {},
        },
      } });
    });
    await page.route('**/api/materials/presign', async (route) => {
      if (failure.status === 500) await route.fulfill({ status: 500, json: { code: 1 } });
      else await route.fulfill({ json: { code: 0, data: {} } });
    });

    await page.goto('/reports/share/failed-media');
    await page.getByRole('tab', { name: '问题' }).click();
    const unavailableLabel = page.getByText('素材不可用');
    await expect(unavailableLabel).toBeVisible();
    const unavailableThumbnail = unavailableLabel.locator('..');
    await expect(unavailableThumbnail).not.toHaveAttribute('role', 'button');
    await expect(unavailableThumbnail).not.toHaveAttribute('tabindex', '0');
    await unavailableThumbnail.click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(rawRequests).toEqual([]);
  });
}

const responsiveV2Projection = {
  matrixId: 'responsive-v2',
  schema: {
    name: '响应式 V2 数据矩阵',
    dimensions: [
      { dimensionKey: 'temperature', displayName: '温度', columnGroup: 'observed' },
      { dimensionKey: 'yield', displayName: '出汁率', columnGroup: 'calculated' },
    ],
  },
  viewport: { totalGroups: 1, totalRows: 1 },
  groups: [{
    id: 'responsive-group',
    label: '苹果组',
    rows: [{
      id: 'responsive-row-v2',
      subject: { label: '样品 A' },
      metrics: { temperature: { display: '25℃' }, yield: { value: 0 } },
      slots: { result: { summary: '效果稳定' }, process: { note: '运行无抖动' }, issues: { count: 0, severitySummary: [] } },
      evidence: { primaryCount: 0, media: [] },
    }],
  }],
};

const responsiveV3Projection = {
  matrixProjectionVersion: 'v3',
  matrixId: 'responsive-v3',
  matrixName: '响应式 V3 数据矩阵',
  frozenAt: '2026-07-13T00:00:00.000Z',
  columns: [
    { id: 'temperature', zone: 'detail_dimension', label: '温度', unitText: '℃', displayOrder: 1 },
    { id: 'evaluation', zone: 'evaluation', label: '效果评价', displayOrder: 2 },
  ],
  rows: [{ id: 'responsive-row-v3', level1Label: '使用效果', level2Label: '出汁表现', level3Label: '苹果', visibleRowIndex: 1, cells: { temperature: '0', evaluation: '清透' } }],
  cellMedia: {},
  narratives: [{ blockType: 'summary', content: '整体表现稳定', showInReport: true }],
  issuePoints: [{ id: 'responsive-issue', leafRowId: 'responsive-row-v3', columnId: 'evaluation', leafRowIndex: 1, issueText: '果渣偏多', status: 'open', materialIds: [] }],
  summary: { totalRows: 1, totalColumns: 2, filledCells: 2 },
};

function responsiveMatrixModel(kind: 'data_v2' | 'data_v3') {
  return {
    snapshotResolution: 'anchored',
    header: { id: `responsive-${kind}`, title: `${kind} report`, reportType: 'single_report', status: 'published', productModel: null },
    tabs: ['summary', 'data_matrix'],
    summary: { text: 'Summary', aiSummary: null },
    issues: [],
    matrix: { kind, projection: kind === 'data_v2' ? responsiveV2Projection : responsiveV3Projection },
    functionEffects: [],
    capabilities: { canManageIssues: false, canShare: false, canExport: true },
  };
}

async function assertNoScrollMatrixView(page: import('@playwright/test').Page, expectedText: string) {
  await page.getByRole('tab', { name: '数据矩阵' }).click();
  const view = page.getByTestId('report-data-matrix-read-view');
  await expect(view).toBeVisible();
  await expect(view.getByText(expectedText, { exact: false })).toBeVisible();
  expect(await view.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBeTruthy();
  await expect(view.locator('table, input, textarea, [draggable="true"], .overflow-x-auto')).toHaveCount(0);
}

for (const matrixCase of [
  { kind: 'data_v2' as const, expected: '苹果组 / 样品 A' },
  { kind: 'data_v3' as const, expected: '使用效果 / 出汁表现 / 苹果' },
]) {
  test(`${matrixCase.kind} detail and share use the responsive no-scroll matrix reader`, async ({ browser }) => {
    const model = responsiveMatrixModel(matrixCase.kind);
    const detail = await browser.newPage();
    const share = await browser.newPage();
    await loginForE2E(detail, 'dockeradmin', 'DockerLocal2026');
    await detail.route(`**/api/reports/responsive-${matrixCase.kind}/detail`, (route) => route.fulfill({ json: { code: 0, data: { frozenViewModel: model } } }));
    await share.route(`**/api/reports/share?token=responsive-${matrixCase.kind}`, (route) => route.fulfill({ json: { code: 0, data: { frozenViewModel: model, siblingReports: [], siblingFrozenViewModels: {} } } }));

    try {
      for (const width of [390, 768, 1024]) {
        await detail.setViewportSize({ width, height: 900 });
        await share.setViewportSize({ width, height: 900 });
        await detail.goto(`/reports/responsive-${matrixCase.kind}`);
        await share.goto(`/reports/share/responsive-${matrixCase.kind}`);
        await assertNoScrollMatrixView(detail, matrixCase.expected);
        await assertNoScrollMatrixView(share, matrixCase.expected);
        await expect(detail.getByTestId('report-data-matrix-read-view')).toContainText(matrixCase.kind === 'data_v2' ? '0' : '清透');
        await expect(share.getByTestId('report-data-matrix-read-view')).toContainText(matrixCase.kind === 'data_v2' ? '0' : '清透');
      }
    } finally {
      await detail.close();
      await share.close();
    }
  });
}
