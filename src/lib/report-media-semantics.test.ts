import assert from 'node:assert/strict';

async function run() {
  let mediaModule: typeof import('@/components/reports/report-media-grid');
  try {
    mediaModule = await import('@/components/reports/report-media-grid');
  } catch {
    assert.fail('semantic report media grid must export mediaPresentation and visibleMedia');
  }

  const { mediaPresentation, visibleMedia } = mediaModule;
  assert.deepEqual(mediaPresentation('primary'), { limit: 6, imageAspect: '4/3', videoAspect: '16/9' });
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

  console.log('report media semantics tests passed');
}

void run();
