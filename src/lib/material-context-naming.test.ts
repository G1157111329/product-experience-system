import assert from 'node:assert/strict';
import { buildContextMaterialFileName } from './material-context-naming';

assert.equal(
  buildContextMaterialFileName({ baseName: '杯盖边缘不应割手', extension: 'mp4', sequence: 2 }),
  '杯盖边缘不应割手2.mp4',
);
assert.equal(
  buildContextMaterialFileName({ baseName: '豆浆', extension: '.jpg', sequence: 1 }),
  '豆浆1.jpg',
);
assert.equal(
  buildContextMaterialFileName({ baseName: '对象A*外观*杯盖', extension: 'mov', sequence: 3 }),
  '对象A*外观*杯盖3.mov',
);
assert.equal(
  buildContextMaterialFileName({ baseName: '清洁/收纳_杯体', extension: 'webm', sequence: 4 }),
  '清洁_收纳_杯体4.webm',
);

console.log('material context naming tests passed');
