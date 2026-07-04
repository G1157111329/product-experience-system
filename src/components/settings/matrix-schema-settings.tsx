'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Save, Upload, GitBranch, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { FormulaBuilder } from '@/components/settings/formula-builder';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MatrixSchemaSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ---------------------------------------------------------------------------
// Types — shapes match the actual API responses (NOT the snake_case sketched
// in the plan doc). GET /api/matrix-schemas returns camelCase; the version
// detail endpoint returns snake_case because it forwards DB rows as-is.
// ---------------------------------------------------------------------------

interface SchemaSummary {
  id: string;
  schemaKey: string;
  name: string;
  productCategory: string | null;
  experienceTypeAllowlist?: string[];
  status: string;
  latestPublishedVersion?: {
    id: string;
    version_no: number;
    status: string;
  } | null;
}

/** Raw row from matrix_schema_versions (snake_case). */
interface VersionRow {
  id: string;
  schema_id: string;
  version_no: number;
  status: string;
  schema_json: unknown;
  published_at: string | null;
  published_by: string | null;
}

/** Raw binding row from matrix_dimension_bindings (snake_case). */
interface DimensionBindingRow {
  dimension_key: string;
  display_name: string;
  column_group: 'observed' | 'calculated';
  value_kind: string;
  unit_code: string | null;
  required: boolean;
  editable: boolean;
  sort_order: number;
  display_format_json: { decimals?: number; durationFormat?: string } | null;
  validation_rule_json: Record<string, unknown> | null;
}

/** Raw formula row from matrix_formula_definitions (snake_case). */
interface FormulaDefinitionRow {
  id: string;
  output_dimension_key: string;
  formula_dsl: string;
  scope: 'row' | 'group';
  formula_version: string;
  status: string;
}

interface VersionDetail {
  version: VersionRow;
  dimensions: DimensionBindingRow[];
  formulas: FormulaDefinitionRow[];
}

/** Editable draft shape (camelCase) — what the PUT /draft body expects. */
interface DraftDimension {
  dimensionKey: string;
  displayName: string;
  columnGroup: 'observed' | 'calculated';
  valueKind: string;
  unitCode?: string;
  required?: boolean;
  editable?: boolean;
  sortOrder: number;
  displayFormat?: { decimals?: number; durationFormat?: string };
  validation?: Record<string, unknown>;
}

interface DraftFormula {
  outputDimensionKey: string;
  formulaDsl: string;
  scope: 'row' | 'group';
  formulaVersion: string;
}

// ---------------------------------------------------------------------------
// Helpers — map the snake_case DB rows into the camelCase draft model. Keeping
// this transform in one place means the editor only ever deals with camelCase,
// and save/publish can send the body straight back without re-mapping.
// ---------------------------------------------------------------------------

function bindingToDraft(b: DimensionBindingRow): DraftDimension {
  return {
    dimensionKey: b.dimension_key,
    displayName: b.display_name,
    columnGroup: b.column_group,
    valueKind: b.value_kind,
    unitCode: b.unit_code ?? undefined,
    required: b.required,
    editable: b.editable,
    sortOrder: b.sort_order,
    displayFormat: b.display_format_json ?? undefined,
    validation: b.validation_rule_json ?? undefined,
  };
}

function formulaToDraft(f: FormulaDefinitionRow): DraftFormula {
  return {
    outputDimensionKey: f.output_dimension_key,
    formulaDsl: f.formula_dsl,
    scope: f.scope,
    formulaVersion: f.formula_version,
  };
}

/**
 * Fetch helper: the platform's API convention is `{code,message,data}` on
 * success and `{code,message}` (sometimes with `data.code` for typed errors)
 * on failure. We normalise to a discriminated result so call sites can branch
 * on `ok` without re-parsing.
 */
