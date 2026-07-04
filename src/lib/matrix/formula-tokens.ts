export type FormulaToken =
  | { kind: 'self'; dimensionKey: string }
  | { kind: 'number'; value: number }
  | { kind: 'op'; symbol: '+' | '-' | '*' | '/' | '^' }
  | { kind: 'round'; inner: FormulaToken[]; decimals: number };

/**
 * Convert a token stream to DSL source. The DSL parser ignores whitespace,
 * so single-space separation is fine. Output must round-trip through
 * compileFormula (verified in tests).
 */
export function tokensToDsl(tokens: FormulaToken[]): string {
  return tokens.map(tokenToString).join(' ');
}

function tokenToString(t: FormulaToken): string {
  switch (t.kind) {
    case 'self':
      return `SELF("${t.dimensionKey}")`;
    case 'number':
      return String(t.value);
    case 'op':
      return t.symbol;
    case 'round':
      return `ROUND(${tokensToDsl(t.inner)}, ${t.decimals})`;
  }
}

/**
 * Collect all dimension keys referenced via SELF in the token stream.
 * Used to render example-input fields in the FormulaBuilder preview.
 */
export function tokensToExampleKeys(tokens: FormulaToken[]): string[] {
  const keys: string[] = [];
  for (const t of tokens) {
    if (t.kind === 'self') keys.push(t.dimensionKey);
    else if (t.kind === 'round') keys.push(...tokensToExampleKeys(t.inner));
  }
  return Array.from(new Set(keys));
}
