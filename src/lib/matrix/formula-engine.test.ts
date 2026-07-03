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

console.log('formula-engine parser tests passed');