async function api<T>(
  url: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; status: number; payload: unknown }> {
  const res = await fetch(url, init);
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    /* non-JSON body — leave payload null */
  }
  if (
    res.ok &&
    payload &&
    typeof payload === 'object' &&
    'code' in payload &&
    (payload as { code: unknown }).code === 0
  ) {
    return { ok: true, data: (payload as unknown as { data: T }).data };
  }
  return { ok: false, status: res.status, payload };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MatrixSchemaSettings({ open, onOpenChange }: MatrixSchemaSettingsProps) {
  // ---- list state ----
  const [schemas, setSchemas] = useState<SchemaSummary[] | null>(null);
  const [loadingSchemas, setLoadingSchemas] = useState(false);

  // ---- selection state ----
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [versionDetail, setVersionDetail] = useState<VersionDetail | null>(null);
  const [loadingVersion, setLoadingVersion] = useState(false);

  // ---- editable draft (mirrors versionDetail once loaded) ----
  const [draftDimensions, setDraftDimensions] = useState<DraftDimension[]>([]);
  const [draftFormulas, setDraftFormulas] = useState<DraftFormula[]>([]);

  // ---- UI flags ----
  const [showBuilder, setShowBuilder] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  const fetchSchemas = useCallback(async () => {
    setLoadingSchemas(true);
    const result = await api<SchemaSummary[]>('/api/matrix-schemas');
    if (result.ok) {
      setSchemas(result.data);
    } else {
      setSchemas([]);
      const message =
        result.payload && typeof result.payload === 'object' && 'message' in result.payload
          ? String((result.payload as { message: unknown }).message)
          : '模式列表加载失败';
      toast.error(message);
    }
    setLoadingSchemas(false);
  }, []);

  const fetchVersion = useCallback(async (versionId: string) => {
    setLoadingVersion(true);
    setShowBuilder(false);
    const result = await api<VersionDetail>(`/api/matrix-schema-versions/${versionId}`);
    if (result.ok) {
      setVersionDetail(result.data);
      setDraftDimensions(result.data.dimensions.map(bindingToDraft));
      setDraftFormulas(result.data.formulas.map(formulaToDraft));
      setSelectedVersionId(versionId);
    } else {
      const message =
        result.payload && typeof result.payload === 'object' && 'message' in result.payload
          ? String((result.payload as { message: unknown }).message)
          : '版本详情加载失败';
      toast.error(message);
      setVersionDetail(null);
      setDraftDimensions([]);
      setDraftFormulas([]);
    }
    setLoadingVersion(false);
  }, []);

  // Load the schema list whenever the dialog opens.
  useEffect(() => {
    if (open) {
      void fetchSchemas();
    } else {
      // Reset transient selection state on close so reopening is clean.
      setSelectedVersionId(null);
      setVersionDetail(null);
      setDraftDimensions([]);
      setDraftFormulas([]);
      setShowBuilder(false);
    }
  }, [open, fetchSchemas]);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  /**
   * Derive a new draft version off the currently viewed version's schema_json.
   * Works for both published (read-only) and existing draft versions. The new
   * version is created server-side via POST .../versions, then we load it as an
   * editable draft on the right.
   */
  const handleDerive = async (schemaId: string) => {
    if (!versionDetail) return;
    const derive = await api<{ versionId: string }>(
      `/api/matrix-schemas/${schemaId}/versions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schemaJson: versionDetail.version.schema_json }),
      },
    );
    if (!derive.ok) {
      const message =
        derive.payload && typeof derive.payload === 'object' && 'message' in derive.payload
          ? String((derive.payload as { message: unknown }).message)
          : '派生新版本失败';
      toast.error(message);
      return;
    }
    toast.success('已创建新草稿版本');
    await fetchVersion(derive.data.versionId);
    // Refresh the left list so the schema's published-pointer etc. stays sane.
    void fetchSchemas();
  };

  /**
   * Merge a calculated column built in <FormulaBuilder> into the draft. The
   * builder already emits camelCase payloads matching DraftDimension/DraftFormula,
   * so we just append. Duplicate-key de-dup is intentionally NOT done here —
   * the backend validates references at save/publish time, and FormulaBuilder
   * keeps the admin from re-picking an existing key in v1.
   */
  const handleAddFromBuilder = (
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
  ) => {
    setDraftDimensions((prev) => [...prev, dimension]);
    setDraftFormulas((prev) => [...prev, formula]);
    setShowBuilder(false);
    toast.success(`已添加计算列：${dimension.displayName}`);
  };

  /**
   * Save the draft. The backend is replace-strategy and validates every
   * formula's dependencies against the FULL incoming dimension set, so we send
   * observed + calculated dimensions together.
   */
  const handleSaveDraft = async () => {
    if (!selectedVersionId) return;
    setSaving(true);
    const result = await api<{ versionId: string; dimensions: number; formulas: number }>(
      `/api/matrix-schema-versions/${selectedVersionId}/draft`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dimensions: draftDimensions, formulas: draftFormulas }),
      },
    );
    setSaving(false);
    if (result.ok) {
      toast.success('草稿已保存');
    } else {
      const payload = result.payload as { message?: string; code?: string } | null;
      toast.error(payload?.message || '草稿保存失败');
    }
  };

  /**
   * Publish the current draft. On success the version becomes immutable, so we
   * re-fetch it — that flips the right column to read-only (status ===
   * 'published') and the left list refreshes to point at the new published
   * version. On 422 we surface the backend's typed error (cycle / parse /
   * dimension) directly.
   */
  const handlePublish = async () => {
    if (!selectedVersionId) return;
    setPublishing(true);
    const result = await api<{ versionId: string; publishedAt: string }>(
      `/api/matrix-schema-versions/${selectedVersionId}/publish`,
      { method: 'POST' },
    );
    setPublishing(false);
    if (result.ok) {
      toast.success('模式发布成功');
      // Re-fetch the (now published) version + refresh the left list badges.
      await fetchVersion(selectedVersionId);
      void fetchSchemas();
    } else {
      const payload = result.payload as { message?: string; code?: string } | null;
      // publish 422 puts a typed code (e.g. MATRIX_FORMULA_CYCLE) at top-level.
      toast.error(payload?.message || '发布失败');
    }
  };

  // -------------------------------------------------------------------------
  // Derived view state
  // -------------------------------------------------------------------------

  const isDraft = versionDetail?.version.status === 'draft';
  const observedDims = draftDimensions.filter((d) => d.columnGroup === 'observed');
  const calculatedDims = draftDimensions.filter((d) => d.columnGroup === 'calculated');
  const observedForBuilder = observedDims.map((d) => ({
    dimensionKey: d.dimensionKey,
    displayName: d.displayName,
  }));
  const nextSortOrder =
    draftDimensions.reduce((max, d) => Math.max(max, d.sortOrder), -1) + 1;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" /> 数据矩阵模式设置
          </DialogTitle>
          <DialogDescription>
            浏览矩阵模式与已发布版本，派生草稿并维护计算列公式
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[80vh]">
          <div className="flex flex-col gap-4 p-4 xl:flex-row">
            {/* ---------- Left: schema / version list ---------- */}
            <section className="xl:w-[280px] xl:shrink-0 space-y-2">
              <h3 className="text-sm font-semibold">模式与版本</h3>
              {schemas === null || loadingSchemas ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> 加载中…
                </div>
              ) : schemas.length === 0 ? (
                <p className="text-xs text-muted-foreground">暂无矩阵模式</p>
              ) : (
                <div className="space-y-2">
                  {schemas.map((schema) => {
                    const lpv = schema.latestPublishedVersion;
                    const isActive =
                      lpv != null && lpv.id === selectedVersionId;
                    return (
                      <div key={schema.id} className="rounded-md border p-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{schema.name}</div>
                            <div className="truncate font-mono text-[11px] text-muted-foreground">
                              {schema.schemaKey}
                            </div>
                          </div>
                          <Badge variant="outline" className="text-[10px]">
                            {schema.status}
                          </Badge>
                        </div>
                        {lpv ? (
                          <button
                            type="button"
                            onClick={() => void fetchVersion(lpv.id)}
                            className={`mt-2 flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-left text-xs transition-colors ${
                              isActive
                                ? 'border-primary bg-primary/5'
                                : 'hover:bg-muted/50'
                            }`}
                          >
                            <span className="min-w-0">
                              <span className="font-medium">已发布 v{lpv.version_no}</span>
                              <span className="ml-1 text-muted-foreground">（只读）</span>
                            </span>
                            <Badge variant="secondary" className="text-[10px]">
                              {lpv.status}
                            </Badge>
                          </button>
                        ) : (
                          <p className="mt-2 text-[11px] text-muted-foreground">尚未发布版本</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* ---------- Right: version editor ---------- */}
            <section className="min-w-0 flex-1 space-y-3">
              {loadingVersion ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> 加载版本详情…
                </div>
              ) : !versionDetail ? (
                <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
                  从左侧选择一个已发布版本，或派生新版本开始编辑
                </div>
              ) : (
                <>
                  {/* header */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">
                          版本 v{versionDetail.version.version_no}
                        </span>
                        <Badge
                          variant={isDraft ? 'secondary' : 'default'}
                          className="text-[10px]"
                        >
                          {versionDetail.version.status}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {isDraft
                          ? '草稿模式：可编辑维度与公式，保存后发布'
                          : '已发布版本为只读，可派生新版本继续编辑'}
                      </p>
                    </div>
                    {/* derive button is available for both draft & published */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() => void handleDerive(versionDetail.version.schema_id)}
                    >
                      <Plus className="h-3.5 w-3.5" /> 派生新版本
                    </Button>
                  </div>

                  <Separator />

                  {/* observed dimensions */}
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-muted-foreground">
                      可观测维度（{observedDims.length}）
                    </div>
                    {observedDims.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">无可观测维度</p>
                    ) : (
                      <div className="space-y-1.5">
                        {observedDims.map((d) => (
                          <div
                            key={d.dimensionKey}
                            className="flex items-center justify-between rounded-md border px-2.5 py-1.5"
                          >
                            <div className="min-w-0">
                              <span className="text-sm">{d.displayName}</span>
                              <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                                {d.dimensionKey}
                              </span>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              {d.unitCode ? (
                                <Badge variant="outline" className="text-[10px]">
                                  {d.unitCode}
                                </Badge>
                              ) : null}
                              <Badge variant="outline" className="text-[10px]">
                                #{d.sortOrder}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* calculated dimensions */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-muted-foreground">
                        计算列（{calculatedDims.length}）
                      </div>
                      {isDraft && !showBuilder ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          onClick={() => setShowBuilder(true)}
                        >
                          <Plus className="h-3.5 w-3.5" /> 添加计算列
                        </Button>
                      ) : null}
                    </div>
                    {calculatedDims.length === 0 && !showBuilder ? (
                      <p className="text-[11px] text-muted-foreground">暂无计算列</p>
                    ) : (
                      <div className="space-y-1.5">
                        {calculatedDims.map((d) => {
                          const formula = draftFormulas.find(
                            (f) => f.outputDimensionKey === d.dimensionKey,
                          );
                          return (
                            <div
                              key={d.dimensionKey}
                              className="rounded-md border px-2.5 py-1.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <span className="text-sm">{d.displayName}</span>
                                  <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                                    {d.dimensionKey}
                                  </span>
                                </div>
                                <div className="flex shrink-0 items-center gap-1.5">
                                  {d.unitCode ? (
                                    <Badge variant="outline" className="text-[10px]">
                                      {d.unitCode}
                                    </Badge>
                                  ) : null}
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200"
                                  >
                                    calculated
                                  </Badge>
                                </div>
                              </div>
                              {formula ? (
                                <div className="mt-1 break-all rounded bg-muted/50 px-1.5 py-1 font-mono text-[11px] text-muted-foreground">
                                  {formula.formulaDsl}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* formula builder (draft only) */}
                  {isDraft && showBuilder ? (
                    <FormulaBuilder
                      observedDimensions={observedForBuilder}
                      nextSortOrder={nextSortOrder}
                      onAdd={handleAddFromBuilder}
                      onCancel={() => setShowBuilder(false)}
                    />
                  ) : null}

                  {/* action bar (draft only) */}
                  {isDraft ? (
                    <>
                      <Separator />
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          onClick={() => void handleSaveDraft()}
                          disabled={saving}
                        >
                          {saving ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Save className="h-3.5 w-3.5" />
                          )}
                          保存草稿
                        </Button>
                        <Button
                          size="sm"
                          className="gap-1"
                          onClick={() => void handlePublish()}
                          disabled={publishing}
                        >
                          {publishing ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Upload className="h-3.5 w-3.5" />
                          )}
                          发布
                        </Button>
                      </div>
                    </>
                  ) : null}
                </>
              )}
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
