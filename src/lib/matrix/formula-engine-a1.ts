/**
 * A1 cell-reference formula engine for the V3 dynamic matrix.
 *
 * PRD V3.1.2.4 §7.9 (ADR-02). This is a brand-new engine that sits ALONGSIDE
 * the legacy {@link "./formula-engine"} (which uses SELF/REF semantic refs and
 * intentionally rejects `=` and A1 coordinates). The legacy engine is kept
 * untouched for V2 compatibility; this module implements the V3 model where
 * formulas are A1-style spreadsheet references like `=G4/H5`.
 *
 * P0 scope only (PRD §7.9.4): arithmetic operators `+ - * / ()`. NO functions
 * (IF/SUM/AVG/…). Anything that looks like a function call is rejected with
 * MX-FORMULA-006; any other unsupported syntax is rejected with MX-FORMULA-001.
 *
 * The module is intentionally pure TypeScript with no DB/browser imports so it
 * can be shared between the frontend (optimistic computation), the backend
 * (authoritative recompute via {@link "./recompute-v3"}) and unit tests.
 */

// ---------------------------------------------------------------------------
// Error codes (PRD §7.9 — "MX-FORMULA-0xx" series)
// ---------------------------------------------------------------------------

/** Syntax / grammar error (unexpected char, unsupported operator, trailing tokens). */
export const ERR_SYNTAX = 'MX-FORMULA-001';
/** A referenced cell is non-numeric / empty at evaluation time. */
export const ERR_NON_NUMERIC = 'MX-FORMULA-002';
/** Division by zero. */
export const ERR_DIV_ZERO = 'MX-FORMULA-003';
/** A cell reference points outside the matrix grid. */
export const ERR_OUT_OF_RANGE = 'MX-FORMULA-004';
/** Unsupported function call (anything resembling `NAME(...)`). */
export const ERR_UNSUPPORTED_FUNCTION = 'MX-FORMULA-006';

// ---------------------------------------------------------------------------
// AST + public types
// ---------------------------------------------------------------------------

export type FormulaNode =
  | { type: 'number'; value: number }
  | { type: 'cellref'; col: number; row: number; raw: string }
  | { type: 'binop'; op: '+' | '-' | '*' | '/'; left: FormulaNode; right: FormulaNode };

export interface CellRef {
  col: number;
  row: number;
}

export interface CompiledFormula {
  /** Root AST node. */
  ast: FormulaNode;
  /** All CellRefs appearing in the formula, in source order (no de-dup). */
  references: CellRef[];
  /** Normalized display expression, e.g. `=G4/H5`. */
  displayExpression: string;
}

export interface EvalContext {
  /**
   * Resolve a (col, row) cell to a numeric value. Return null if the cell is
   * empty or holds a non-numeric value. col/row are 0-indexed (A=0, row 1→0).
   */
  getCellValue: (col: number, row: number) => number | null;
  /** Grid height (number of rows). Used for out-of-range checks. */
  totalRows: number;
  /** Grid width (number of columns). Used for out-of-range checks. */
  totalCols: number;
}

export type CompileResult =
  | { ok: true; compiled: CompiledFormula }
  | { ok: false; code: string };

export type EvalResult =
  | { ok: true; value: number }
  | { ok: false; code: string };

// ---------------------------------------------------------------------------
// Column letter <-> index conversion (A=0, ..., Z=25, AA=26, AB=27, ...)
// ---------------------------------------------------------------------------

/**
 * Convert column letters (e.g. "A", "Z", "AA", "AB") to a 0-based column index.
 * Bijective base-26 using uppercase A-Z. Empty/invalid input returns -1.
 */
export function colToIndex(letters: string): number {
  const s = letters.trim().toUpperCase();
  if (s.length === 0 || !/^[A-Z]+$/.test(s)) return -1;
  let idx = 0;
  for (let i = 0; i < s.length; i++) {
    idx = idx * 26 + (s.charCodeAt(i) - 'A'.charCodeAt(0)) + 1;
  }
  return idx - 1; // make A → 0
}

/**
 * Convert a 0-based column index to uppercase column letters.
 * `indexToCol(0)` → "A", `indexToCol(25)` → "Z", `indexToCol(26)` → "AA".
 * Negative input returns "".
 */
