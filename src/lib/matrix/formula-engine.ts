/**
 * Data-matrix DSL formula engine — parser + evaluator.
 *
 * This module is intentionally pure TypeScript with no Node/browser-specific
 * imports so it can be shared between the frontend (optimistic computation)
 * and the backend (authoritative recompute). Formulas use a restricted DSL of
 * semantic references (SELF / REF / GROUP_* and a small whitelist of scalar
 * functions) rather than Excel A1-style references.
 *
 * The top half is the parser (`tokenize` / `parse`); the bottom half is the
 * evaluator (`compileFormula` / `buildDependencyGraph` / `evaluate`).
 */

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class MatrixFormulaError extends Error {
  readonly code: string;

  constructor(code: string, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'MatrixFormulaError';
    this.code = code;
  }
}

/** Returns the error code when `e` is a {@link MatrixFormulaError}, else null. */
export function parseErrorToCode(e: unknown): string | null {
  return e instanceof MatrixFormulaError ? e.code : null;
}

const PARSE_ERROR_CODE = 'MATRIX_FORMULA_PARSE_ERROR';

function parseError(detail: string): MatrixFormulaError {
  return new MatrixFormulaError(PARSE_ERROR_CODE, detail);
}

/**
 * Generous cap on paren-nesting depth. Authored formulas never approach this;
 * ~6000 is where V8's stack overflows during recursive descent, so 200 leaves
 * a wide safety margin and lets us fail with a typed error instead of leaking
 * a raw `RangeError` (which would defeat {@link parseErrorToCode}).
 */
const MAX_PAREN_DEPTH = 200;

// ---------------------------------------------------------------------------
// Whitelists
// ---------------------------------------------------------------------------

/** Allowed scalar/call functions. Anything else is a parse error. */
const WHITELIST_FUNCTIONS: ReadonlySet<string> = new Set([
  'IF',
  'COALESCE',
  'ROUND',
  'MIN',
  'MAX',
  'ABS',
  'SUM',
  'AVG',
  'UNIT',
  'TO_SECONDS',
]);

/** Valid suffixes for the `GROUP_*` aggregate references. */
const GROUP_AGG_FNS: ReadonlySet<string> = new Set(['AVG', 'SUM', 'MIN', 'MAX', 'COUNT']);

const METRIC_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

const WHITESPACE_RE = /\s/;
const DIGIT_RE = /[0-9]/;
const IDENT_START_RE = /[A-Za-z_]/;
const IDENT_PART_RE = /[A-Za-z0-9_]/;

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

export type Token =
  | { kind: 'self'; metricKey: string }
  | { kind: 'ref'; subjectKey: string; metricKey: string }
  | { kind: 'group_agg'; fn: string; metricKey: string }
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'ident'; name: string }
  | { kind: 'op'; symbol: string }
  | { kind: 'lparen' }
  | { kind: 'rparen' }
  | { kind: 'comma' };

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

class Lexer {
  private readonly src: string;
  private pos = 0;
  private parenDepth = 0;

  constructor(src: string) {
    this.src = src;
  }

  private fail(detail: string): never {
    throw parseError(`${detail} at pos ${this.pos}`);
  }

  private peek(offset = 0): string {
    return this.src[this.pos + offset] ?? '';
  }

  private skipWs(): void {
    while (this.pos < this.src.length && WHITESPACE_RE.test(this.src[this.pos]!)) {
      this.pos += 1;
    }
  }

  /** Reads a `"..."` literal (opening quote is the current char). No escapes. */
  private readQuotedString(): string {
    this.pos += 1; // consume opening quote
    let out = '';
    while (this.pos < this.src.length && this.src[this.pos] !== '"') {
      out += this.src[this.pos];
      this.pos += 1;
    }
    if (this.pos >= this.src.length) {
      this.fail('unterminated string literal');
    }
    this.pos += 1; // consume closing quote
    return out;
  }

