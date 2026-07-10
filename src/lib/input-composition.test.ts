import assert from 'node:assert/strict';
import { createCompositionController } from './input-composition';

const controller = createCompositionController();

controller.start();
assert.equal(controller.change('haochi1'), null, 'IME interim input must not save');
assert.equal(controller.change('haochi1好'), null, 'IME interim input must remain deferred');
assert.equal(controller.end('好吃'), '好吃', 'composition end must emit only committed Chinese text');
assert.equal(controller.change('好吃！'), '好吃！', 'ordinary input must still save immediately');

controller.start();
assert.equal(controller.blur('haochi2'), null, 'blur during composition must not save an interim value');
assert.equal(controller.end('好吃吗'), '好吃吗');

console.log('input composition tests passed');
