import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

async function run() {
  let mediaModule: typeof import('@/components/reports/report-media-grid');
  try {
    mediaModule = await import('@/components/reports/report-media-grid');
  } catch {
    assert.fail('semantic report media grid must export mediaPresentation and visibleMedia');
  }

  const { mediaPresentation, visibleMedia } = mediaModule;
  assert.deepEqual(mediaPresentation('primary'), {
    limit: 6,
    imageAspect: '4/3',
    videoAspect: '16/9',
    minWidth: 112,
    maxWidth: null,
  });
  assert.deepEqual(
    { minWidth: mediaPresentation('evidence').minWidth, maxWidth: mediaPresentation('evidence').maxWidth },
    { minWidth: 80, maxWidth: 80 },
    'supporting evidence must remain visually secondary to primary evidence',
  );
  assert.equal(mediaPresentation('evidence').limit, 4);
  assert.equal(mediaPresentation('appendix').limit, 4);
  assert.equal(mediaPresentation('compact').limit, 2);

  const items = Array.from({ length: 5 }, (_, index) => ({
    id: `media-${index + 1}`,
    name: `素材 ${index + 1}`,
    type: index === 1 ? 'video' : 'image',
    url: `/uploads/media-${index + 1}.jpg`,
  }));
  assert.deepEqual(visibleMedia(items, 'compact'), { items: items.slice(0, 2), remaining: 3 });
  assert.deepEqual(visibleMedia(items, 'compact', true), { items, remaining: 0 });
  assert.deepEqual(visibleMedia(items, 'compact', false), { items: items.slice(0, 2), remaining: 3 });

  const mediaRecord = mediaModule as unknown as Record<string, (...args: never[]) => unknown>;
  assert.equal(typeof mediaRecord.mediaExpansionSignature, 'function', 'grid must expose its stable expansion signature');
  const signature = mediaRecord.mediaExpansionSignature as unknown as (
    role: string,
    items: Array<{ id: string; url: string }>,
    carrier?: string,
  ) => string;
  assert.notEqual(signature('primary', items, 'report-a'), signature('primary', items, 'report-b'));
  assert.notEqual(signature('primary', items, 'report-a'), signature('evidence', items, 'report-a'));
  assert.equal(typeof mediaRecord.isMediaExpanded, 'function');
  const isExpanded = mediaRecord.isMediaExpanded as unknown as (
    expandedSignature: string | null,
    currentSignature: string,
  ) => boolean;
  const reportASignature = signature('primary', items, 'report-a');
  const reportBSignature = signature('primary', items, 'report-b');
  assert.equal(isExpanded(reportASignature, reportASignature), true);
  assert.equal(isExpanded(reportASignature, reportBSignature), false, 'rerendering report B must start collapsed');
  assert.equal(visibleMedia(Array.from({ length: 7 }), 'primary', isExpanded(reportASignature, reportBSignature)).items.length, 6);

  const gridSource = readFileSync(resolve(process.cwd(), 'src/components/reports/report-media-grid.tsx'), 'utf8');
  const previewSource = readFileSync(resolve(process.cwd(), 'src/components/reports/report-media-preview.tsx'), 'utf8');
  assert.match(gridSource, /usePresignedUrls/);
  assert.match(gridSource, /mediaExpansionSignature/);
  assert.match(gridSource, /gridTemplateColumns/);
  assert.doesNotMatch(previewSource, /usePresignedUrls/);
  assert.match(previewSource, /resolvedUrl/);

  const { buildReportDetailModel } = await import('@/lib/server/report-detail');
  const semanticMedia = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index + 1}`,
    file_name: `${prefix}-${index + 1}.jpg`,
    file_url: `/uploads/${prefix}-${index + 1}.jpg`,
    material_type: 'image',
  }));
  const model = buildReportDetailModel({
    report: {
      id: 'semantic-report',
      title: 'Semantic report',
      report_type: 'single_report',
      content: {
        recipes: [{
          id: 'recipe-1',
          name: 'Recipe',
          effect_materials: semanticMedia('effect', 7),
          recipe_steps: [{ id: 'step-1', step_number: 1, operation: 'Run', materials: semanticMedia('step', 5) }],
        }],
      },
    },
    issues: [{
      id: 'issue-1',
      title: 'Issue',
      materials: semanticMedia('rectification', 5),
      _reEvaluations: [{ id: 'reeval-1', description: 'Retest', materials: semanticMedia('reeval', 5) }],
    }],
  });
  const functionSection = model.sections.find((section) => section.key === 'function_effect');
  const effectBlock = functionSection?.blocks.find((block) => block.id === 'function_effect:media');
  assert.equal((effectBlock as { mediaRole?: string } | undefined)?.mediaRole, 'primary');
  assert.deepEqual(effectBlock?.media?.map((item) => item.id), semanticMedia('effect', 7).map((item) => item.id));
  const stepItem = functionSection?.blocks.find((block) => block.id === 'function_effect:step-evidence')?.items?.[0];
  assert.equal((stepItem as { mediaRole?: string } | undefined)?.mediaRole, 'evidence');

  const issueSection = model.sections.find((section) => section.key === 'issue_closure');
  const issueItem = issueSection?.blocks.find((block) => block.id === 'issue_closure:details')?.items?.[0];
  assert.equal((issueItem as { mediaRole?: string } | undefined)?.mediaRole, 'appendix');
  assert.equal(issueItem?.media?.some((item) => item.id.startsWith('reeval-')), false, 'issue evidence must not merge re-evaluation media');
  const reevalItem = issueSection?.blocks.find((block) => block.id === 'issue_closure:re-evaluations')?.items?.[0];
  assert.equal((reevalItem as { mediaRole?: string } | undefined)?.mediaRole, 'appendix');

  const rendererSource = readFileSync(resolve(process.cwd(), 'src/components/reports/report-section-block-renderer.tsx'), 'utf8');
  assert.match(rendererSource, /item\.mediaRole/);
  assert.match(rendererSource, /block\.mediaRole/);
  assert.match(rendererSource, /role="compact"/);

  const frozenModule = await import('@/lib/report-frozen-view') as unknown as Record<string, unknown>;
  assert.equal(typeof frozenModule.overlayEvidenceWithoutReEvaluations, 'function');
  const withoutReevaluations = frozenModule.overlayEvidenceWithoutReEvaluations as (
    evidence: Array<{ id: string; name: string; type: string; url: string }>,
    evaluations: unknown[],
  ) => Array<{ id: string }>;
  assert.deepEqual(
    withoutReevaluations(
      [
        { id: 'rectification', name: 'r', type: 'image', url: '/uploads/r.jpg' },
        { id: 'reeval', name: 'e', type: 'image', url: '/uploads/e.jpg' },
      ],
      [{ materials: [{ id: 'reeval', file_name: 'e', material_type: 'image', file_url: '/uploads/e.jpg' }] }],
    ).map((item) => item.id),
    ['rectification'],
  );
  const buildFrozenReportViewModel = frozenModule.buildFrozenReportViewModel as (
    input: Record<string, unknown>,
    options: { audience: 'internal' | 'share' },
  ) => { issues: Array<{ liveOverlay: { evidence: Array<{ id: string }> } }> };
  const frozenWithDuplicateOverlay = buildFrozenReportViewModel({
    report: { id: 'overlay-report', title: 'Overlay', report_type: 'single_report', content: {} },
    snapshot: null,
    snapshotResolution: 'legacy_latest',
    issues: [{
      id: 'overlay-issue',
      title: 'Overlay issue',
      _reEvaluations: [{ materials: [{ id: 'reeval', file_name: 'e', material_type: 'image', file_url: '/uploads/e.jpg' }] }],
    }],
    issueEvidence: {
      'overlay-issue': [
        { id: 'rectification', name: 'r', type: 'image', url: '/uploads/r.jpg' },
        { id: 'reeval', name: 'e', type: 'image', url: '/uploads/e.jpg' },
      ],
    },
  }, { audience: 'share' });
  assert.deepEqual(frozenWithDuplicateOverlay.issues[0]?.liveOverlay.evidence.map((item) => item.id), ['rectification']);

  console.log('report media semantics tests passed');
}

void run();
