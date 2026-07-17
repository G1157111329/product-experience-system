import assert from 'node:assert/strict';
import test from 'node:test';
import { freezeV3MatrixForReport } from './report-projection-v3-adapter';

test('freezes V3 cell video poster and duration with the linked media at its source cell', () => {
  const frozen = freezeV3MatrixForReport({
    matrix: { id: 'matrix-1', name: '数据矩阵' },
    hierarchy: [],
    columns: [{ id: 'column-media', columnZone: 'effect', columnLabel: '效果素材', dataType: 'media', unitText: null, displayOrder: 1, decimalPlaces: null }],
    rows: [{ id: 'leaf-1', level1NodeId: 'level-1', level2NodeId: null, level3NodeId: null, visibleRowIndex: 1 }],
    cells: {},
    narratives: [],
    issuePoints: [],
    cellMedia: {
      'leaf-1:column-media': [{
        linkId: 'link-1', materialId: 'video-1', materialType: 'video', fileName: 'run.mp4',
        filePath: 'task/run.mp4', fileUrl: '/uploads/task/run.mp4', thumbnailUrl: '/uploads/task/run.jpg',
        durationSec: 19, bindingMethod: 'click_select', boundAt: '2026-07-15T00:00:00.000Z',
      }],
    },
    summary: { activeLeafRows: 1, filledCells: 0 },
  } as never);

  assert.deepEqual(frozen.cellMedia['leaf-1:column-media'], [{
    materialId: 'video-1', materialType: 'video', fileName: 'run.mp4',
    filePath: 'task/run.mp4', fileUrl: '/uploads/task/run.mp4', thumbnailUrl: '/uploads/task/run.jpg', durationSec: 19,
  }]);
});