  private readIdentRun(): string {
    const start = this.pos;
    while (this.pos < this.src.length && IDENT_PART_RE.test(this.src[this.pos]!)) {
      this.pos += 1;
    }
    return this.src.slice(start, this.pos);
  }

  /** Parses the inner contents of `SELF(...)` — a single quoted metric key. */
  private parseSelfBody(): string {
    this.skipWs();
    if (this.peek() !== '"') this.fail('SELF expects a quoted metric key');
    const key = this.readQuotedString();
    if (!METRIC_KEY_RE.test(key)) this.fail(`invalid metric key "${key}"`);
    this.skipWs();
    if (this.peek() !== ')') this.fail('SELF expects ")"');
    this.pos += 1; // consume ')'
    return key;
  }

  /** Parses the inner contents of `REF(...)` — named subject_key/metric args. */
  private parseRefBody(): { subjectKey: string; metricKey: string } {
    const params: Record<string, string> = {};
    this.skipWs();
    if (this.peek() === ')') {
      this.pos += 1;
      this.fail('REF requires subject_key and metric');
    }
    while (true) {
      this.skipWs();
      if (!IDENT_START_RE.test(this.peek())) this.fail('REF expects a named argument');
      const name = this.readIdentRun();
      this.skipWs();
      if (this.peek() !== '=') this.fail('REF named argument expects "="');
      this.pos += 1; // consume '='
      this.skipWs();
      if (this.peek() !== '"') this.fail('REF named argument expects a string');
      params[name] = this.readQuotedString();
      this.skipWs();
      if (this.peek() === ',') {
        this.pos += 1;
        continue;
      }
      if (this.peek() === ')') {
        this.pos += 1;
        break;
      }
      this.fail('REF expects "," or ")"');
    }
    const subjectKey = params['subject_key'];
    const metricKey = params['metric'];
    if (subjectKey === undefined || metricKey === undefined) {
      this.fail('REF requires both subject_key and metric');
    }
    return { subjectKey, metricKey };
  }

  /** Parses the inner contents of `GROUP_*(...)` — optional named metric arg. */
  private parseGroupBody(): string {
    this.pos += 1; // consume '('
    this.skipWs();
    let metricKey = '';
    if (this.peek() !== ')') {
      if (!IDENT_START_RE.test(this.peek())) this.fail('GROUP aggregate expects "metric=..."');
      const name = this.readIdentRun();
      if (name !== 'metric') this.fail(`GROUP aggregate unknown argument "${name}"`);
      this.skipWs();
      if (this.peek() !== '=') this.fail('GROUP aggregate expects "metric=..."');
      this.pos += 1; // consume '='
      this.skipWs();
      if (this.peek() !== '"') this.fail('GROUP aggregate metric expects a string');
      metricKey = this.readQuotedString();
      if (!METRIC_KEY_RE.test(metricKey)) this.fail(`invalid metric key "${metricKey}"`);
      this.skipWs();
    }
    if (this.peek() !== ')') this.fail('GROUP aggregate expects ")"');
    this.pos += 1; // consume ')'
    return metricKey;
  }

