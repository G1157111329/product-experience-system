'use client';

/**
 * Matrix Designer — 5-step wizard (PRD §5.3).
 *
 * Step 1/5: 基础结构 (axes, name)
 * Step 2/5: 字段分区 (sections)
 * Step 3/5: 字段与证据 (field definitions, evidence slots)
 * Step 4/5: 公式与问题规则 (formulas, result status mapping)
 * Step 5/5: 预览与确认 (preview + confirm)
 */

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft, ChevronRight, Check, Plus, Trash2, GripVertical,
  Table2, Layout, Type, Hash, Clock, ToggleLeft, List, Image, Video,
  AlertCircle, FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import type {
  CreateDesignVersionRequest,
  FieldKind,
  FieldDataType,
  SectionScope,
  RequiredMode,
  ReportPriority,
  ResultStatusMappingValue,
} from '@/lib/matrix/task-matrix-types';

// ---------------------------------------------------------------------------
// Types for the designer state
// ---------------------------------------------------------------------------

interface DesignerField {
  key: string; // temp key for React
  label: string;
  fieldKind: FieldKind;
  dataType: FieldDataType;
  requiredMode: RequiredMode;
  unitText: string;
  decimalPlaces: number;
  enumOptions: string;
  isResultStatusField: boolean;
  resultStatusMapping: Record<string, ResultStatusMappingValue>;
  showInDesktopGrid: boolean;
  showInMobileCard: boolean;
  showInReport: boolean;
  reportPriority: ReportPriority;
  maxMediaCount: number;
  isCriticalEvidence: boolean;
  sortOrder: number;
  formulaDsl: string;
}

interface DesignerSection {
  key: string;
  name: string;
  scope: SectionScope;
  description: string;
  isCollapsible: boolean;
  defaultExpanded: boolean;
  sortOrder: number;
  fields: DesignerField[];
}

interface DesignerState {
  groupAxisLabel: string;
  rowAxisLabel: string;
  sections: DesignerSection[];
}

const FIELD_TYPE_OPTIONS: { value: FieldDataType; label: string; icon: React.ReactNode; kinds: FieldKind[] }[] = [
  { value: 'short_text', label: '单行文本', icon: <Type className="h-4 w-4" />, kinds: ['manual_value'] },
  { value: 'long_text', label: '多行文本', icon: <FileText className="h-4 w-4" />, kinds: ['manual_value'] },
  { value: 'number', label: '数值', icon: <Hash className="h-4 w-4" />, kinds: ['manual_value'] },
  { value: 'percentage', label: '百分比', icon: <Hash className="h-4 w-4" />, kinds: ['manual_value'] },
  { value: 'duration', label: '时长', icon: <Clock className="h-4 w-4" />, kinds: ['manual_value'] },
  { value: 'single_select', label: '单选', icon: <List className="h-4 w-4" />, kinds: ['manual_value'] },
  { value: 'multi_select', label: '多选', icon: <List className="h-4 w-4" />, kinds: ['manual_value'] },
  { value: 'boolean', label: '布尔', icon: <ToggleLeft className="h-4 w-4" />, kinds: ['manual_value'] },
  { value: 'date_time', label: '日期时间', icon: <Clock className="h-4 w-4" />, kinds: ['manual_value'] },
  { value: 'calculated_number', label: '计算数值', icon: <Hash className="h-4 w-4" />, kinds: ['formula'] },
  { value: 'calculated_percentage', label: '计算百分比', icon: <Hash className="h-4 w-4" />, kinds: ['formula'] },
  { value: 'image_slot', label: '图片槽位', icon: <Image className="h-4 w-4" />, kinds: ['evidence_slot'] },
  { value: 'video_slot', label: '视频槽位', icon: <Video className="h-4 w-4" />, kinds: ['evidence_slot'] },
  { value: 'file_slot', label: '附件槽位', icon: <FileText className="h-4 w-4" />, kinds: ['evidence_slot'] },
  { value: 'issue_slot', label: '问题槽位', icon: <AlertCircle className="h-4 w-4" />, kinds: ['issue_slot'] },
];

let _fieldCounter = 0;
function nextFieldKey(): string { return `fld_${++_fieldCounter}_${Date.now()}`; }
let _sectionCounter = 0;
function nextSectionKey(): string { return `sec_${++_sectionCounter}_${Date.now()}`; }

