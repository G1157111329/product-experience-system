'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Filter, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MediaGallery } from '@/components/app/media-gallery';
import { InlineEditable } from '@/components/inline-editable';
import { patchInlineValue } from '@/lib/inline-save-helpers';
import { cn } from '@/lib/utils';
import { DeletionImpactDialog } from '@/components/deletion-impact-dialog';
import { loadDeletionImpact } from '@/lib/deletion-impact-ui';
import { useDeletionFlowController } from '@/hooks/use-deletion-flow-controller';
import type { CheckRecord, EvidenceBindingTarget, Material } from '../types';
import { toast } from 'sonner';

type SensesInputWorkspaceProps = {
  records: CheckRecord[];
  focusedRecordId?: string;
  recordMaterials: Record<string, Material[]>;
  onCreateRecord: () => void;
  onEditRecord: (record: CheckRecord) => void;
  onDeleteRecord: (record: CheckRecord) => Promise<void>;
  onPreview: (url: string) => void;
  onBindingTargetChange: (target: EvidenceBindingTarget | null) => void;
  onMaterialsChange?: () => void;
  onRecordPatched?: (recordId: string, patch: Partial<CheckRecord>) => void;
  attemptNavigation: (next: () => void) => Promise<void>;
};

function getRecordTitle(record: CheckRecord) {
  return record.check_item || record.check_standard || record.experience_standard || '未命名检查项';
}

function isPassed(record: CheckRecord) {
  return record.evaluation_result === '合格';
}

function isFailed(record: CheckRecord) {
  return record.evaluation_result === '不合格';
}

