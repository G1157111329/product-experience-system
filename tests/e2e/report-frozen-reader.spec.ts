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
    await expect(page.getByText('素材不可用')).toBeVisible();
    await expect(page.getByLabel('素材不可用')).toHaveCount(0);
    expect(rawRequests).toEqual([]);
  });
}