  next(): Token | null {
    this.skipWs();
    if (this.pos >= this.src.length) return null;

    const ch = this.peek();

    // Multi-char operators (matched before single-char forms).
    const two = this.src.slice(this.pos, this.pos + 2);
    if (two === '>=' || two === '<=' || two === '==' || two === '!=') {
      this.pos += 2;
      return { kind: 'op', symbol: two };
    }

    // Single-char operators. NOTE: a bare '=' is intentionally NOT an operator
    // — it is the Excel-formula telltale and must be rejected.
    if (
      ch === '+' ||
      ch === '-' ||
      ch === '*' ||
      ch === '/' ||
      ch === '^' ||
      ch === '>' ||
      ch === '<'
    ) {
      this.pos += 1;
      return { kind: 'op', symbol: ch };
    }

    if (ch === '(') {
      this.parenDepth += 1;
      if (this.parenDepth > MAX_PAREN_DEPTH) {
        this.fail('formula nesting too deep');
      }
      this.pos += 1;
      return { kind: 'lparen' };
    }
    if (ch === ')') {
      if (this.parenDepth > 0) this.parenDepth -= 1;
      this.pos += 1;
      return { kind: 'rparen' };
    }
    if (ch === ',') {
      this.pos += 1;
      return { kind: 'comma' };
    }

    if (ch === '"') {
      return { kind: 'string', value: this.readQuotedString() };
    }

    // Number literal: integer or decimal.
    if (DIGIT_RE.test(ch)) {
      const start = this.pos;
      while (this.pos < this.src.length && DIGIT_RE.test(this.src[this.pos]!)) this.pos += 1;
      if (this.peek() === '.' && DIGIT_RE.test(this.peek(1))) {
        this.pos += 1; // consume '.'
        while (this.pos < this.src.length && DIGIT_RE.test(this.src[this.pos]!)) this.pos += 1;
      }
      return { kind: 'number', value: Number(this.src.slice(start, this.pos)) };
    }

    // Identifier run: keywords (SELF/REF/GROUP_*) and whitelisted function names.
    if (IDENT_START_RE.test(ch)) {
      const word = this.readIdentRun();

      if (word === 'SELF') {
        this.skipWs();
        if (this.peek() !== '(') this.fail('SELF expects "("');
        this.pos += 1; // consume '('
        return { kind: 'self', metricKey: this.parseSelfBody() };
      }
      if (word === 'REF') {
        this.skipWs();
        if (this.peek() !== '(') this.fail('REF expects "("');
        this.pos += 1; // consume '('
        const { subjectKey, metricKey } = this.parseRefBody();
        return { kind: 'ref', subjectKey, metricKey };
      }
      if (word.startsWith('GROUP_')) {
        const fn = word.slice('GROUP_'.length);
        if (!GROUP_AGG_FNS.has(fn)) this.fail(`unknown group aggregate "${word}"`);
        let metricKey = '';
        this.skipWs();
        if (this.peek() === '(') {
          metricKey = this.parseGroupBody();
        }
        return { kind: 'group_agg', fn, metricKey };
      }
      if (WHITELIST_FUNCTIONS.has(word)) {
        return { kind: 'ident', name: word };
      }
      this.fail(`unknown identifier "${word}"`);
    }

    // Anything else (bare '=', '&', A1 coordinates, INDIRECT/OFFSET/etc.)
    // is rejected as a parse error.
    this.fail(`unexpected character "${ch}"`);
  }
}

