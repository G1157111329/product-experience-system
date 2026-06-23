import assert from 'node:assert/strict';
import {
  allocateEditedCopyFileName,
  allocateMaterialFileName,
  toBeijingTimestampBase,
} from '../src/lib/material-naming';

const fixedUtc = new Date('2026-06-23T06:08:30.000Z');

assert.equal(
  toBeijingTimestampBase(fixedUtc),
  '20260623140830',
  'UTC time should be converted to Beijing timestamp base',
);

assert.equal(
  allocateMaterialFileName({
    now: fixedUtc,
    extension: 'png',
    existingFileNames: [],
  }),
  '2026062314083001.png',
  'first material in a second should use sequence 01',
);

assert.equal(
  allocateMaterialFileName({
    now: fixedUtc,
    extension: 'mp4',
    existingFileNames: ['2026062314083001.png'],
  }),
  '2026062314083002.mp4',
  'image and video should share the same same-second sequence',
);

assert.equal(
  allocateMaterialFileName({
    now: fixedUtc,
    extension: 'webp',
    existingFileNames: Array.from({ length: 99 }, (_, index) => `20260623140830${String(index + 1).padStart(2, '0')}.png`),
  }),
  '2026062314083101.webp',
  'sequence should roll to next second after 99 assets',
);

assert.equal(
  allocateEditedCopyFileName({
    originalFileName: '2026062314083002.png',
    existingFileNames: ['2026062314083002.png'],
  }),
  '2026062314083002（副）.png',
  'first edited copy should use Chinese copy suffix',
);

assert.equal(
  allocateEditedCopyFileName({
    originalFileName: '2026062314083002.png',
    existingFileNames: ['2026062314083002.png', '2026062314083002（副）.png'],
  }),
  '2026062314083002（副2）.png',
  'second edited copy should increment Chinese copy suffix',
);

console.log('Material naming contract check passed');
