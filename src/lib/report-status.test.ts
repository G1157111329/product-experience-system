import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// @ts-expect-error -- focused TS execution resolves the explicit extension at runtime.
import { getReportStatusPresentation } from './report-status.ts';

test('keeps a draft report visibly distinct from a completed report', () => {
  assert.deepEqual(getReportStatusPresentation('草稿'), {
    code: 'draft',
    label: '草稿',
  });
  assert.deepEqual(getReportStatusPresentation('已完成'), {
    code: 'completed',
    label: '已完成',
  });
});

test('preserves unknown persisted report statuses instead of silently relabeling them', () => {
  assert.deepEqual(getReportStatusPresentation('自定义状态'), {
    code: '自定义状态',
    label: '自定义状态',
  });
});

test('maps the report lifecycle codes to distinct Chinese labels', () => {
  assert.equal(getReportStatusPresentation('pending_review').label, '待审');
  assert.equal(getReportStatusPresentation('published').label, '已发布');
  assert.equal(getReportStatusPresentation('archived').label, '已归档');
});

test('shared status badge never relabels a draft as completed', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/components/app/status-badge.tsx'), 'utf8');
  assert.doesNotMatch(source, /label === '草稿' \? '已完成'/);
  assert.match(source, /待审/);
  assert.match(source, /已发布/);
  assert.match(source, /已归档/);
});