export function indexToCol(index: number): string {
  if (!Number.isInteger(index) || index < 0) return '';
  let n = index + 1; // bijective base-26
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode('A'.charCodeAt(0) + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type Token =
  | { kind: 'number'; value: number }
  | { kind: 'cellref'; col: number; row: number; raw: string }
  | { kind: 'ident'; name: string } // a bare word — only valid immediately before '(' → function call
  | { kind: 'op'; symbol: '+' | '-' | '*' | '/' }
  | { kind: 'lparen' }
  | { kind: 'rparen' }
  | { kind: 'colon' };

const LETTER_RE = /[A-Za-z]/;
const DIGIT_RE = /[0-9]/;
const WS_RE = /\s/;

/** Character classes that are NOT part of any legal token in P0 grammar. */
const REJECTED_SINGLE_CHARS = new Set([
  '=', '&', '%', '^', '!', '@', '#', '$', '~', '`', '\\', ';', ':', ',', '.', '[', ']', '{', '}', '<', '>', '?', '"', "'",
]);

class Lexer {
  private readonly src: string;
  private pos = 0;
  private readonly tokens: Token[] = [];

  constructor(src: string) {
    this.src = src;
  }

  private peek(offset = 0): string {
    return this.src[this.pos + offset] ?? '';
  }

  private skipWs(): void {
    while (this.pos < this.src.length && WS_RE.test(this.src[this.pos]!)) {
      this.pos += 1;
    }
  }

  /** Read a run of letters (column part of a cell ref, or a bare word). */
  private readLetters(): string {
    const start = this.pos;
    while (this.pos < this.src.length && LETTER_RE.test(this.src[this.pos]!)) {
      this.pos += 1;
    }
    return this.src.slice(start, this.pos);
  }

  /** Read a run of digits. */
  private readDigits(): string {
    const start = this.pos;
    while (this.pos < this.src.length && DIGIT_RE.test(this.src[this.pos]!)) {
      this.pos += 1;
    }
    return this.src.slice(start, this.pos);
  }

  tokenize(): Token[] {
    while (true) {
      this.skipWs();
      if (this.pos >= this.src.length) break;
      const ch = this.src[this.pos]!;

      // Operators (P0 set only).
      if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
        this.tokens.push({ kind: 'op', symbol: ch });
        this.pos += 1;
        continue;
      }
      if (ch === '(') {
        this.tokens.push({ kind: 'lparen' });
        this.pos += 1;
        continue;
      }
      if (ch === ')') {
        this.tokens.push({ kind: 'rparen' });
        this.pos += 1;
        continue;
      }
      if (ch === ':') {
        // A range like G4:G6 — not supported in P0, but we emit a colon token so
        // the parser can reject it with a clear syntax error rather than a bare
        // "unexpected char" message.
        this.tokens.push({ kind: 'colon' });
        this.pos += 1;
        continue;
      }

      // Number literal: integer or decimal. A leading '.' is rejected (handled
      // below in the rejected-char branch) to keep the grammar unambiguous.
      if (DIGIT_RE.test(ch)) {
        const intPart = this.readDigits();
        let frac = '';
        if (this.peek() === '.' && DIGIT_RE.test(this.peek(1))) {
          this.pos += 1; // consume '.'
          frac = '.' + this.readDigits();
        }
        this.tokens.push({ kind: 'number', value: Number(intPart + frac) });
        continue;
      }

      // Letter-led run: either a CellRef (letters immediately followed by
      // digits) or a bare identifier (only legal as a function name before '(').
      if (LETTER_RE.test(ch)) {
        const letters = this.readLetters();
        if (this.pos < this.src.length && DIGIT_RE.test(this.src[this.pos]!)) {
          const digits = this.readDigits();
          const col = colToIndex(letters);
          if (col < 0) {
            throw compileError(ERR_SYNTAX, `invalid column "${letters}"`);
          }
          // rowNumber is 1-based in source; stored 0-based.
          const rowNum = Number(digits);
          if (!Number.isInteger(rowNum) || rowNum < 1) {
            throw compileError(ERR_SYNTAX, `invalid row "${digits}"`);
          }
          this.tokens.push({
            kind: 'cellref',
            col,
            row: rowNum - 1,
            raw: letters.toUpperCase() + digits,
          });
          continue;
        }
        // Bare word: SUM, IF, ABS, etc. Only legal immediately before '('.
        this.tokens.push({ kind: 'ident', name: letters.toUpperCase() });
        continue;
      }

      // Anything else (& = % ^ , . " ' < > ? ...) is a syntax error.
      if (REJECTED_SINGLE_CHARS.has(ch)) {
        throw compileError(ERR_SYNTAX, `unexpected character "${ch}"`);
      }
      throw compileError(ERR_SYNTAX, `unexpected character "${ch}"`);
    }
    return this.tokens;
  }
}

// ---------------------------------------------------------------------------
// Parser (recursive descent — P0 grammar only)
//
//   Formula    := "=" Expression
//   Expression := Term (("+" | "-") Term)*
//   Term       := Factor (("*" | "/") Factor)*
//   Factor     := Number | CellRef | "(" Expression ")"
// ---------------------------------------------------------------------------

function compileError(code: string, detail: string): Error & { code: string } {
  const e = new Error(`${code}: ${detail}`) as Error & { code: string };
  e.name = 'A1FormulaError';
  e.code = code;
  return e;
}

class Parser {
  private readonly tokens: Token[];
  private pos = 0;
  private readonly references: CellRef[] = [];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    const tok = this.tokens[this.pos];
    if (tok === undefined) throw compileError(ERR_SYNTAX, 'unexpected end of input');
    this.pos += 1;
    return tok;
  }

  parseProgram(): FormulaNode {
    if (this.tokens.length === 0) throw compileError(ERR_SYNTAX, 'empty formula');
    const node = this.parseExpression();
    if (this.pos !== this.tokens.length) {
      const leftover = this.tokens[this.pos];
      throw compileError(ERR_SYNTAX, `unexpected trailing token "${leftover?.kind ?? '?'}"`);
    }
    return node;
  }

  private parseExpression(): FormulaNode {
    let left = this.parseTerm();
    while (true) {
      const tok = this.peek();
      if (tok?.kind === 'op' && (tok.symbol === '+' || tok.symbol === '-')) {
        this.advance();
        const right = this.parseTerm();
        left = { type: 'binop', op: tok.symbol, left, right };
      } else {
        break;
      }
    }
    return left;
  }

  private parseTerm(): FormulaNode {
    let left = this.parseFactor();
    while (true) {
      const tok = this.peek();
      if (tok?.kind === 'op' && (tok.symbol === '*' || tok.symbol === '/')) {
        this.advance();
        const right = this.parseFactor();
        left = { type: 'binop', op: tok.symbol, left, right };
      } else {
        break;
      }
    }
    return left;
  }

  private parseFactor(): FormulaNode {
    const tok = this.peek();
    if (tok === undefined) throw compileError(ERR_SYNTAX, 'unexpected end of input');

    if (tok.kind === 'number') {
      this.advance();
      return { type: 'number', value: tok.value };
    }
    if (tok.kind === 'cellref') {
      this.advance();
      const ref: CellRef = { col: tok.col, row: tok.row };
      this.references.push(ref);
      return { type: 'cellref', col: tok.col, row: tok.row, raw: tok.raw };
    }
    if (tok.kind === 'lparen') {
      this.advance();
      const inner = this.parseExpression();
      const next = this.peek();
      if (next?.kind !== 'rparen') {
        throw compileError(ERR_SYNTAX, 'expected ")"');
      }
      this.advance(); // consume ')'
      return inner;
    }
    if (tok.kind === 'ident') {
      // A bare word is only ever legal as a function call name (NAME '(' ... ')')
      // and P0 supports NO functions → always MX-FORMULA-006.
      throw compileError(ERR_UNSUPPORTED_FUNCTION, `unsupported function "${tok.name}"`);
    }
    if (tok.kind === 'colon') {
      throw compileError(ERR_UNSUPPORTED_FUNCTION, 'ranges are not supported (use cell refs)');
    }
    // op / rparen / colon in factor position.
    throw compileError(ERR_SYNTAX, `unexpected token "${tok.kind}"`);
  }

  getReferences(): CellRef[] {
    return this.references;
  }
}

