'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Filter, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MediaGallery } from '@/components/app/media-gallery';
import { cn } from '@/lib/utils';
import type { CheckRecord, EvidenceBindingTarget, Material } from '../types';

type SensesInputWorkspaceProps = {
  records: CheckRecord[];
  recordMaterials: Record<string, Material[]>;
  onCreateRecord: () => void;
  onEditRecord: (record: CheckRecord) => void;
  onDeleteRecord: (record: CheckRecord) => void;
  onPreview: (url: string) => void;
  onBindingTargetChange: (target: EvidenceBindingTarget | null) => void;
};

function getRecordTitle(record: CheckRecord) {
  return record.check_item || record.check_standard || record.experience_standard || '未命名检查项';
}

function isPassed(record: CheckRecord) {
  return record.evaluation_result === '合格' || record.evaluation_result === '鍚堟牸';
}

function isFailed(record: CheckRecord) {
  return record.evaluation_result === '不合格' || record.evaluation_result === '涓嶅悎鏍?';
}

export function SensesInputWorkspace({
  records,
  recordMaterials,
  onCreateRecord,
  onEditRecord,
  onDeleteRecord,
  onPreview,
  onBindingTargetChange,
}: SensesInputWorkspaceProps) {
  const [selectedId, setSelectedId] = useState(records[0]?.id || '');
  const selectedRecord = useMemo(
    () => records.find((record) => record.id === selectedId) || records[0] || null,
    [records, selectedId]
  );

  const failedRecords = records.filter(isFailed);

  const selectRecord = (record: CheckRecord) => {
    setSelectedId(record.id);
    onBindingTargetChange({ type: 'record', id: record.id, label: '当前五感记录' });
  };

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(280px,0.95fr)_minmax(0,1.35fr)]">
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
                  key={record.id}
                  type="button"
                  onClick={() => selectRecord(record)}
                  className={cn(
                    'w-full rounded-md border p-3 text-left transition-colors hover:bg-muted/50',
                    selectedRecord?.id === record.id ? 'border-primary bg-primary/5' : 'bg-background'
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
                        <Badge variant="outline" className="text-[10px]">{record.standard_category || '未分类'}</Badge>
                        <Badge variant={isPassed(record) ? 'secondary' : isFailed(record) ? 'destructive' : 'outline'} className="text-[10px]">
                          {record.evaluation_result}
                        </Badge>
                        {mats.length > 0 && <Badge variant="outline" className="text-[10px]">{mats.length} 个证据</Badge>}
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
                <p className="mt-1 text-xs text-muted-foreground">选中后，顶部素材证据栏可直接绑定图片/视频。</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" onClick={() => onEditRecord(selectedRecord)}>完整编辑</Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDeleteRecord(selectedRecord)}>
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

            <div className="rounded-md border bg-background p-3">
              <div className="text-xs font-medium text-muted-foreground">问题描述</div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{selectedRecord.problem_description || '暂无问题描述'}</p>
            </div>

            <div className="rounded-md border bg-background p-3">
              <div className="mb-2 text-xs font-medium text-muted-foreground">已绑定证据</div>
              <MediaGallery materials={recordMaterials[selectedRecord.id] || []} responsive columns={{ mobile: 3, sm: 4 }} onPreview={onPreview} />
            </div>
          </div>
        ) : (
          <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
            选择一条记录查看详情
          </div>
        )}
      </div>
    </section>
  );
}