/** Splits a formula source string into a list of tokens. */
export function tokenize(src: string): Token[] {
  const lexer = new Lexer(src);
  const tokens: Token[] = [];
  while (true) {
    const tok = lexer.next();
    if (tok === null) break;
    tokens.push(tok);
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// AST
// ---------------------------------------------------------------------------

export type Ast =
  | { kind: 'self'; metricKey: string }
  | { kind: 'ref'; subjectKey: string; metricKey: string }
  | { kind: 'group_agg'; fn: string; metricKey: string }
  | { kind: 'num'; value: number }
  | { kind: 'str'; value: string }
  | { kind: 'binop'; op: string; left: Ast; right: Ast }
  | { kind: 'call'; fn: string; args: Ast[] };

// ---------------------------------------------------------------------------
// Parser (recursive descent)
//
// Precedence, loosest to tightest:
//   comparison  ( > >= < <= == != )
//   additive    ( + - )
//   multiplicative ( * / )
//   unary       ( - prefix, binds LOOSER than power so -2^2 == -(2^2) )
//   power       ( ^, right-associative )
//   primary     ( SELF/REF/GROUP_*, number, string, IDENT(args), "( expr )" )
// ---------------------------------------------------------------------------

class Parser {
  private readonly tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    const tok = this.tokens[this.pos];
    if (tok === undefined) this.fail('unexpected end of input');
    this.pos += 1;
    return tok;
  }

  private fail(detail: string): never {
    throw parseError(detail);
  }

  private isOp(symbol: string): boolean {
    const tok = this.peek();
    return tok !== undefined && tok.kind === 'op' && tok.symbol === symbol;
  }

  parseProgram(): Ast {
    if (this.tokens.length === 0) this.fail('empty formula');
    const node = this.parseExpression();
    if (this.pos !== this.tokens.length) this.fail('unexpected trailing tokens');
    return node;
  }

  private parseExpression(): Ast {
    return this.parseComparison();
  }

  private parseComparison(): Ast {
    let left = this.parseAdditive();
    const ops = new Set(['>', '>=', '<', '<=', '==', '!=']);
    while (true) {
      const tok = this.peek();
      if (tok?.kind === 'op' && ops.has(tok.symbol)) {
        this.advance();
        const right = this.parseAdditive();
        left = { kind: 'binop', op: tok.symbol, left, right };
      } else {
        break;
      }
    }
    return left;
  }

  private parseAdditive(): Ast {
    let left = this.parseMultiplicative();
    while (true) {
      const tok = this.peek();
      if (tok?.kind === 'op' && (tok.symbol === '+' || tok.symbol === '-')) {
        this.advance();
        const right = this.parseMultiplicative();
        left = { kind: 'binop', op: tok.symbol, left, right };
      } else {
        break;
      }
    }
    return left;
  }

  private parseMultiplicative(): Ast {
    let left = this.parseUnary();
    while (true) {
      const tok = this.peek();
      if (tok?.kind === 'op' && (tok.symbol === '*' || tok.symbol === '/')) {
        this.advance();
        const right = this.parseUnary();
        left = { kind: 'binop', op: tok.symbol, left, right };
      } else {
        break;
      }
    }
    return left;
  }

  /**
   * Unary prefix `-`/`+`. Sits ABOVE power in the ladder so that `-2^2`
   * parses as `-(2^2)` (i.e. `0 - (2^2)` = -4), matching Excel/Python/math
   * convention, rather than `(-2)^2` = 4.
   */
  private parseUnary(): Ast {
    if (this.isOp('-')) {
      this.advance();
      const operand = this.parseUnary();
      // Desugar unary minus into `0 - operand` (no dedicated unary AST node).
      return { kind: 'binop', op: '-', left: { kind: 'num', value: 0 }, right: operand };
    }
    if (this.isOp('+')) {
      // Unary plus is a no-op; drop it and keep parsing.
      this.advance();
      return this.parseUnary();
    }
    return this.parsePower();
  }

  private parsePower(): Ast {
    const base = this.parsePrimary();
    if (this.isOp('^')) {
      this.advance();
      // Exponent recurses through parseUnary (not parsePower) so that a
      // negative exponent like `2^-2` is accepted — `2 ^ (0 - 2)`. This still
      // preserves right-associativity of `^` because parseUnary falls through
      // to parsePower, so `2^3^2` stays `2^(3^2)`.
      const exponent = this.parseUnary();
      return { kind: 'binop', op: '^', left: base, right: exponent };
    }
    return base;
  }

  private parsePrimary(): Ast {
    const tok = this.peek();
    if (tok === undefined) return this.fail('unexpected end of input');

    if (tok.kind === 'self') {
      this.advance();
      return { kind: 'self', metricKey: tok.metricKey };
    }
    if (tok.kind === 'ref') {
      this.advance();
      return { kind: 'ref', subjectKey: tok.subjectKey, metricKey: tok.metricKey };
    }
    if (tok.kind === 'group_agg') {
      this.advance();
      return { kind: 'group_agg', fn: tok.fn, metricKey: tok.metricKey };
    }
    if (tok.kind === 'number') {
      this.advance();
      return { kind: 'num', value: tok.value };
    }
    if (tok.kind === 'string') {
      this.advance();
      return { kind: 'str', value: tok.value };
    }
    if (tok.kind === 'ident') {
      this.advance();
      const next = this.peek();
      if (next === undefined || next.kind !== 'lparen') {
        return this.fail(`function "${tok.name}" expects "("`);
      }
      this.advance(); // consume '('
      const args: Ast[] = [];
      if (this.peek()?.kind !== 'rparen') {
        args.push(this.parseExpression());
        while (this.peek()?.kind === 'comma') {
          this.advance();
          args.push(this.parseExpression());
        }
      }
      if (this.peek()?.kind !== 'rparen') return this.fail('expected ")"');
      this.advance(); // consume ')'
      return { kind: 'call', fn: tok.name, args };
    }
    if (tok.kind === 'lparen') {
      this.advance();
      const expr = this.parseExpression();
      if (this.peek()?.kind !== 'rparen') return this.fail('expected ")"');
      this.advance();
      return expr;
    }

    // rparen / comma / op in primary position.
    return this.fail(`unexpected token "${tok.kind}"`);
  }
}

/** Parses a formula source string into an {@link Ast}. */
export function parse(src: string): Ast {
  return new Parser(tokenize(src)).parseProgram();
}

// ---------------------------------------------------------------------------
// Evaluator half
//
// Compile: parse the source once into an AST and collect the metric keys it
// references (SELF/REF/GROUP_*). Evaluate: walk the AST against an EvalContext
// that resolves those references. Both the frontend and the backend share
// this exact code path so the optimistic and authoritative results agree.
//
// Errors are returned, never thrown, so callers don't need try/catch around
// evaluation. Each error carries a stable code that the UI/API can switch on.
// ---------------------------------------------------------------------------

// Error codes returned by {@link evaluate}. Kept here (not in the parser
// section) because they describe *runtime* failures, distinct from the parse
// errors above.
const CALC_INPUT_MISSING = 'MATRIX_CALC_INPUT_MISSING';
const CALC_DIVIDE_BY_ZERO = 'MATRIX_CALC_DIVIDE_BY_ZERO';
const CALC_INVALID_OPERATION = 'MATRIX_CALC_INVALID_OPERATION';
const FORMULA_UNIT_MISMATCH = 'MATRIX_FORMULA_UNIT_MISMATCH';

/** Runtime representation of a metric value as a context can return it. */
export type MetricValue =
  | { value: number; unit: string }
  | { durationMs: number }
  | { text: string }
  | null;

/**
 * The evaluator reads inputs via this context — keep it pure, no DB access
 * here. The backend wires {@link groupAggregate} / {@link refSameGroup} to its
 * data layer; the frontend wires them to its optimistic in-memory snapshot.
 */
export interface EvalContext {
  /** Value of a metric on the *current* subject (the row being computed). */
  self: (key: string) => MetricValue;
  /** Value of a metric on another subject within the same group (REF node). */
  refSameGroup: (subjectKey: string, key: string) => MetricValue;
  /** A GROUP_* aggregate over the current group, or null if unavailable. */
  groupAggregate: (fn: string, key: string) => MetricValue | null;
}

/** A parsed formula bundled with its referenced metric keys. */
export type CompiledFormula = { ast: Ast; dependencies: string[] };

/** Outcome of {@link evaluate}: either a number or a typed error code. */
export type EvalResult =
  | { ok: true; value: number }
  | { ok: false; code: string; detail?: string };

/**
 * Internal evaluation result for a single AST node:
 *   number  — usable in arithmetic.
 *   boolean — produced by comparison ops; illegal in arithmetic.
 *   missing — an unresolved SELF/REF/GROUP reference (top-level → INPUT_MISSING).
 *   error   — a typed runtime error (div-by-zero, unit mismatch, etc.).
 *
 * {@link evaluate} collapses this into the public {@link EvalResult} at the top.
 */
type EvalLeaf =
  | { kind: 'number'; value: number }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'missing' }
  | { kind: 'error'; code: string; detail?: string };

