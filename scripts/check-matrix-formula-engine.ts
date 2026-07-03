import assert from 'node:assert/strict';
import { tokenize, parse, parseErrorToCode } from '../src/lib/matrix/formula-engine';

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

console.log('contract ok');
