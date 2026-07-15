import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createDeletionFlowController,
  deletionImpactItems,
  loadDeletionImpact,
  type DeletionImpact,
} from './deletion-impact-ui';

async function main() {
  const expected: DeletionImpact = {
    records: 1,
    childNodes: 2,
    cells: 3,
    materialLinks: 4,
    issues: 5,
  };
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const impact = await loadDeletionImpact('comparison_section', 'section / 1', async (input, init) => {
    calls.push({ input: String(input), init });
    return new Response(JSON.stringify({ code: 0, message: 'success', data: expected }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  assert.deepEqual(impact, expected);
  assert.equal(calls.length, 1);
  assert.match(calls[0].input, /kind=comparison_section/);
  assert.match(calls[0].input, /id=section(?:%20|\+)%2F(?:%20|\+)1/);
  assert.equal(calls[0].init?.method, 'GET');
  assert.deepEqual(deletionImpactItems(expected).map((item) => item.value), [1, 2, 3, 4, 5]);

  await assert.rejects(
    loadDeletionImpact('record', 'record-a', async () => new Response(
      JSON.stringify({ code: 1, message: '无权访问' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    )),
    /无权访问/,
  );

  const dialog = readFileSync(resolve(process.cwd(), 'src/components/deletion-impact-dialog.tsx'), 'utf8');
  assert.match(dialog, /deletionImpactItems\(impact\)\.map/);
  assert.match(dialog, /data-impact-field=\{item\.key\}/);
  assert.match(dialog, /AlertDialogCancel/);
  assert.match(dialog, /event\.preventDefault\(\);[\s\S]*void onConfirm\(\)/);
  const hook = readFileSync(resolve(process.cwd(), 'src/hooks/use-deletion-flow-controller.ts'), 'utf8');
  assert.match(hook, /useSyncExternalStore\(controller\.subscribe, controller\.getState, controller\.getState\)/);
  assert.match(hook, /createDeletionFlowController/);

  let deleteCalls = 0;
  let refreshCalls = 0;
  let errors: unknown[] = [];
  let deleteFailure = false;
  let refreshFailure = false;
  const controller = createDeletionFlowController({
    load: async () => expected,
    remove: async () => { deleteCalls += 1; if (deleteFailure) throw new Error('DELETE 500'); },
    refresh: async () => { refreshCalls += 1; if (refreshFailure) throw new Error('refresh failed'); },
    onError: (error) => { errors.push(error); },
  });
  const target = { kind: 'record' as const, id: 'record-a', label: '检查记录 A' };
  await controller.request(target);
  assert.equal(controller.getState().phase, 'confirming');
  controller.cancel();
  assert.equal(deleteCalls, 0, 'cancel sends zero DELETE requests');

  await controller.request(target);
  await Promise.all([controller.confirm(), controller.confirm()]);
  assert.equal(deleteCalls, 1, 'double confirm shares one DELETE request');
  assert.equal(refreshCalls, 1);
  assert.equal(controller.getState().phase, 'idle');

  deleteFailure = true;
  await controller.request(target);
  await controller.confirm();
  assert.equal(controller.getState().phase, 'confirming', 'DELETE 500 preserves pending confirmation');
  assert.equal(controller.getState().pending?.id, target.id);
  deleteFailure = false;
  controller.cancel();

  refreshFailure = true;
  await controller.request(target);
  await controller.confirm();
  assert.equal(controller.getState().phase, 'idle', 'refresh failure cannot restore a deleted pending target');
  const callsAfterSuccess = deleteCalls;
  await controller.confirm();
  assert.equal(deleteCalls, callsAfterSuccess, 'refresh failure cannot cause a repeated DELETE');
  assert.match(String((errors.at(-1) as Error)?.message), /refresh failed/);

  errors = [];
  const loadFailureController = createDeletionFlowController({
    load: async () => { throw new Error('impact 500'); },
    remove: async () => { throw new Error('must not delete'); },
    refresh: () => undefined,
    onError: (error) => { errors.push(error); },
  });
  const loading = loadFailureController.request(target);
  assert.equal(loadFailureController.getState().phase, 'loading');
  await loading;
  assert.equal(loadFailureController.getState().phase, 'idle');
  assert.equal(loadFailureController.getState().pending, null);
  assert.match(String((errors[0] as Error)?.message), /impact 500/);

  const page = readFileSync(resolve(process.cwd(), 'src/app/(main)/tasks/[id]/page.tsx'), 'utf8');
  assert.match(page, /useDeletionFlowController/);
  assert.match(page, /toast\.success\('检查记录已删除'\)/);
  assert.doesNotMatch(page, /handleDeleteRecipe[\s\S]{0,240}\bconfirm\(/);

  const senses = readFileSync(resolve(process.cwd(), 'src/app/(main)/tasks/[id]/components/senses-input-workspace.tsx'), 'utf8');
  assert.match(senses, /useDeletionFlowController/);
  assert.match(senses, /attemptNavigation/);
  assert.match(senses, /disabled=\{deletion\.state\.phase === 'loading' \|\| deletion\.state\.phase === 'deleting'\}/);
  assert.match(senses, /role="status" aria-busy="true"/);

  const comparison = readFileSync(resolve(process.cwd(), 'src/app/(main)/tasks/[id]/components/comparison-workspace.tsx'), 'utf8');
  assert.match(comparison, /useDeletionFlowController/);
  assert.match(comparison, /const kind:[^=]+ = isSectionNode\(node\) \? 'comparison_section' : 'comparison_item'/);
  assert.match(comparison, /attemptNavigation/);
  assert.match(comparison, /aria-busy=\{nodeDeletion\.state\.phase === 'loading'\}/);
  assert.match(page, /aria-busy=\{recipeDeletion\.state\.phase === 'loading'\}/);

  console.log('deletion impact UI tests passed');
}

void main();