export function SensesInputWorkspace({
  records,
  focusedRecordId,
  recordMaterials,
  onCreateRecord,
  onEditRecord,
  onDeleteRecord,
  onPreview,
  onBindingTargetChange,
  onMaterialsChange,
  onRecordPatched,
  attemptNavigation,
}: SensesInputWorkspaceProps) {
  const [selectedId, setSelectedId] = useState(records[0]?.id || '');
  const lastFocusedRecordId = useRef<string | undefined>(undefined);
  const selectedRecord = useMemo(
    () => records.find((record) => record.id === selectedId) || records[0] || null,
    [records, selectedId]
  );

  const failedRecords = records.filter(isFailed);
  const deletion = useDeletionFlowController({
    load: (target) => loadDeletionImpact(target.kind, target.id),
    remove: async (target) => {
      const record = records.find((item) => item.id === target.id);
      if (!record) throw new Error('删除目标不存在，请刷新后重试');
      await onDeleteRecord(record);
      onBindingTargetChange(null);
    },
    refresh: async () => { await onMaterialsChange?.(); },
    onError: (error) => toast.error(error instanceof Error ? error.message : '删除失败，请稍后重试'),
  });

  const selectRecord = (record: CheckRecord) => {
    void attemptNavigation(() => {
      setSelectedId(record.id);
      onBindingTargetChange({ type: 'record', id: record.id, label: '当前五感记录' });
    });
  };

  const requestRecordDelete = (record: CheckRecord) => {
    void attemptNavigation(async () => {
      await deletion.request({ kind: 'record', id: record.id, label: getRecordTitle(record) });
    });
  };

  useEffect(() => {
    if (!focusedRecordId) {
      lastFocusedRecordId.current = undefined;
      return;
    }
    if (lastFocusedRecordId.current === focusedRecordId || !records.some((record) => record.id === focusedRecordId)) return;
    lastFocusedRecordId.current = focusedRecordId;
    let frame: number | null = null;
    void attemptNavigation(() => {
      setSelectedId(focusedRecordId);
      onBindingTargetChange({ type: 'record', id: focusedRecordId, label: '来源检查记录' });
      frame = window.requestAnimationFrame(() => {
        document.getElementById(`record-${focusedRecordId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
    return () => { if (frame !== null) window.cancelAnimationFrame(frame); };
  }, [attemptNavigation, focusedRecordId, onBindingTargetChange, records]);

  const bindDroppedMaterial = async (event: React.DragEvent<HTMLElement>, record: CheckRecord) => {
    event.preventDefault();
    event.stopPropagation();
    const materialId = event.dataTransfer.getData('application/x-material-id') || event.dataTransfer.getData('text/plain');
    if (!materialId) return;

    const response = await fetch('/api/materials', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: materialId, record_id: record.id }),
    });
    const data = await response.json().catch(() => ({}));
    if (data.code === 0) {
      selectRecord(record);
      onMaterialsChange?.();
      toast.success('素材已绑定到五感记录');
    } else {
      toast.error(data.message || '素材绑定失败');
    }
  };

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(280px,0.95fr)_minmax(0,1.35fr)]">
      {deletion.state.phase === 'loading' && <p role="status" aria-busy="true" className="col-span-full text-sm text-muted-foreground">正在读取删除影响…</p>}
      <div className="rounded-lg border bg-card p-3 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">五感体验记录</h2>
            <p className="mt-1 text-xs text-muted-foreground">{records.length} 条记录，{failedRecords.length} 条不合格</p>
          </div>
          <Button size="sm" onClick={onCreateRecord}>
            <Plus className="mr-1.5 h-4 w-4" />新增
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant="secondary"><Filter className="mr-1 h-3 w-3" />全部</Badge>
          <Badge variant="outline">不合格 {failedRecords.length}</Badge>
        </div>

        <div className="mt-3 space-y-2">
          {records.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              暂无五感记录，点击新增开始录入。
            </div>
          ) : (
            records.map((record) => {
              const mats = recordMaterials[record.id] || [];
              return (
                <button
                  id={`record-${record.id}`}
                  key={record.id}
                  type="button"
                  onClick={() => selectRecord(record)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => void bindDroppedMaterial(event, record)}
                  className={cn(
                    'w-full rounded-md border p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    selectedRecord?.id === record.id ? 'border-primary bg-primary/5' : 'bg-background',
                    focusedRecordId === record.id && 'ring-2 ring-primary ring-offset-2'
                  )}
                >
                  <div className="flex items-start gap-2">
                    {isPassed(record) ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{getRecordTitle(record)}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge variant="outline" className="text-xs">{record.standard_category || '未分类'}</Badge>
                        <Badge variant={isPassed(record) ? 'secondary' : isFailed(record) ? 'destructive' : 'outline'} className="text-xs">
                          {record.evaluation_result}
                        </Badge>
                        {mats.length > 0 && <Badge variant="outline" className="text-xs">{mats.length} 个证据</Badge>}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="rounded-lg border bg-card p-3 shadow-sm">
        {selectedRecord ? (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold">{getRecordTitle(selectedRecord)}</h3>
                <p className="mt-1 text-xs text-muted-foreground">选中记录后可绑定图片/视频。</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" onClick={() => onEditRecord(selectedRecord)}>完整编辑</Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={deletion.state.phase === 'loading' || deletion.state.phase === 'deleting'}
                  onClick={() => requestRecordDelete(selectedRecord)}
                  aria-label={`删除检查记录 ${getRecordTitle(selectedRecord)}`}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                </Button>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-md bg-muted/40 p-2">
                <div className="text-xs text-muted-foreground">标准类型</div>
                <div className="mt-1 text-sm font-medium">{selectedRecord.standard_category || '-'}</div>
              </div>
              <div className="rounded-md bg-muted/40 p-2">
                <div className="text-xs text-muted-foreground">检查结果</div>
                <div className="mt-1 text-sm font-medium">{selectedRecord.evaluation_result}</div>
              </div>
              <div className="rounded-md bg-muted/40 p-2">
                <div className="text-xs text-muted-foreground">问题等级</div>
                <div className="mt-1 text-sm font-medium">{selectedRecord.problem_level || '-'}</div>
              </div>
            </div>

            <div className="rounded-md border bg-background p-3 space-y-2">
              <div className="text-xs font-medium text-muted-foreground">问题描述</div>
              <InlineEditable.Textarea
                value={selectedRecord.problem_description ?? ''}
                placeholder="点击输入问题描述..."
                rows={3}
                onSave={async (v) => {
                  const result = await patchInlineValue('sensory_record', selectedRecord.id, 'problem_description', v);
                  if (!result.conflict) {
                    onRecordPatched?.(selectedRecord.id, { problem_description: v });
                  }
                  return result;
                }}
              />
            </div>

            <div className="rounded-md border bg-background p-3">
              <div className="mb-2 text-xs font-medium text-muted-foreground">已绑定证据</div>
              <div
                className="rounded-md"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => void bindDroppedMaterial(event, selectedRecord)}
              >
                <MediaGallery materials={recordMaterials[selectedRecord.id] || []} responsive columns={{ mobile: 3, sm: 4 }} onPreview={onPreview} />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
            选择一条记录查看详情
          </div>
        )}
      </div>
      <DeletionImpactDialog
        open={deletion.state.phase === 'confirming' || deletion.state.phase === 'deleting'}
        targetLabel={deletion.state.pending?.label ?? ''}
        impact={deletion.state.impact}
        deleting={deletion.state.phase === 'deleting'}
        onCancel={deletion.cancel}
        onConfirm={deletion.confirm}
      />
    </section>
  );
}