const MISSING: EvalLeaf = { kind: 'missing' };
const num = (value: number): EvalLeaf => ({ kind: 'number', value });
const bool = (value: boolean): EvalLeaf => ({ kind: 'boolean', value });
const errorLeaf = (code: string, detail?: string): EvalLeaf => ({ kind: 'error', code, detail });

/**
 * Compiles a formula: parse once and collect the SELF/REF/GROUP_* metric keys.
 * The returned object is safe to cache and {@link evaluate} repeatedly against
 * different contexts.
 */
export function compileFormula(src: string): CompiledFormula {
  const ast = parse(src);
  return { ast, dependencies: collectDependencies(ast) };
}

/**
 * Just the referenced metric keys, exposed for schema-publish validation
 * (e.g. "does this formula reference keys that exist on the metric schema?").
 */
export function buildDependencyGraph(src: string): string[] {
  return collectDependencies(parse(src));
}

/** Walks an AST collecting metric keys referenced by SELF/REF/GROUP_* nodes. */
function collectDependencies(ast: Ast): string[] {
  const out: string[] = [];
  const walk = (node: Ast): void => {
    switch (node.kind) {
      case 'self':
        out.push(node.metricKey);
        return;
      case 'ref':
        out.push(node.metricKey);
        return;
      case 'group_agg':
        if (node.metricKey) out.push(node.metricKey);
        return;
      case 'binop':
        walk(node.left);
        walk(node.right);
        return;
      case 'call':
        for (const a of node.args) walk(a);
        return;
      default:
        return;
    }
  };
  walk(ast);
  return out;
}

