/**
 * Contract tests for the A1 formula engine (PRD V3.1.2.4 §7.9).
 *
 * Run with: `tsx src/lib/matrix/formula-engine-a1.test.ts`
 * (The repo uses self-running node:assert scripts, not vitest.)
 */
import assert from 'node:assert/strict';
import {
  compileA1Formula,
  evaluateA1,
  propagateToRow,
  colToIndex,
  indexToCol,
  type CompiledFormula,
  type EvalContext,
  ERR_SYNTAX,
  ERR_UNSUPPORTED_FUNCTION,
  ERR_NON_NUMERIC,
  ERR_DIV_ZERO,
  ERR_OUT_OF_RANGE,
} from './formula-engine-a1';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mustCompile(src: string): CompiledFormula {
  const r = compileA1Formula(src);
  assert.ok(r.ok, `expected "${src}" to compile, got code ${!r.ok ? r.code : '?'}`);
  return r.compiled;
}

function mustFailCode(src: string): string {
  const r = compileA1Formula(src);
  assert.ok(!r.ok, `expected "${src}" to fail compilation`);
  return r.code;
}

/** Build an EvalContext over a simple 2D grid. Out-of-grid reads → null. */
function gridCtx(grid: (number | null)[][]): EvalContext {
  const totalRows = grid.length;
  const totalCols = totalRows > 0 ? grid[0]!.length : 0;
  return {
    getCellValue: (col, row) => {
      if (row < 0 || row >= totalRows || col < 0 || col >= totalCols) return null;
      const v = grid[row]![col];
      return v ?? null;
    },
    totalRows,
    totalCols,
  };
}

function refs(c: CompiledFormula): { col: number; row: number }[] {
  return c.references.map((r) => ({ col: r.col, row: r.row }));
}

// ---------------------------------------------------------------------------
// Column letter <-> index
// ---------------------------------------------------------------------------

assert.equal(colToIndex('A'), 0);
assert.equal(colToIndex('B'), 1);
assert.equal(colToIndex('Z'), 25);
assert.equal(colToIndex('AA'), 26);
assert.equal(colToIndex('AB'), 27);
assert.equal(colToIndex('AZ'), 51);
assert.equal(colToIndex('BA'), 52);
assert.equal(indexToCol(0), 'A');
assert.equal(indexToCol(1), 'B');
assert.equal(indexToCol(25), 'Z');
assert.equal(indexToCol(26), 'AA');
assert.equal(indexToCol(27), 'AB');
assert.equal(indexToCol(52), 'BA');

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

// =G4/H5 → references [{col:6,row:3},{col:7,row:4}]
{
  const c = mustCompile('=G4/H5');
  assert.deepEqual(refs(c), [
    { col: 6, row: 3 },
    { col: 7, row: 4 },
  ]);
  assert.equal(c.displayExpression, '=G4/H5');
  assert.equal(c.ast.type, 'binop');
}

// =G4 (single cell ref, no operator) — legal.
{
  const c = mustCompile('=G4');
  assert.deepEqual(refs(c), [{ col: 6, row: 3 }]);
  assert.equal(c.displayExpression, '=G4');
}

// Multi-column refs (AB12).
{
  const c = mustCompile('=AB12');
  assert.deepEqual(refs(c), [{ col: 27, row: 11 }]);
  assert.equal(c.displayExpression, '=AB12');
}

// =6/2 → constant arithmetic, no refs.
{
  const c = mustCompile('=6/2');
  assert.deepEqual(refs(c), []);
}

// =(G4+H4)/I4 → nested AST.
//   G=6 row3, H=7 row3, I=8 row3
{
  const c = mustCompile('=(G4+H4)/I4');
  assert.deepEqual(refs(c), [
    { col: 6, row: 3 },
    { col: 7, row: 3 },
    { col: 8, row: 3 },
  ]);
  assert.equal(c.ast.type, 'binop');
  assert.equal(c.ast.op, '/');
  // Left of '/' should be the parenthesized (G4+H4) addition.
  const left = c.ast.left;
  assert.equal(left.type, 'binop');
  assert.equal(left.op, '+');
  assert.equal(c.displayExpression, '=(G4+H4)/I4');
}

// Precedence: =2+3*4 must parse as 2+(3*4).
{
  const c = mustCompile('=2+3*4');
  assert.equal(c.ast.type, 'binop');
  if (c.ast.type === 'binop') {
    assert.equal(c.ast.op, '+', 'top-level op should be +');
    assert.equal(c.ast.right.type, 'binop');
    if (c.ast.right.type === 'binop') assert.equal(c.ast.right.op, '*');
  }
}

// ---------------------------------------------------------------------------
// Rejections
// ---------------------------------------------------------------------------

// =SUM(G4:G6) → unsupported function (and a range colon).
assert.equal(mustFailCode('=SUM(G4:G6)'), ERR_UNSUPPORTED_FUNCTION);

// A bare function call at the start of the expression also → unsupported
// function. (Cases like `=IF(...)` / `=AVG(...)` whose body contains non-P0
// chars such as `>` or `,` may instead trip the lexer first as MX-FORMULA-001;
// either code is acceptable since they are not part of the P0 contract. We
// assert only the unambiguous leading-function form here.)
assert.equal(mustFailCode('=ABS(G4)'), ERR_UNSUPPORTED_FUNCTION);
assert.equal(mustFailCode('=SUM(G4)'), ERR_UNSUPPORTED_FUNCTION);

// =G4&H5 (string concat) → syntax error.
assert.equal(mustFailCode('=G4&H5'), ERR_SYNTAX);

