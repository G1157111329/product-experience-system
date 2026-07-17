import assert from 'node:assert/strict';
import {
  createSubjectiveRatingScale,
  formatSubjectiveRatingScale,
  resolveSubjectiveRatingScale,
  validateSubjectiveMeanScore,
} from './subjective-rating-scale';

const sevenPoint = createSubjectiveRatingScale(7);
assert.equal(sevenPoint.max_score, 7);
assert.equal(sevenPoint.meanings['1'], '');
assert.equal(Object.keys(sevenPoint.meanings).length, 7);

const configured = {
  max_score: 5 as const,
  meanings: {
    '1': '十分不满意',
    '2': '比较不满意',
    '3': '一般',
    '4': '比较满意',
    '5': '十分满意',
  },
};
assert.equal(formatSubjectiveRatingScale(configured), '5分制：1分=十分不满意；2分=比较不满意；3分=一般；4分=比较满意；5分=十分满意');

const legacyScale = resolveSubjectiveRatingScale([
  { subjective_score: 1, subjective_rating: '十分不满意' },
  { subjective_score: 5, subjective_rating: '十分满意' },
]);
assert.equal(legacyScale?.max_score, 5);
assert.equal(legacyScale?.meanings['5'], '十分满意');

assert.equal(validateSubjectiveMeanScore('4.25', configured).valid, true);
assert.equal(validateSubjectiveMeanScore('5.1', configured).valid, false);
assert.equal(validateSubjectiveMeanScore('0', configured).valid, false);

console.log('subjective rating scale tests passed');