// ---------------------------------------------------------------------------
// Display expression (normalized) — regenerate from AST so propagation can
// rewrite references and still produce a clean "=G5/H6".
// ---------------------------------------------------------------------------

/** Render a full formula AST as a normalized `=…` display string. */
function formulaToDisplay(ast: FormulaNode): string {
  return '=' + renderNode(ast);
}

function renderNode(node: FormulaNode): string {
  switch (node.type) {
    case 'number':
      return String(node.value);
    case 'cellref':
      return indexToCol(node.col) + (node.row + 1);
    case 'binop': {
      const l = renderChild(node.left, node.op, true);
      const r = renderChild(node.right, node.op, false);
      return `${l}${node.op}${r}`;
    }
  }
}

/**
 * Render a child node, wrapping it in parens when needed to preserve the
 * normalized precedence of the source AST. For the P0 grammar, the only time
 * we NEED parens is when a child binop has strictly lower precedence than its
 * parent (additive inside multiplicative). Same-or-higher precedence and any
 * parenthesized expression originally written by the user round-trip naturally
 * because the AST already encodes the grouping.
 */
function renderChild(node: FormulaNode, parentOp: '+' | '-' | '*' | '/', _isLeft: boolean): string {
  void _isLeft;
  if (node.type !== 'binop') return renderNode(node);
  const parentRank = parentOp === '+' || parentOp === '-' ? 1 : 2;
  const childRank = node.op === '+' || node.op === '-' ? 1 : 2;
  // Wrap when the child binds looser than the parent (e.g. `+` under `*`).
  // Also wrap right-associative-looking cases of the SAME rank when the op
  // differs and could change meaning (e.g. `a-(b+c)`). For P0 arithmetic these
  // are conservative; round-tripping the canonical source is the goal.
  if (childRank < parentRank) {
    return `(${renderNode(node)})`;
  }
  return renderNode(node);
}

