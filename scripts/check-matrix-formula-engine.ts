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

// Re-run golden cases plus reject-offset and reject-webservice.
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

// Evaluator contract: juice_yield
{
  const compiled = compileFormula('ROUND(SELF("juice_weight") / SELF("ingredient_weight"), 4)');
  const result = evaluate(compiled, {
    self: (k) => k === 'juice_weight' ? { value: 558.7, unit: 'g' } : k === 'ingredient_weight' ? { value: 1193.1, unit: 'g' } : null,
    refSameGroup: () => null, groupAggregate: () => null,
  });
  assert.ok(result.ok && Math.abs(result.value - 0.4683) < 1e-6);
}

// Dependency graph contract
{
  const deps = buildDependencyGraph('SELF("pure_juice_yield") + SELF("pulp_ratio")');
  // Note: deps.sort() is default JS lexicographic sort ('l' < 'r'), so the
  // sorted order is pulp_ratio before pure_juice_yield. The .sort() keeps the
  // assertion order-independent; the literal below is the actual sorted order.
  assert.deepEqual(deps.sort(), ['pulp_ratio', 'pure_juice_yield']);
}

console.log('contract ok');
