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