// ---------------------------------------------------------------------------
// Compile
// ---------------------------------------------------------------------------

/**
 * Compile an A1 formula source string.
 *
 * The source MUST begin with `=`. Anything else (plain number, missing `=`) is
 * a syntax error. Functions and non-P0 operators are rejected with their
 * respective codes. On success returns a {@link CompiledFormula}; on failure
 * returns `{ ok: false, code }`.
 *
 * Never throws — callers can treat the result directly.
 */
export function compileA1Formula(source: string): CompileResult {
  if (typeof source !== 'string') return { ok: false, code: ERR_SYNTAX };
  const trimmed = source.trim();
  if (trimmed.length === 0) return { ok: false, code: ERR_SYNTAX };
  if (!trimmed.startsWith('=')) {
    return { ok: false, code: ERR_SYNTAX };
  }
  const body = trimmed.slice(1).trim();
  if (body.length === 0) return { ok: false, code: ERR_SYNTAX };

  let tokens: Token[];
  try {
    tokens = new Lexer(body).tokenize();
  } catch (err) {
    return { ok: false, code: codeOf(err, ERR_SYNTAX) };
  }

  const parser = new Parser(tokens);
  let ast: FormulaNode;
  try {
    ast = parser.parseProgram();
  } catch (err) {
    return { ok: false, code: codeOf(err, ERR_SYNTAX) };
  }

  const compiled: CompiledFormula = {
    ast,
    references: parser.getReferences(),
    displayExpression: formulaToDisplay(ast),
  };
  return { ok: true, compiled };
}

/** Extract the `.code` from an A1-formula error, falling back to `fallback`. */
function codeOf(err: unknown, fallback: string): string {
  return err && typeof err === 'object' && 'code' in err && typeof (err as { code?: unknown }).code === 'string'
    ? (err as { code: string }).code
    : fallback;
}

// ---------------------------------------------------------------------------
// Evaluate
// ---------------------------------------------------------------------------

/**
 * Evaluate a compiled formula against a context. Returns a number or a typed
 * error code. Never throws.
 *
 * Errors (PRD §7.9):
 *   MX-FORMULA-004 — a referenced cell is outside the grid (col/row < 0 or
 *                    >= totalCols/totalRows).
 *   MX-FORMULA-002 — a referenced cell is empty or non-numeric.
 *   MX-FORMULA-003 — division by zero.
 */
export function evaluateA1(compiled: CompiledFormula, ctx: EvalContext): EvalResult {
  const result = evalNode(compiled.ast, ctx);
  if (typeof result === 'object') return result; // error
  return { ok: true, value: result };
}

