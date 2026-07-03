/**
 * Data-matrix DSL formula engine — parser half.
 *
 * This module is intentionally pure TypeScript with no Node/browser-specific
 * imports so it can be shared between the frontend (optimistic computation)
 * and the backend (authoritative recompute). Formulas use a restricted DSL of
 * semantic references (SELF / REF / GROUP_* and a small whitelist of scalar
 * functions) rather than Excel A1-style references. The evaluator half lives
 * in a sibling module and is added separately — do not implement evaluation
 * here.
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

  constructor(src: string) {
    this.src = src;
  }

  private fail(detail: string): never {
    throw parseError(detail);
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
      this.pos += 1;
      return { kind: 'lparen' };
    }
    if (ch === ')') {
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
//   power       ( ^, right-associative )
//   unary       ( - prefix )
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
    let left = this.parsePower();
    while (true) {
      const tok = this.peek();
      if (tok?.kind === 'op' && (tok.symbol === '*' || tok.symbol === '/')) {
        this.advance();
        const right = this.parsePower();
        left = { kind: 'binop', op: tok.symbol, left, right };
      } else {
        break;
      }
    }
    return left;
  }

  private parsePower(): Ast {
    const base = this.parseUnary();
    if (this.isOp('^')) {
      this.advance();
      const exponent = this.parsePower(); // right-associative
      return { kind: 'binop', op: '^', left: base, right: exponent };
    }
    return base;
  }

  private parseUnary(): Ast {
    if (this.isOp('-')) {
      this.advance();
      const operand = this.parseUnary();
      // Desugar unary minus into `0 - operand` (no dedicated unary AST node).
      return { kind: 'binop', op: '-', left: { kind: 'num', value: 0 }, right: operand };
    }
    return this.parsePrimary();
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
