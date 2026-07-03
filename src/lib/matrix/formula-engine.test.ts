import assert from 'node:assert/strict';
import { tokenize, parse, parseErrorToCode } from './formula-engine';

// Self metric reference
{
  const tokens = tokenize('SELF("juice_weight")');
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].kind, 'self');
  assert.equal((tokens[0] as any).metricKey, 'juice_weight');
}

// Arithmetic with ROUND
{
  const ast = parse('ROUND(SELF("juice_weight") / SELF("ingredient_weight"), 4)');
  assert.equal(ast.kind, 'call');
  if (ast.kind === 'call') {
    assert.equal(ast.fn, 'ROUND');
    assert.equal(ast.args.length, 2);
  }
}

// Reject A1 coordinate
{
  try {
    parse('=H3/G3');
    assert.fail('should have thrown');
  } catch (e) {
    assert.equal(parseErrorToCode(e), 'MATRIX_FORMULA_PARSE_ERROR');
  }
}

// Reject forbidden function
{
  try {
    parse('INDIRECT("H" & ROW())');
    assert.fail('should have thrown');
  } catch (e) {
    assert.equal(parseErrorToCode(e), 'MATRIX_FORMULA_PARSE_ERROR');
  }
}

// Power right-associativity: 2^3^2 = 2^(3^2)
{
  const ast: any = parse('2^3^2');
  assert.equal(ast.kind, 'binop');
  assert.equal(ast.op, '^');
  assert.equal(ast.left.value, 2);
  assert.equal(ast.right.kind, 'binop'); // right side is the nested 3^2
  assert.equal(ast.right.left.value, 3);
  assert.equal(ast.right.right.value, 2);
}

// Subtraction left-associativity: 10-5-2 = (10-5)-2
{
  const ast: any = parse('10-5-2');
  assert.equal(ast.kind, 'binop');
  assert.equal(ast.op, '-');
  assert.equal(ast.left.kind, 'binop'); // left side is 10-5
  assert.equal(ast.left.left.value, 10);
  assert.equal(ast.left.right.value, 5);
  assert.equal(ast.right.value, 2);
}

// Multiplication binds tighter than addition: 2+3*4
{
  const ast: any = parse('2+3*4');
  assert.equal(ast.kind, 'binop');
  assert.equal(ast.op, '+');
  assert.equal(ast.left.value, 2);
  assert.equal(ast.right.kind, 'binop'); // right side is 3*4
  assert.equal(ast.right.op, '*');
}

// Unary minus binds looser than power: -2^2 = -(2^2), NOT (-2)^2
{
  const ast: any = parse('-2^2');
  // Should be 0 - (2^2), i.e. outer binop is '-', left is 0, right is the power
  assert.equal(ast.kind, 'binop');
  assert.equal(ast.op, '-');
  assert.equal(ast.left.value, 0);
  assert.equal(ast.right.kind, 'binop');
  assert.equal(ast.right.op, '^');
}

// Negative exponent still parses: 2^-2
{
  const ast: any = parse('2^-2');
  assert.equal(ast.kind, 'binop');
  assert.equal(ast.op, '^');
  // right side represents -2 (either unary node or 0-2 binop)
  assert.equal(ast.right.kind, 'binop');
  assert.equal(ast.right.op, '-');
  assert.equal(ast.right.left.value, 0);
  assert.equal(ast.right.right.value, 2);
}

// Plain unary minus still works: -5
{
  const ast: any = parse('-5');
  assert.equal(ast.kind, 'binop');
  assert.equal(ast.op, '-');
  assert.equal(ast.left.value, 0);
  assert.equal(ast.right.value, 5);
}

// Double negation: --5 = -(-5) = 5
{
  const ast: any = parse('--5');
  assert.equal(ast.kind, 'binop');
  assert.equal(ast.op, '-');
  assert.equal(ast.left.value, 0);
  assert.equal(ast.right.kind, 'binop');
  assert.equal(ast.right.op, '-');
  assert.equal(ast.right.left.value, 0);
  assert.equal(ast.right.right.value, 5);
}

// Deep nesting rejected cleanly (no raw RangeError leak)
{
  const deep = '('.repeat(500) + '1' + ')'.repeat(500);
  try {
    parse(deep);
    assert.fail('should have thrown');
  } catch (e) {
    assert.equal(parseErrorToCode(e), 'MATRIX_FORMULA_PARSE_ERROR');
  }
}

// ---------------------------------------------------------------------------
// Evaluator half (Task 2)
// ---------------------------------------------------------------------------

import { evaluate, buildDependencyGraph, compileFormula } from './formula-engine';

// Happy path: juice_yield = juice_weight / ingredient_weight
{
  const compiled = compileFormula('ROUND(SELF("juice_weight") / SELF("ingredient_weight"), 4)');
  const result = evaluate(compiled, {
    self: (k) => k === 'juice_weight' ? { value: 558.7, unit: 'g' } : k === 'ingredient_weight' ? { value: 1193.1, unit: 'g' } : null,
    refSameGroup: () => null,
    groupAggregate: () => null,
  });
  assert.ok(result.ok);
  if (result.ok) assert.ok(Math.abs(result.value - 0.4683) < 1e-6, `got ${result.value}`);
}

// Divide by zero
{
  const compiled = compileFormula('SELF("a") / SELF("b")');
  const result = evaluate(compiled, {
    self: (k) => k === 'a' ? { value: 1, unit: 'g' } : k === 'b' ? { value: 0, unit: 'g' } : null,
    refSameGroup: () => null, groupAggregate: () => null,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'MATRIX_CALC_DIVIDE_BY_ZERO');
}

// Missing input
{
  const compiled = compileFormula('SELF("missing")');
  const result = evaluate(compiled, { self: () => null, refSameGroup: () => null, groupAggregate: () => null });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'MATRIX_CALC_INPUT_MISSING');
}

// Dependency graph
{
  const deps = buildDependencyGraph('ROUND(SELF("juice_weight") / SELF("ingredient_weight"), 4)');
  assert.deepEqual(deps.sort(), ['ingredient_weight', 'juice_weight']);
}

console.log('formula-engine parser tests passed');
