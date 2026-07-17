'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { InlineEditable } from '@/components/inline-editable';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDictLabels } from '@/hooks/useDictionary';
import { normalizeProjectPhase } from '@/lib/dictionary-types';
import { patchInlineValue } from '@/lib/inline-save-helpers';
import {
  getProjectTypeSelectionPatch,
  shouldSelectProjectPhase,
  TASK_PROJECT_TYPES,
} from '@/lib/task-report-info-options';
import { toast } from 'sonner';
import type { CategoryWithProducts, TaskDetail } from '../types';

type InlineField = {
  label: string;
  key: 'task_name' | 'product_model' | 'project_number' | 'test_date' | 'organizer' | 'target_user' | 'test_purpose' | 'test_method' | 'status';
  type: 'inline-text' | 'inline-textarea';
};

const INLINE_FIELDS: InlineField[] = [
  { label: '任务名称', key: 'task_name', type: 'inline-text' },
  { label: '产品型号', key: 'product_model', type: 'inline-text' },
  { label: '项目单号', key: 'project_number', type: 'inline-text' },
  { label: '体验时间', key: 'test_date', type: 'inline-text' },
  { label: '组织人', key: 'organizer', type: 'inline-text' },
  { label: '目标人群', key: 'target_user', type: 'inline-text' },
  { label: '体验目的', key: 'test_purpose', type: 'inline-textarea' },
  { label: '体验方法', key: 'test_method', type: 'inline-textarea' },
  { label: '状态', key: 'status', type: 'inline-text' },
];

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <span className="w-20 shrink-0 pt-2 text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function BasicInfoTab({ task, onRefresh }: { task: TaskDetail; onRefresh: () => void }) {
  const projectPhases = useDictLabels('project_phase_dict');
  const [categories, setCategories] = useState<CategoryWithProducts[]>([]);
  const [savingSelection, setSavingSelection] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/categories')
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled && data.code === 0) setCategories(data.data || []);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const selectedCategory = useMemo(
    () => categories.find((category) => category.name === task.product_category),
    [categories, task.product_category],
  );
  const products = selectedCategory?.products || [];
  const normalizedPhase = normalizeProjectPhase(task.project_phase);

  const saveSelection = async (field: string, patch: Record<string, string | null>) => {
    setSavingSelection(field);
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await response.json();
      if (!response.ok || data.code !== 0) throw new Error(data.message || '保存失败');
      onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSavingSelection(null);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <InfoRow label="产品品类">
          <Select
            value={task.product_category || undefined}
            onValueChange={(productCategory) => void saveSelection('product_category', {
              product_category: productCategory,
              product: null,
            })}
            disabled={savingSelection !== null}
          >
            <SelectTrigger className="h-9" aria-label="产品品类">
              <SelectValue placeholder="选择品类" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.name}>{category.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </InfoRow>

        <InfoRow label="产品">
          <Select
            value={task.product || undefined}
            onValueChange={(product) => void saveSelection('product', { product })}
            disabled={!task.product_category || savingSelection !== null}
          >
            <SelectTrigger className="h-9" aria-label="产品">
              <SelectValue placeholder={task.product_category ? '选择产品' : '请先选择品类'} />
            </SelectTrigger>
            <SelectContent>
              {products.map((product) => (
                <SelectItem key={product.id} value={product.name}>{product.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </InfoRow>

        <InfoRow label="项目类型">
          <Select
            value={task.project_type || undefined}
            onValueChange={(projectType) => void saveSelection(
              'project_type',
              getProjectTypeSelectionPatch(projectType, normalizedPhase || null),
            )}
            disabled={savingSelection !== null}
          >
            <SelectTrigger className="h-9" aria-label="项目类型">
              <SelectValue placeholder="选择项目类型" />
            </SelectTrigger>
            <SelectContent>
              {TASK_PROJECT_TYPES.map((projectType) => (
                <SelectItem key={projectType} value={projectType}>{projectType}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </InfoRow>

        {shouldSelectProjectPhase(task.project_type) && (
          <InfoRow label="项目阶段">
            <Select
              value={normalizedPhase || undefined}
              onValueChange={(projectPhase) => void saveSelection('project_phase', { project_phase: projectPhase })}
              disabled={savingSelection !== null}
            >
              <SelectTrigger className="h-9" aria-label="项目阶段">
                <SelectValue placeholder="选择项目阶段" />
              </SelectTrigger>
              <SelectContent>
                {projectPhases.map((projectPhase) => (
                  <SelectItem key={projectPhase} value={projectPhase}>{projectPhase}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </InfoRow>
        )}

        {INLINE_FIELDS.map((field) => (
          <InfoRow key={field.key} label={field.label}>
            {field.type === 'inline-text' ? (
              <InlineEditable.Text
                value={task[field.key] ?? ''}
                placeholder={`输入${field.label}...`}
                onSave={async (value) => {
                  const result = await patchInlineValue('report_summary', task.id, field.key, value);
                  onRefresh();
                  return result;
                }}
                className="w-full"
                inputClassName="h-7 text-sm"
              />
            ) : (
              <InlineEditable.Textarea
                value={task[field.key] ?? ''}
                placeholder={`输入${field.label}...`}
                rows={2}
                onSave={async (value) => {
                  const result = await patchInlineValue('report_summary', task.id, field.key, value);
                  onRefresh();
                  return result;
                }}
                className="w-full"
                inputClassName="text-sm"
              />
            )}
          </InfoRow>
        ))}
      </CardContent>
    </Card>
  );
}
