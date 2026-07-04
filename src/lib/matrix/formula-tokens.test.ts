import assert from 'node:assert/strict';
import { tokensToDsl, tokensToExampleKeys, type FormulaToken } from './formula-tokens';
import { compileFormula } from './formula-engine';

// Simple division: SELF("a") / SELF("b")
{
  const tokens: FormulaToken[] = [
    { kind: 'self', dimensionKey: 'a' },
    { kind: 'op', symbol: '/' },
    { kind: 'self', dimensionKey: 'b' },
  ];
  const dsl = tokensToDsl(tokens);
  assert.equal(dsl, 'SELF("a") / SELF("b")');
  // Round-trip: the generated DSL must compile.
  compileFormula(dsl);  // throws if invalid
}

// ROUND wrapper: ROUND(SELF("a") / SELF("b"), 4)
{
  const tokens: FormulaToken[] = [
    { kind: 'round', decimals: 4, inner: [
      { kind: 'self', dimensionKey: 'a' },
      { kind: 'op', symbol: '/' },
      { kind: 'self', dimensionKey: 'b' },
    ] },
  ];
  const dsl = tokensToDsl(tokens);
  assert.equal(dsl, 'ROUND(SELF("a") / SELF("b"), 4)');
  compileFormula(dsl);
}

// Number literal + arithmetic
{
  const tokens: FormulaToken[] = [
    { kind: 'self', dimensionKey: 'x' },
    { kind: 'op', symbol: '*' },
    { kind: 'number', value: 2 },
  ];
  assert.equal(tokensToDsl(tokens), 'SELF("x") * 2');
}

// Example keys: only SELF tokens contribute
{
  const tokens: FormulaToken[] = [
    { kind: 'round', decimals: 4, inner: [
      { kind: 'self', dimensionKey: 'juice_weight' },
      { kind: 'op', symbol: '/' },
      { kind: 'self', dimensionKey: 'ingredient_weight' },
    ] },
  ];
  assert.deepEqual(tokensToExampleKeys(tokens).sort(), ['ingredient_weight', 'juice_weight']);
}

// Empty token stream
{
  assert.equal(tokensToDsl([]), '');
  assert.deepEqual(tokensToExampleKeys([]), []);
}

console.log('formula-tokens tests passed');