// Missing leading '=' → syntax error.
assert.equal(mustFailCode('G4/H5'), ERR_SYNTAX);

// Empty → syntax error.
assert.equal(mustFailCode(''), ERR_SYNTAX);
assert.equal(mustFailCode('='), ERR_SYNTAX);

// Comparison operators not in P0 → syntax error.
assert.equal(mustFailCode('=G4>H5'), ERR_SYNTAX);

// Power operator not in P0 → syntax error.
assert.equal(mustFailCode('=G4^2'), ERR_SYNTAX);

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

// =6/2 → 3
{
  const c = mustCompile('=6/2');
  const r = evaluateA1(c, gridCtx([]));
  assert.ok(r.ok, '6/2 should evaluate');
  if (r.ok) assert.equal(r.value, 3);
}

// =2+3*4 → 14 (precedence)
{
  const c = mustCompile('=2+3*4');
  const r = evaluateA1(c, gridCtx([]));
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.value, 14);
}

// =(2+3)*4 → 20 (parens)
{
  const c = mustCompile('=(2+3)*4');
  const r = evaluateA1(c, gridCtx([]));
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.value, 20);
}

// =G4/H5 where G4=10, H5=2 → 5
//   G=col6, row4→index3 ; H=col7, row5→index4
//   grid needs row index 3..4 and col index 6..7 populated.
{
  // grid[row][col]; build 5 rows x 8 cols, set grid[3][6]=10, grid[4][7]=2
  const ROWS = 5;
  const COLS = 8;
  const grid: (number | null)[][] = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => null),
  );
  grid[3]![6] = 10; // G4
  grid[4]![7] = 2; // H5
  const c = mustCompile('=G4/H5');
  const r = evaluateA1(c, gridCtx(grid));
  assert.ok(r.ok, 'G4/H5 should evaluate with populated grid');
  if (r.ok) assert.equal(r.value, 5);
}

// Divide by zero → MX-FORMULA-003
{
  const c = mustCompile('=6/0');
  const r = evaluateA1(c, gridCtx([]));
  assert.ok(!r.ok && r.code === ERR_DIV_ZERO, `expected div-zero, got ${r.ok ? r.value : r.code}`);
}

// Division by a cell that resolves to 0 → div zero.
{
  const ROWS = 2;
  const COLS = 2;
  const grid: (number | null)[][] = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => null),
  );
  grid[0]![0] = 6; // A1
  grid[0]![1] = 0; // B1
  const c = mustCompile('=A1/B1');
  const r = evaluateA1(c, gridCtx(grid));
  assert.ok(!r.ok && r.code === ERR_DIV_ZERO);
}

// Non-numeric ref (empty cell) → MX-FORMULA-002
{
  const c = mustCompile('=A1+B1');
  const r = evaluateA1(c, gridCtx([[null, null]]));
  assert.ok(!r.ok && r.code === ERR_NON_NUMERIC);
}

// Out of range → MX-FORMULA-004
//   A1 (col0,row0) is fine, but reference Z9 on a 2x2 grid is out of range.
{
  const c = mustCompile('=Z9');
  // 2x2 grid → totalCols=2,totalRows=2; Z is col25, row9→index8 → OOR.
  const r = evaluateA1(c, gridCtx([[1, 2], [3, 4]]));
  assert.ok(!r.ok && r.code === ERR_OUT_OF_RANGE);
}

// Negative-row clamp at evaluation is not required; OOR covers it. Confirm a
// valid in-range single ref evaluates to its value.
{
  const c = mustCompile('=A1');
  const r = evaluateA1(c, gridCtx([[42]]));
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.value, 42);
}

// ---------------------------------------------------------------------------
// Relative propagation
// ---------------------------------------------------------------------------

// =G4/H5 at delta=1 → G5/H6 (references shift by 1).
{
  const c = mustCompile('=G4/H5');
  const p = propagateToRow(c, 1);
  assert.deepEqual(refs(p), [
    { col: 6, row: 4 },
    { col: 7, row: 5 },
  ]);
  assert.equal(p.displayExpression, '=G5/H6');
}

// =G4/H5 at delta=2 → G6/H7
{
  const c = mustCompile('=G4/H5');
  const p = propagateToRow(c, 2);
  assert.deepEqual(refs(p), [
    { col: 6, row: 5 },
    { col: 7, row: 6 },
  ]);
  assert.equal(p.displayExpression, '=G6/H7');
}

// delta=0 → unchanged, but still a valid compiled formula.
{
  const c = mustCompile('=G4/H5');
  const p = propagateToRow(c, 0);
  assert.deepEqual(refs(p), refs(c));
  assert.equal(p.displayExpression, '=G4/H5');
}

// Propagated formula remains evaluable against an appropriately shifted grid.
{
  const c = mustCompile('=A1/A2');
  const p = propagateToRow(c, 1); // → A2/A3
  assert.equal(p.displayExpression, '=A2/A3');
  // grid rows: A2=row1=10, A3=row2=2 → 5
  const r = evaluateA1(p, gridCtx([[null], [10], [2]]));
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.value, 5);
}

// Negative delta clamps row to 0 (row 1).
{
  const c = mustCompile('=A2'); // row index 1
  const p = propagateToRow(c, -5); // would be index -4 → clamp 0
  assert.deepEqual(refs(p), [{ col: 0, row: 0 }]);
  assert.equal(p.displayExpression, '=A1');
}

console.log('formula-engine-a1 tests passed');
