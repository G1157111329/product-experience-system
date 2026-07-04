'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  type FormulaToken,
  tokensToDsl,
  tokensToExampleKeys,
} from '@/lib/matrix/formula-tokens';
import {
  compileFormula,
  evaluate,
  type CompiledFormula,
  type MetricValue,
} from '@/lib/matrix/formula-engine';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FormulaBuilderProps {
  /** Observed dimensions available for SELF reference (from the schema version being edited). */
  observedDimensions: Array<{ dimensionKey: string; displayName: string }>;
  /** Called when admin clicks "添加到草稿". Parent merges into its draft state. */
  onAdd: (
    dimension: {
      dimensionKey: string;
      displayName: string;
      columnGroup: 'calculated';
      valueKind: 'number';
      unitCode: string;
      editable: false;
      sortOrder: number;
      displayFormat: { decimals: number };
      required: false;
    },
    formula: {
      outputDimensionKey: string;
      formulaDsl: string;
      scope: 'row';
      formulaVersion: string;
    },
  ) => void;
  /** Next sort order for the new dimension (parent passes max+1). */
  nextSortOrder: number;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// v1 formula version tag — kept here so the builder & its callers agree on the
// schema of `formulaVersion` written into the formula payload. Bump if the DSL
// grammar gains breaking keywords (REF/GROUP_*/IF/etc.) once they're wired up.
// ---------------------------------------------------------------------------
const FORMULA_VERSION = '1';

/** Map common runtime error codes to friendly Chinese labels. */
function describeEvalCode(code: string): string {
  switch (code) {
    case 'MATRIX_CALC_DIVIDE_BY_ZERO':
      return '除零错误';
    case 'MATRIX_CALC_INPUT_MISSING':
      return '请填完所有示例值';
    case 'MATRIX_CALC_INVALID_OPERATION':
      return '运算无效（溢出或类型不匹配）';
    case 'MATRIX_FORMULA_UNIT_MISMATCH':
      return '单位/类型不匹配';
    default:
      return code;
  }
}

/**
 * Structured point-and-click formula builder for the data-matrix schema editor.
 *
 * v1 scope: the admin composes a formula from a restricted token palette
 * (SELF / 数字 / 运算符 / ROUND) by clicking chips, never by typing DSL. The
 * token stream is rendered to DSL via {@link tokensToDsl} and live-compiled
 * with {@link compileFormula}; an example preview re-evaluates on every input
 * change so the admin sees a concrete number before committing.
 *
 * NOTE: The structured palette intentionally EXCLUDES REF / GROUP_* / IF /
 * INDIRECT / A1 references — those are structural safety guardrails, not
 * missing features. Adding them later means extending this palette AND the
 * engine's runtime context; do NOT re-enable them piecemeal.
 */
export function FormulaBuilder({
  observedDimensions,
  onAdd,
  nextSortOrder,
  onCancel,
}: FormulaBuilderProps) {
  // ----- builder state -----
  const [outputName, setOutputName] = useState(''); // 输出列名 e.g. "出汁率"
  const [unit, setUnit] = useState('%'); // 单位
  const [decimals, setDecimals] = useState(4); // 保留小数位
  const [tokens, setTokens] = useState<FormulaToken[]>([]);
  const [exampleValues, setExampleValues] = useState<Record<string, string>>({});

  // ----- Popover toggles (simple boolean state is enough for v1) -----
  const [selfOpen, setSelfOpen] = useState(false);
  const [numberOpen, setNumberOpen] = useState(false);
  const [opOpen, setOpOpen] = useState(false);
  const [numberDraft, setNumberDraft] = useState('');

  // ----- derived (memoised) -----
  const dsl = useMemo(() => tokensToDsl(tokens), [tokens]);

  const exampleKeys = useMemo(() => tokensToExampleKeys(tokens), [tokens]);

  // Compile once per DSL change; capture the parse error code if it fails.
  const { compiled, compileError } = useMemo<{
    compiled: CompiledFormula | null;
    compileError: string | null;
  }>(() => {
    if (dsl === '') return { compiled: null, compileError: null };
    try {
      return { compiled: compileFormula(dsl), compileError: null };
    } catch (e) {
      const code =
        e instanceof Error && 'code' in e
          ? String((e as { code: string }).code)
          : 'MATRIX_FORMULA_PARSE_ERROR';
      return { compiled: null, compileError: code };
    }
  }, [dsl]);

  // ----- example preview result -----
  type EvalPreview =
    | { ok: true; value: number }
    | { ok: false; code: string }
    | null;
  const [evalResult, setEvalResult] = useState<EvalPreview>(null);

  useEffect(() => {
    if (compiled === null) {
      setEvalResult(null);
      return;
    }
    if (exampleKeys.length === 0) {
      setEvalResult(null);
      return;
    }
    const self = (key: string): MetricValue => {
      const raw = exampleValues[key];
      if (raw === undefined || raw === '') return null;
      return { value: Number(raw), unit: '' };
    };
    const ctx = {
      self,
      // v1 palette excludes REF / GROUP_*, so these are unreachable for the
      // current token set; keep them as null-returning stubs for safety.
      refSameGroup: () => null,
      groupAggregate: () => null,
    };
    const res = evaluate(compiled, ctx);
    setEvalResult(res.ok ? { ok: true, value: res.value } : { ok: false, code: res.code });
    // exampleKeys is derived from tokens → from dsl/compiled, so [compiled, exampleValues]
    // is sufficient; including exampleKeys would over-trigger but is harmless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compiled, exampleValues]);

  // ----- token mutation helpers -----
  const appendToken = (t: FormulaToken) => setTokens((prev) => [...prev, t]);

  const removeTokenAt = (index: number) =>
    setTokens((prev) => prev.filter((_, i) => i !== index));

  /**
   * ROUND wrap (v1): the entire current token stream is collapsed into a single
   * `{kind:'round'}` token whose `inner` preserves the prior stream. Only one
   * top-level round is allowed, so the button disables once such a token exists.
   * Unwrap-on-delete is intentionally NOT supported — clicking × on a round
   * token deletes it wholesale (inner tokens are dropped too). That keeps the
   * token model simple; admins re-build rather than recover a partial wrap.
   */
  const hasTopLevelRound = tokens.some((t) => t.kind === 'round');
  const roundDisabled = tokens.length === 0 || hasTopLevelRound;

  const wrapAllInRound = () => {
    if (roundDisabled) return;
    setTokens([{ kind: 'round', inner: [...tokens], decimals }]);
  };

  // ----- commit -----
  const canCommit =
    outputName.trim() !== '' && tokens.length > 0 && compiled !== null;

  const handleAdd = () => {
    if (!canCommit || compiled === null) return;
    // v1 simplification: the output column's dimensionKey is derived directly
    // from outputName (trimmed). No separate slug/id field is exposed to the
    // admin in v1. If duplicate-key handling is needed, the parent is expected
    // to de-dupe at merge time — the builder stays agnostic.
    const key = outputName.trim();
    onAdd(
      {
        dimensionKey: key,
        displayName: key,
        columnGroup: 'calculated',
        valueKind: 'number',
        unitCode: unit,
        editable: false,
        sortOrder: nextSortOrder,
        displayFormat: { decimals },
        required: false,
      },
      {
        outputDimensionKey: key,
        formulaDsl: dsl,
        scope: 'row',
        formulaVersion: FORMULA_VERSION,
      },
    );
  };

  // ----- render helpers -----
  const renderTokenChip = (t: FormulaToken, index: number) => {
    const remove = (
      <button
        type="button"
        aria-label="删除该 token"
        className="ml-0.5 inline-flex items-center rounded-sm hover:bg-black/10 dark:hover:bg-white/15"
        onClick={() => removeTokenAt(index)}
      >
        <X className="size-3" />
      </button>
    );

    switch (t.kind) {
      case 'self':
        return (
          <Badge
            key={index}
            variant="secondary"
            className="gap-1 bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200"
          >
            <span className="font-mono text-xs">SELF(&quot;{t.dimensionKey}&quot;)</span>
            {remove}
          </Badge>
        );
      case 'number':
        return (
          <Badge key={index} variant="secondary" className="gap-1">
            <span className="font-mono text-xs">{t.value}</span>
            {remove}
          </Badge>
        );
      case 'op':
        return (
          <Badge key={index} variant="outline" className="gap-1 text-muted-foreground">
            <span className="font-mono text-xs">{t.symbol}</span>
            {remove}
          </Badge>
        );
      case 'round':
        return (
          <Badge
            key={index}
            variant="secondary"
            className="gap-1 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
            title={`ROUND(..., ${t.decimals}) — 内含 ${t.inner.length} 个 token`}
          >
            <span className="font-mono text-xs">ROUND(..., {t.decimals})</span>
            {remove}
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-4 rounded-lg border p-4">
      {/* 1. 输出列区 ------------------------------------------------------ */}
      <section className="space-y-2">
        <div className="text-sm font-semibold">输出列</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">输出列名</Label>
            <Input
              value={outputName}
              placeholder="例如 出汁率"
              onChange={(e) => setOutputName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">单位</Label>
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">小数位</Label>
            <Input
              type="number"
              min={0}
              step={1}
              value={decimals}
              onChange={(e) => setDecimals(Number(e.target.value))}
            />
          </div>
        </div>
      </section>

      <Separator />

      {/* 2. 公式构建区 ---------------------------------------------------- */}
      <section className="space-y-2">
        <div className="text-sm font-semibold">公式构建</div>

        <div className="flex min-h-8 flex-wrap items-center gap-1.5 rounded-md border bg-muted/30 p-2">
          {tokens.length === 0 ? (
            <span className="px-1 text-xs text-muted-foreground">
              点击下方按钮添加 token（SELF / 数字 / 运算符 / ROUND）
            </span>
          ) : (
            tokens.map(renderTokenChip)
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {/* + SELF */}
          <Popover open={selfOpen} onOpenChange={setSelfOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1">
                <Plus className="h-3.5 w-3.5" /> SELF
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="start">
              {observedDimensions.length === 0 ? (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  当前版本暂无可观测维度
                </p>
              ) : (
                <Select
                  onValueChange={(value) => {
                    appendToken({ kind: 'self', dimensionKey: value });
                    setSelfOpen(false);
                  }}
                >
                  <SelectTrigger className="w-full" size="sm">
                    <SelectValue placeholder="选择维度" />
                  </SelectTrigger>
                  <SelectContent>
                    {observedDimensions.map((d) => (
                      <SelectItem key={d.dimensionKey} value={d.dimensionKey}>
                        {d.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </PopoverContent>
          </Popover>

          {/* + 数字 */}
          <Popover open={numberOpen} onOpenChange={setNumberOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1">
                <Plus className="h-3.5 w-3.5" /> 数字
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="start">
              <div className="space-y-2">
                <Input
                  type="number"
                  value={numberDraft}
                  autoFocus
                  placeholder="输入数字"
                  onChange={(e) => setNumberDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const v = Number(numberDraft);
                      if (numberDraft !== '' && Number.isFinite(v)) {
                        appendToken({ kind: 'number', value: v });
                      }
                      setNumberDraft('');
                      setNumberOpen(false);
                    }
                  }}
                />
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    const v = Number(numberDraft);
                    if (numberDraft !== '' && Number.isFinite(v)) {
                      appendToken({ kind: 'number', value: v });
                    }
                    setNumberDraft('');
                    setNumberOpen(false);
                  }}
                >
                  添加
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          {/* + 运算符 */}
          <Popover open={opOpen} onOpenChange={setOpOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1">
                <Plus className="h-3.5 w-3.5" /> 运算符
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2" align="start">
              <div className="flex gap-1">
                {(['+', '-', '*', '/', '^'] as const).map((sym) => (
                  <Button
                    key={sym}
                    variant="outline"
                    size="sm"
                    className="size-8 p-0 font-mono"
                    onClick={() => {
                      appendToken({ kind: 'op', symbol: sym });
                      setOpOpen(false);
                    }}
                  >
                    {sym}
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* + ROUND */}
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            disabled={roundDisabled}
            title={
              hasTopLevelRound
                ? '已存在顶层 ROUND，v1 仅允许一个'
                : tokens.length === 0
                  ? '请先添加 token'
                  : '将当前 token 流整体包裹为 ROUND'
            }
            onClick={wrapAllInRound}
          >
            <Plus className="h-3.5 w-3.5" /> ROUND
          </Button>
        </div>
      </section>

      <Separator />

      {/* 3. DSL 预览 ------------------------------------------------------ */}
      <section className="space-y-2">
        <div className="text-sm font-semibold">DSL 预览</div>
        {dsl === '' ? (
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            尚未构建公式
          </div>
        ) : compileError !== null ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2">
            <div className="break-all font-mono text-xs text-foreground">{dsl}</div>
            <div className="mt-1 text-xs text-destructive">编译错误：{compileError}</div>
          </div>
        ) : (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-2">
            <div className="break-all font-mono text-xs text-foreground">{dsl}</div>
          </div>
        )}
      </section>

      {/* 4. 示例预览 ------------------------------------------------------ */}
      <section className="space-y-2">
        <div className="text-sm font-semibold">示例预览</div>
        {exampleKeys.length === 0 ? (
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            添加 SELF 引用后可填示例验证
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {exampleKeys.map((key) => (
                <div key={key} className="space-y-1.5">
                  <Label className="font-mono text-xs">{key}</Label>
                  <Input
                    type="number"
                    value={exampleValues[key] ?? ''}
                    onChange={(e) =>
                      setExampleValues((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                  />
                </div>
              ))}
            </div>
            <div>
              {evalResult === null ? (
                <span className="text-xs text-muted-foreground">填写示例值后显示结果</span>
              ) : evalResult.ok ? (
                <span className="text-xs text-emerald-600 dark:text-emerald-400">
                  ✓ 结果：{evalResult.value}
                </span>
              ) : (
                <span className="text-xs text-destructive">
                  ✗ {describeEvalCode(evalResult.code)}
                </span>
              )}
            </div>
          </div>
        )}
      </section>

      <Separator />

      {/* 5. 操作 ---------------------------------------------------------- */}
      <section className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          取消
        </Button>
        <Button size="sm" onClick={handleAdd} disabled={!canCommit}>
          添加到草稿
        </Button>
      </section>
    </div>
  );
}
