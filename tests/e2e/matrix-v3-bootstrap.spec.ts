import { expect, test } from '@playwright/test';
import { loginForE2E } from './auth-session';

test.beforeEach(async ({ page }) => {
  await loginForE2E(page, 'dockeradmin', 'DockerLocal2026');
});

test('a new matrix initializes its hierarchy before adding a second-level detail', async ({ page }) => {
  const marker = `E2E matrix hierarchy ${Date.now()}`;
  let taskId = '';
  let matrixId = '';

  try {
    const taskResponse = await page.request.post('/api/tasks', {
      data: {
        task_name: marker,
        product_category: '电动',
        product: '破壁机',
        product_model: marker,
      },
    });
    const taskPayload = await taskResponse.json();
    expect(taskPayload.code, taskPayload.message).toBe(0);
    taskId = taskPayload.data.id as string;

    const matrixResponse = await page.request.post(`/api/v1/tasks/${taskId}/matrices`, {
      data: { name: `${marker} - matrix` },
    });
    expect(matrixResponse.status()).toBe(201);
    const matrixPayload = await matrixResponse.json();
    matrixId = matrixPayload.data.id as string;

    const projectionResponse = await page.request.get(`/api/v1/matrices/${matrixId}/v3-projection`);
    const projectionPayload = await projectionResponse.json();
    expect(projectionPayload.code, projectionPayload.message).toBe(0);
    expect(projectionPayload.data.hierarchy).toHaveLength(1);

    const addResponse = await page.request.post(`/api/v1/matrices/${matrixId}/hierarchy-nodes`, {
      data: {
        level: 2,
        parentId: projectionPayload.data.hierarchy[0].id,
        nodeLabel: '第二级细项',
      },
    });
    const addPayload = await addResponse.json();
    expect(addPayload.code, addPayload.message).toBe(0);
    expect(addPayload.data.leafRow).toBeTruthy();
  } finally {
    if (matrixId) {
      await page.request.post(`/api/v1/matrices/${matrixId}/lifecycle`, {
        data: { action: 'archive', reason: 'e2e_cleanup' },
      });
    }
    if (taskId) await page.request.delete(`/api/tasks/${taskId}`);
  }
});