const DEFAULT_SECTIONS: DesignerSection[] = [
  {
    key: nextSectionKey(),
    name: '测量记录',
    scope: 'row',
    description: '',
    isCollapsible: true,
    defaultExpanded: true,
    sortOrder: 0,
    fields: [],
  },
  {
    key: nextSectionKey(),
    name: '计算结果',
    scope: 'row',
    description: '',
    isCollapsible: false,
    defaultExpanded: true,
    sortOrder: 1,
    fields: [],
  },
  {
    key: nextSectionKey(),
    name: '证据与问题',
    scope: 'row',
    description: '',
    isCollapsible: true,
    defaultExpanded: true,
    sortOrder: 2,
    fields: [],
  },
];

interface MatrixDesignerProps {
  matrixId: string;
  taskId: string;
  onBack: () => void;
  onConfirmed: () => void;
}

export function MatrixDesigner({ matrixId, taskId, onBack, onConfirmed }: MatrixDesignerProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [state, setState] = useState<DesignerState>({
    groupAxisLabel: '分组',
    rowAxisLabel: '行',
    sections: DEFAULT_SECTIONS,
  });

  const setGroupAxis = (v: string) => setState((s) => ({ ...s, groupAxisLabel: v }));
  const setRowAxis = (v: string) => setState((s) => ({ ...s, rowAxisLabel: v }));

  // Section management
  const addSection = (scope: SectionScope) => {
    setState((s) => ({
      ...s,
      sections: [...s.sections, {
        key: nextSectionKey(),
        name: scope === 'row' ? '新分区' : scope === 'group' ? '分组分区' : '矩阵分区',
        scope,
        description: '',
        isCollapsible: true,
        defaultExpanded: true,
        sortOrder: s.sections.length,
        fields: [],
      }],
    }));
  };

  const removeSection = (key: string) => {
    setState((s) => ({ ...s, sections: s.sections.filter((sec) => sec.key !== key) }));
  };

  const updateSection = (key: string, updates: Partial<DesignerSection>) => {
    setState((s) => ({
      ...s,
      sections: s.sections.map((sec) => sec.key === key ? { ...sec, ...updates } : sec),
    }));
  };

  // Field management
  const addField = (sectionKey: string, dataType: FieldDataType) => {
    const typeInfo = FIELD_TYPE_OPTIONS.find((t) => t.value === dataType);
    const fieldKind: FieldKind = typeInfo?.kinds[0] ?? 'manual_value';

    const newField: DesignerField = {
      key: nextFieldKey(),
      label: dataType.replace('_', ' '),
      fieldKind,
      dataType,
      requiredMode: 'optional',
      unitText: '',
      decimalPlaces: 1,
      enumOptions: '',
      isResultStatusField: false,
      resultStatusMapping: {},
      showInDesktopGrid: true,
      showInMobileCard: fieldKind === 'evidence_slot' || dataType === 'single_select',
      showInReport: true,
      reportPriority: 'secondary',
      maxMediaCount: 10,
      isCriticalEvidence: false,
      sortOrder: 0,
      formulaDsl: '',
    };

    setState((s) => ({
      ...s,
      sections: s.sections.map((sec) => {
        if (sec.key !== sectionKey) return sec;
        return {
          ...sec,
          fields: [...sec.fields, { ...newField, sortOrder: sec.fields.length }],
        };
      }),
    }));
  };

  const removeField = (sectionKey: string, fieldKey: string) => {
    setState((s) => ({
      ...s,
      sections: s.sections.map((sec) => {
        if (sec.key !== sectionKey) return sec;
        return { ...sec, fields: sec.fields.filter((f) => f.key !== fieldKey) };
      }),
    }));
  };

  const updateField = (sectionKey: string, fieldKey: string, updates: Partial<DesignerField>) => {
    setState((s) => ({
      ...s,
      sections: s.sections.map((sec) => {
        if (sec.key !== sectionKey) return sec;
        return {
          ...sec,
          fields: sec.fields.map((f) => f.key === fieldKey ? { ...f, ...updates } : f),
        };
      }),
    }));
  };

  // Build API payload
  const buildPayload = useCallback((): CreateDesignVersionRequest => {
    return {
      axes: {
        groupAxisLabel: state.groupAxisLabel,
        rowAxisLabel: state.rowAxisLabel,
      },
      sections: state.sections
        .filter((sec) => sec.fields.length > 0 || sec.scope === 'matrix')
        .map((sec) => ({
          name: sec.name,
          scope: sec.scope,
          description: sec.description || undefined,
          sortOrder: sec.sortOrder,
          isCollapsible: sec.isCollapsible,
          defaultExpanded: sec.defaultExpanded,
          fields: sec.fields.map((f) => ({
            label: f.label,
            fieldKind: f.fieldKind,
            dataType: f.dataType,
            scope: sec.scope,
            requiredMode: f.requiredMode,
            unitText: f.unitText || undefined,
            decimalPlaces: f.decimalPlaces,
            enumOptions: f.enumOptions ? f.enumOptions.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
            isResultStatusField: f.isResultStatusField,
            resultStatusMapping: Object.keys(f.resultStatusMapping).length > 0 ? f.resultStatusMapping : undefined,
            maxMediaCount: f.maxMediaCount,
            allowedMediaTypes: f.dataType === 'image_slot' ? ['image'] : f.dataType === 'video_slot' ? ['video'] : ['image', 'video'],
            isCriticalEvidence: f.isCriticalEvidence,
            showInDesktopGrid: f.showInDesktopGrid,
            showInMobileCard: f.showInMobileCard,
            showInReport: f.showInReport,
            reportPriority: f.reportPriority,
            sortOrder: f.sortOrder,
            formulaDsl: f.fieldKind === 'formula' && f.formulaDsl ? f.formulaDsl : undefined,
          })),
        })),
    };
  }, [state]);

  // Submit design
  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const payload = buildPayload();
      const res = await fetch(`/api/matrices/${matrixId}/design-versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.code === 0) {
        const versionId = json.data.version.id;
        // Confirm the design
        const confirmRes = await fetch(`/api/matrix-design-versions/${versionId}`, {
          method: 'POST',
        });
        const confirmJson = await confirmRes.json();
        if (confirmJson.code === 0) {
          toast.success('矩阵设计已确认，可以开始录入');
          onConfirmed();
        } else {
          toast.error(confirmJson.message || '确认失败');
        }
      } else {
        toast.error(json.message || '创建设计版本失败');
      }
    } catch {
      toast.error('提交失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const steps = ['基础结构', '字段分区', '字段与证据', '公式与问题', '预览确认'];
  const hasSections = state.sections.some((s) => s.fields.length > 0);

  return (
    <div className="space-y-4">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="sm" onClick={onBack}>← 返回</Button>
        <div className="flex-1 flex items-center justify-center gap-1">
          {steps.map((label, i) => (
            <div key={i} className="flex items-center gap-1">
              <Badge variant={i === step ? 'default' : i < step ? 'secondary' : 'outline'} className="text-xs">
                {i < step ? <Check className="h-3 w-3" /> : i + 1}
              </Badge>
              <span className={`text-xs ${i === step ? 'font-medium' : 'text-muted-foreground'}`}>{label}</span>
              {i < steps.length - 1 && <div className="w-4 h-px bg-border" />}
            </div>
          ))}
        </div>
      </div>

      {/* Step content */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          {step === 0 && (
            <div className="space-y-4">
              <h3 className="font-semibold">步骤 1/5：基础结构</h3>
              <p className="text-sm text-muted-foreground">
                为矩阵设置分组轴（如“食材”、“产品”）和行轴（如“口径”、“批次”）名称。
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>一级分组名称</Label>
                  <Input value={state.groupAxisLabel} onChange={(e) => setGroupAxis(e.target.value)} placeholder="如：食材、场景、产品" />
                  <p className="text-xs text-muted-foreground">在此矩阵中，每一组数据的共同特征名称</p>
                </div>
                <div className="space-y-2">
                  <Label>行名称</Label>
                  <Input value={state.rowAxisLabel} onChange={(e) => setRowAxis(e.target.value)} placeholder="如：口径、批次、配置" />
                  <p className="text-xs text-muted-foreground">每一行数据的标识名称</p>
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <h3 className="font-semibold">步骤 2/5：字段分区</h3>
              <p className="text-sm text-muted-foreground">
                创建分区来组织字段。常用分区：测量记录、计算结果、体验观察、证据与问题。
              </p>
              <div className="space-y-3">
                {state.sections.map((sec, idx) => (
                  <Card key={sec.key} className="border-dashed">
                    <CardContent className="py-3 flex items-center gap-3">
                      <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                      <Input
                        className="flex-1"
                        value={sec.name}
                        onChange={(e) => updateSection(sec.key, { name: e.target.value })}
                        placeholder="分区名称"
                      />
                      <Input
                        className="w-32"
                        value={sec.description}
                        onChange={(e) => updateSection(sec.key, { description: e.target.value })}
                        placeholder="说明（可选）"
                      />
                      <Badge variant="outline" className="text-xs">{sec.scope}</Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => removeSection(sec.key)}
                        disabled={state.sections.length <= 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
                <Button variant="outline" size="sm" onClick={() => addSection('row')}>
                  <Plus className="mr-2 h-4 w-4" /> 添加行级分区
                </Button>
                <Button variant="outline" size="sm" onClick={() => addSection('group')}>
                  <Plus className="mr-2 h-4 w-4" /> 添加分组级分区
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h3 className="font-semibold">步骤 3/5：字段与证据</h3>
              <p className="text-sm text-muted-foreground">
                在每个分区中添加字段。选择一个分区，然后添加所需字段。
              </p>
              {state.sections.map((sec) => (
                <div key={sec.key} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm">{sec.name}</h4>
                    <Select onValueChange={(v) => addField(sec.key, v as FieldDataType)}>
                      <SelectTrigger className="w-36 h-8 text-xs">
                        <SelectValue placeholder="+ 添加字段" />
                      </SelectTrigger>
                      <SelectContent>
                        {FIELD_TYPE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value} className="text-xs">
                            <span className="flex items-center gap-2">{opt.icon}{opt.label}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {sec.fields.length === 0 ? (
                    <p className="text-xs text-muted-foreground">暂无字段，点击上方按钮添加</p>
                  ) : (
                    <div className="space-y-2">
                      {sec.fields.map((f) => (
                        <Card key={f.key} className="border">
                          <CardContent className="py-2 px-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <GripVertical className="h-3 w-3 text-muted-foreground" />
                              <Input
                                className="h-7 w-32 text-xs"
                                value={f.label}
                                onChange={(e) => updateField(sec.key, f.key, { label: e.target.value })}
                                placeholder="字段名"
                              />
                              <Badge variant="outline" className="text-[10px]">
                                {FIELD_TYPE_OPTIONS.find((t) => t.value === f.dataType)?.label ?? f.dataType}
                              </Badge>

                              {/* Unit text for number/duration */}
                              {(f.dataType === 'number' || f.dataType === 'percentage' || f.dataType === 'duration') && (
                                <Input
                                  className="h-7 w-16 text-xs"
                                  value={f.unitText}
                                  onChange={(e) => updateField(sec.key, f.key, { unitText: e.target.value })}
                                  placeholder="单位"
                                />
                              )}

                              {/* Required toggle */}
                              <Select
                                value={f.requiredMode}
                                onValueChange={(v) => updateField(sec.key, f.key, { requiredMode: v as RequiredMode })}
                              >
                                <SelectTrigger className="h-7 w-20 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="optional" className="text-xs">可选</SelectItem>
                                  <SelectItem value="required" className="text-xs">必填</SelectItem>
                                </SelectContent>
                              </Select>

                              {/* Decimal places for numbers */}
                              {f.dataType === 'number' && (
                                <Select
                                  value={String(f.decimalPlaces)}
                                  onValueChange={(v) => updateField(sec.key, f.key, { decimalPlaces: Number(v) })}
                                >
                                  <SelectTrigger className="h-7 w-16 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {[0, 1, 2, 3, 4].map((d) => (
                                      <SelectItem key={d} value={String(d)} className="text-xs">{d} 位小数</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}

                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 ml-auto"
                                onClick={() => removeField(sec.key, f.key)}
                              >
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            </div>

                            {/* Enum options for single_select/multi_select */}
                            {(f.dataType === 'single_select' || f.dataType === 'multi_select') && (
                              <div className="mt-1">
                                <Input
                                  className="h-7 text-xs"
                                  value={f.enumOptions}
                                  onChange={(e) => updateField(sec.key, f.key, { enumOptions: e.target.value })}
                                  placeholder="选项（用逗号分隔），如：符合预期,待观察,未符合预期"
                                />
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h3 className="font-semibold">步骤 4/5：公式与问题规则</h3>
              <p className="text-sm text-muted-foreground">
                配置计算结果字段的公式，以及问题槽位的规则。
              </p>

              {/* Formula fields */}
              <div className="space-y-3">
                {state.sections.flatMap((sec) =>
                  sec.fields.filter((f) => f.fieldKind === 'formula').map((f) => (
                    <Card key={f.key}>
                      <CardContent className="py-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{f.label}</span>
                          <Badge variant="outline" className="text-[10px]">公式字段</Badge>
                        </div>
                        <Textarea
                          className="text-xs font-mono"
                          value={f.formulaDsl}
                          onChange={(e) => updateField(sec.key, f.key, { formulaDsl: e.target.value })}
                          placeholder={`例如：ROUND(SELF("成品重量") / SELF("原料重量"), 4)`}
                          rows={2}
                        />
                        <p className="text-[11px] text-muted-foreground">
                          使用 SELF(&quot;字段名&quot;) 引用同一行的其他字段。支持 ROUND、IF、ABS、SUM。
                        </p>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>

              {/* Result status mapping */}
              <div className="space-y-2">
                <p className="text-sm font-medium">结果状态映射</p>
                <p className="text-xs text-muted-foreground">
                  选择一个单选字段作为结果状态字段，映射其选项到 pass/observe/fail/not_applicable。
                </p>
                {state.sections.flatMap((sec) =>
                  sec.fields
                    .filter((f) => f.dataType === 'single_select' && f.enumOptions)
                    .map((f) => (
                      <div key={f.key} className="flex items-center gap-3">
                        <Switch
                          checked={f.isResultStatusField}
                          onCheckedChange={(v) => updateField(sec.key, f.key, { isResultStatusField: v })}
                        />
                        <span className="text-sm">{f.label}</span>
                        {f.isResultStatusField && f.enumOptions && (
                          <div className="flex gap-2">
                            {f.enumOptions.split(',').map((opt) => (
                              <Select
                                key={opt}
                                value={f.resultStatusMapping[opt.trim()] ?? ''}
                                onValueChange={(v) => {
                                  const newMap = { ...f.resultStatusMapping, [opt.trim()]: v as ResultStatusMappingValue };
                                  updateField(sec.key, f.key, { resultStatusMapping: newMap });
                                }}
                              >
                                <SelectTrigger className="h-7 w-32 text-xs">
                                  <SelectValue placeholder={`${opt.trim()} → ?`} />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pass" className="text-xs">通过</SelectItem>
                                  <SelectItem value="observe" className="text-xs">待观察</SelectItem>
                                  <SelectItem value="fail" className="text-xs">未通过</SelectItem>
                                  <SelectItem value="not_applicable" className="text-xs">不适用</SelectItem>
                                </SelectContent>
                              </Select>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                )}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h3 className="font-semibold">步骤 5/5：预览与确认</h3>
              <p className="text-sm text-muted-foreground">
                确认矩阵结构后，将生成设计版本并进入录入模式。
              </p>

              {/* Preview summary */}
              <Card className="border-dashed">
                <CardHeader>
                  <CardTitle className="text-base">矩阵结构预览</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div>
                    <span className="font-medium">分组轴：</span>{state.groupAxisLabel}
                    <span className="mx-2">|</span>
                    <span className="font-medium">行轴：</span>{state.rowAxisLabel}
                  </div>
                  <div className="font-medium">分区与字段：</div>
                  {state.sections.filter((s) => s.fields.length > 0).map((sec) => (
                    <div key={sec.key} className="ml-4">
                      <div className="font-medium text-xs text-muted-foreground">▸ {sec.name}</div>
                      {sec.fields.map((f) => (
                        <div key={f.key} className="ml-4 text-xs flex items-center gap-2">
                          <span>{f.label}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {FIELD_TYPE_OPTIONS.find((t) => t.value === f.dataType)?.label}
                          </Badge>
                          {f.unitText && <span className="text-muted-foreground">({f.unitText})</span>}
                          {f.requiredMode === 'required' && <Badge className="text-[10px] bg-red-100 text-red-800">必填</Badge>}
                        </div>
                      ))}
                    </div>
                  ))}
                  {!hasSections && (
                    <p className="text-muted-foreground text-xs">暂无字段。请返回前面的步骤添加字段。</p>
                  )}
                </CardContent>
              </Card>

              <div className="flex justify-center">
                <Button onClick={handleConfirm} disabled={submitting || !hasSections} size="lg">
                  {submitting ? '提交中...' : '确认并开始录入'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation buttons */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
          <ChevronLeft className="mr-2 h-4 w-4" /> 上一步
        </Button>
        {step < 4 && (
          <Button onClick={() => setStep(step + 1)}>
            下一步 <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