/** Evaluates a compiled formula against a context. Returns a number or an error. */
export function evaluate(compiled: CompiledFormula, ctx: EvalContext): EvalResult {
  const leaf = evalAst(compiled.ast, ctx);
  return leafToResult(leaf);
}

/** Converts the internal {@link EvalLeaf} into the public {@link EvalResult}. */
function leafToResult(leaf: EvalLeaf): EvalResult {
  switch (leaf.kind) {
    case 'number':
      return { ok: true, value: leaf.value };
    case 'boolean':
      // A bare boolean result (formula was just `1 > 2`) is surfaced as the
      // number 1/0 to stay consistent with "evaluate returns a number".
      return { ok: true, value: leaf.value ? 1 : 0 };
    case 'missing':
      return { ok: false, code: CALC_INPUT_MISSING };
    case 'error':
      return { ok: false, code: leaf.code, detail: leaf.detail };
  }
}

/** Recursive evaluator. Returns a {@link EvalLeaf}; never throws. */
function evalAst(node: Ast, ctx: EvalContext): EvalLeaf {
  switch (node.kind) {
    case 'num':
      return num(node.value);
    case 'str':
      // A bare string literal has no numeric value; only COALESCE consumes it.
      return { kind: 'missing' };
    case 'self':
      return metricToLeaf(ctx.self(node.metricKey));
    case 'ref':
      return metricToLeaf(ctx.refSameGroup(node.subjectKey, node.metricKey));
    case 'group_agg':
      return metricToLeaf(ctx.groupAggregate(node.fn, node.metricKey));
    case 'binop':
      return evalBinop(node, ctx);
    case 'call':
      return evalCall(node, ctx);
  }
}

/**
 * Resolves a {@link MetricValue} from the context into an {@link EvalLeaf}.
 *   null          → missing (the caller had no value for this key)
 *   {value, unit} → its numeric value (units are validated by the schema layer)
 *   {durationMs}  → its millisecond count
 *   {text}        → UNIT_MISMATCH: a text metric has no numeric value, so using
 *                   it anywhere (including standalone) is a type error. The spec
 *                   calls this out specifically for arithmetic, but since the
 *                   evaluator's contract is to return a number, a bare text
 *                   metric can never succeed either.
 */
function metricToLeaf(mv: MetricValue): EvalLeaf {
  if (mv === null) return MISSING;
  if ('value' in mv) return num(mv.value);
  if ('durationMs' in mv) return num(mv.durationMs);
  // { text } — the only remaining variant.
  return errorLeaf(FORMULA_UNIT_MISMATCH, 'text value used as a number');
}