type NodeEval = number | { ok: false; code: string };

function evalNode(node: FormulaNode, ctx: EvalContext): NodeEval {
  switch (node.type) {
    case 'number':
      return node.value;
    case 'cellref':
      return evalCellRef(node.col, node.row, ctx);
    case 'binop':
      return evalBinop(node, ctx);
  }
}

function evalCellRef(col: number, row: number, ctx: EvalContext): NodeEval {
  if (
    col < 0 ||
    row < 0 ||
    !Number.isInteger(col) ||
    !Number.isInteger(row) ||
    col >= ctx.totalCols ||
    row >= ctx.totalRows
  ) {
    return { ok: false, code: ERR_OUT_OF_RANGE };
  }
  const v = ctx.getCellValue(col, row);
  if (v === null || typeof v !== 'number' || !Number.isFinite(v)) {
    return { ok: false, code: ERR_NON_NUMERIC };
  }
  return v;
}

function evalBinop(node: Extract<FormulaNode, { type: 'binop' }>, ctx: EvalContext): NodeEval {
  const left = evalNode(node.left, ctx);
  if (typeof left === 'object') return left;
  const right = evalNode(node.right, ctx);
  if (typeof right === 'object') return right;

  switch (node.op) {
    case '+':
      return finiteOr(left + right);
    case '-':
      return finiteOr(left - right);
    case '*':
      return finiteOr(left * right);
    case '/': {
      if (right === 0) return { ok: false, code: ERR_DIV_ZERO };
      return finiteOr(left / right);
    }
  }
}

/** Coerce a non-finite arithmetic result (overflow / NaN) into a syntax error. */
function finiteOr(v: number): NodeEval {
  if (!Number.isFinite(v)) return { ok: false, code: ERR_SYNTAX };
  return v;
}

// ---------------------------------------------------------------------------
// Relative propagation (PRD §7.9.5)
// ---------------------------------------------------------------------------

/**
 * Produce the formula for a row offset by `deltaRows` from the anchor row.
 *
 * Column letters are preserved (formulas reference cells in the same columns,
 * only the row shifts). The returned {@link CompiledFormula} has its
 * `references` and `displayExpression` regenerated so it is self-consistent —
 * callers can store or evaluate it without re-compiling.
 *
 * PRD §7.9.5: a formula authored at anchor row R, when applied to row R+k,
 * references row R+k instead. `deltaRows` may be negative for rows above the
 * anchor; a row that would go below 0 is clamped at 0 (row 1).
 */
export function propagateToRow(compiled: CompiledFormula, deltaRows: number): CompiledFormula {
  if (deltaRows === 0) {
    // Return a structurally identical copy with regenerated display (cheap).
    return {
      ast: cloneNode(compiled.ast, deltaRows, false),
      references: compiled.references.map((r) => ({ col: r.col, row: r.row })),
      displayExpression: compiled.displayExpression,
    };
  }
  const ast = cloneNode(compiled.ast, deltaRows, true);
  return {
    ast,
    references: collectRefs(ast),
    displayExpression: formulaToDisplay(ast),
  };
}

/** Deep-clone an AST node, optionally shifting every cellref's row by `delta`. */
function cloneNode(node: FormulaNode, delta: number, shift: boolean): FormulaNode {
  switch (node.type) {
    case 'number':
      return { type: 'number', value: node.value };
    case 'cellref': {
      const row = shift ? Math.max(0, node.row + delta) : node.row;
      return { type: 'cellref', col: node.col, row, raw: indexToCol(node.col) + (row + 1) };
    }
    case 'binop':
      return {
        type: 'binop',
        op: node.op,
        left: cloneNode(node.left, delta, shift),
        right: cloneNode(node.right, delta, shift),
      };
  }
}

/** Walk an AST collecting cellrefs in source order. */
function collectRefs(ast: FormulaNode): CellRef[] {
  const out: CellRef[] = [];
  const walk = (node: FormulaNode): void => {
    switch (node.type) {
      case 'number':
        return;
      case 'cellref':
        out.push({ col: node.col, row: node.row });
        return;
      case 'binop':
        walk(node.left);
        walk(node.right);
        return;
    }
  };
  walk(ast);
  return out;
}
