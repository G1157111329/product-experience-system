import assert from 'node:assert/strict';
import { tokenize, parse, parseErrorToCode, compileFormula, evaluate, buildDependencyGraph } from '../src/lib/matrix/formula-engine';

function catcher(fn: () => unknown): unknown {
  try {
    fn();
    return null;
  } catch (e) {
    return e;
  }
}

// V2 legacy SELF/REF engine (kept for V2 matrix compatibility).
{
  const tokens = tokenize('SELF("juice_weight")');
  assert.equal(tokens.length, 1);
}
assert.equal(
  parseErrorToCode(catcher(() => parse('=OFFSET(A1,1,1)'))),
  'MATRIX_FORMULA_PARSE_ERROR',
);
assert.equal(
  parseErrorToCode(catcher(() => parse('WEBSERVICE("http://x")'))),
  'MATRIX_FORMULA_PARSE_ERROR',
);

{
  const compiled = compileFormula('ROUND(SELF("juice_weight") / SELF("ingredient_weight"), 4)');
  const result = evaluate(compiled, {
    self: (k) => k === 'juice_weight' ? { value: 558.7, unit: 'g' } : k === 'ingredient_weight' ? { value: 1193.1, unit: 'g' } : null,
    refSameGroup: () => null, groupAggregate: () => null,
  });
  assert.ok(result.ok && Math.abs(result.value - 0.4683) < 1e-6);
}

{
  const deps = buildDependencyGraph('SELF("pure_juice_yield") + SELF("pulp_ratio")');
  assert.ok(deps.includes('pure_juice_yield'));
  assert.ok(deps.includes('pulp_ratio'));
}

console.log('legacy contract ok');