/** Evaluates a binary operator node (arithmetic + comparison). */
function evalBinop(node: Extract<Ast, { kind: 'binop' }>, ctx: EvalContext): EvalLeaf {
  const left = evalAst(node.left, ctx);
  // An error in an operand propagates before we even look at the right side.
  if (left.kind === 'error') return left;
  const right = evalAst(node.right, ctx);
  if (right.kind === 'error') return right;
  // A missing operand short-circuits to missing (matches Excel's "propagate
  // blanks" behaviour and keeps the top-level error INPUT_MISSING).
  if (left.kind === 'missing' || right.kind === 'missing') return MISSING;

  const op = node.op;
  const isComparison = op === '>' || op === '>=' || op === '<' || op === '<=' || op === '==' || op === '!=';

  // Comparisons require numbers on both sides; a boolean operand is a type
  // error (the left/right of a comparison was itself a comparison result).
  if (isComparison) {
    if (left.kind === 'boolean' || right.kind === 'boolean') {
      return errorLeaf(FORMULA_UNIT_MISMATCH, `operator "${op}" expected numbers`);
    }
    return compare(op, left.value, right.value);
  }

  // Arithmetic requires numbers on both sides.
  if (left.kind === 'boolean' || right.kind === 'boolean') {
    return errorLeaf(FORMULA_UNIT_MISMATCH, `operator "${op}" expected numbers`);
  }
  return arithmetic(op, left.value, right.value);
}

/** Runs an arithmetic op on two numbers; returns a typed error on failure. */
function arithmetic(op: string, a: number, b: number): EvalLeaf {
  switch (op) {
    case '+':
      return num(a + b);
    case '-':
      return num(a - b);
    case '*':
      return num(a * b);
    case '/':
      if (b === 0) return errorLeaf(CALC_DIVIDE_BY_ZERO, `${a} / 0`);
      return num(a / b);
    case '^':
      return power(a, b);
    default:
      return errorLeaf(CALC_INVALID_OPERATION, `operator "${op}"`);
  }
}

/**
 * `^` via Math.pow. Fractional exponents of negative bases (e.g. `(-8)^(1/3)`)
 * yield NaN in JS; surface that as a typed error rather than a silent NaN
 * leaking into a stored result.
 */
function power(a: number, b: number): EvalLeaf {
  const v = Math.pow(a, b);
  if (Number.isNaN(v)) {
    return errorLeaf(CALC_INVALID_OPERATION, `Math.pow(${a}, ${b}) is not a real number`);
  }
  return num(v);
}

/** Runs a comparison op; returns a boolean leaf. */
function compare(op: string, a: number, b: number): EvalLeaf {
  switch (op) {
    case '>':
      return bool(a > b);
    case '>=':
      return bool(a >= b);
    case '<':
      return bool(a < b);
    case '<=':
      return bool(a <= b);
    case '==':
      return bool(a === b);
    case '!=':
      return bool(a !== b);
    default:
      return errorLeaf(CALC_INVALID_OPERATION, `comparison "${op}"`);
  }
}

/** Evaluates a whitelist scalar function call. */
function evalCall(node: Extract<Ast, { kind: 'call' }>, ctx: EvalContext): EvalLeaf {
  const args = node.args;
  switch (node.fn) {
    case 'IF': {
      if (args.length < 2) return errorLeaf(CALC_INVALID_OPERATION, 'IF needs (cond, a[, b])');
      const cond = evalAst(args[0]!, ctx);
      // A missing/error condition short-circuits so the failure surfaces.
      if (cond.kind === 'missing') return MISSING;
      if (cond.kind === 'error') return cond;
      if (cond.kind !== 'boolean') return mismatch('IF condition');
      return cond.value ? evalAst(args[1]!, ctx) : args[2] ? evalAst(args[2]!, ctx) : MISSING;
    }
    case 'COALESCE': {
      for (const arg of args) {
        const v = evalAst(arg, ctx);
        if (v.kind !== 'missing') return v;
      }
      return MISSING;
    }
    case 'ROUND': {
      if (args.length === 0) return errorLeaf(CALC_INVALID_OPERATION, 'ROUND needs a value');
      const v = evalAst(args[0]!, ctx);
      if (v.kind === 'missing') return MISSING;
      if (v.kind === 'error') return v;
      if (v.kind === 'boolean') return mismatch('ROUND');
      // n must be a numeric literal; if absent or non-numeric, treat as 0.
      let n = 0;
      if (args.length >= 2) {
        const nNode = args[1]!;
        if (nNode.kind === 'num') n = nNode.value;
      }
      const factor = Math.pow(10, n);
      return num(Math.round(v.value * factor) / factor);
    }
    case 'MIN':
    case 'MAX': {
      const nums = collectNums(args, ctx);
      if (nums.kind !== 'numbers') return nums; // propagate missing/mismatch/error
      if (nums.value.length === 0) return MISSING;
      const arr = nums.value;
      return num(arr.reduce((acc, x) => (node.fn === 'MIN' ? Math.min(acc, x) : Math.max(acc, x))));
    }
    case 'SUM': {
      const nums = collectNums(args, ctx);
      if (nums.kind !== 'numbers') return nums;
      return num(nums.value.reduce((acc, x) => acc + x, 0));
    }
    case 'AVG': {
      const nums = collectNums(args, ctx);
      if (nums.kind !== 'numbers') return nums;
      if (nums.value.length === 0) return MISSING;
      return num(nums.value.reduce((acc, x) => acc + x, 0) / nums.value.length);
    }
    case 'ABS': {
      if (args.length !== 1) return errorLeaf(CALC_INVALID_OPERATION, 'ABS needs one value');
      const v = evalAst(args[0]!, ctx);
      if (v.kind === 'missing') return MISSING;
      if (v.kind === 'error') return v;
      if (v.kind === 'boolean') return mismatch('ABS');
      return num(Math.abs(v.value));
    }
    case 'UNIT': {
      // UNIT(value, "g") wraps a number with unit metadata. The unit is
      // metadata (validated by the schema layer); the result is the number.
      if (args.length < 1) return errorLeaf(CALC_INVALID_OPERATION, 'UNIT needs a value');
      const v = evalAst(args[0]!, ctx);
      if (v.kind === 'missing') return MISSING;
      if (v.kind === 'error') return v;
      if (v.kind === 'boolean') return mismatch('UNIT');
      return num(v.value);
    }
    case 'TO_SECONDS': {
      if (args.length !== 1) return errorLeaf(CALC_INVALID_OPERATION, 'TO_SECONDS needs one value');
      const v = evalAst(args[0]!, ctx);
      if (v.kind === 'missing') return MISSING;
      if (v.kind === 'error') return v;
      if (v.kind === 'boolean') return mismatch('TO_SECONDS');
      // The source should be a duration metric ({durationMs}); we accept any
      // number here and convert ms → seconds.
      return num(v.value / 1000);
    }
    default:
      return errorLeaf(CALC_INVALID_OPERATION, `function "${node.fn}"`);
  }
}

/**
 * Evaluates each arg expecting a number, returning either the list of values
 * (under a distinct `kind: 'numbers'` so TS can narrow it apart from the
 * scalar `EvalLeaf` variants) or the first non-number leaf to propagate.
 * Used by SUM/AVG/MIN/MAX.
 */
function collectNums(args: Ast[], ctx: EvalContext): EvalLeaf | { kind: 'numbers'; value: number[] } {
  const out: number[] = [];
  for (const arg of args) {
    const v = evalAst(arg, ctx);
    if (v.kind !== 'number') return v; // missing / error / boolean all propagate
    out.push(v.value);
  }
  return { kind: 'numbers', value: out };
}

/**
 * Type-mismatch helper for call args. Kept as a named function so call sites
 * read clearly and the code/detail stay consistent with the binop path.
 */
function mismatch(op: string): EvalLeaf {
  return errorLeaf(FORMULA_UNIT_MISMATCH, `operator "${op}" expected numbers`);
}
