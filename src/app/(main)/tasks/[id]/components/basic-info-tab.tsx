'use client';

import { Card, CardContent } from '@/components/ui/card';
import { InlineEditable } from '@/components/inline-editable';
import { patchInlineValue } from '@/lib/inline-save-helpers';
import type { TaskDetail } from '../types';

export function BasicInfoTab({ task, onRefresh }: { task: TaskDetail; onRefresh: () => void }) {
  const fields = [
    { label: '任务名称', key: 'task_name' as const, type: 'inline-text' as const },
    { label: '产品品类', key: 'product_category' as const, type: 'inline-text' as const },
    { label: '产品', key: 'product' as const, type: 'inline-text' as const },
    { label: '产品型号', key: 'product_model' as const, type: 'inline-text' as const },
    { label: '项目单号', key: 'project_number' as const, type: 'inline-text' as const },
    { label: '项目类型', key: 'project_type' as const, type: 'inline-text' as const },
    { label: '项目阶段', key: 'project_phase' as const, type: 'inline-text' as const },
    { label: '体验时间', key: 'test_date' as const, type: 'inline-text' as const },
    { label: '组织人', key: 'organizer' as const, type: 'inline-text' as const },
    { label: '目标人群', key: 'target_user' as const, type: 'inline-text' as const },
    { label: '体验目的', key: 'test_purpose' as const, type: 'inline-textarea' as const },
    { label: '体验方法', key: 'test_method' as const, type: 'inline-textarea' as const },
    { label: '状态', key: 'status' as const, type: 'inline-text' as const },
  ];

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        {fields.map((field) => (
          <div key={field.key} className="flex gap-4">
            <span className="text-xs text-muted-foreground w-20 shrink-0">{field.label}</span>
            {/* InlineEditable 字段：无论是否处于编辑模式都支持点击即编辑 + 自动保存 */}
            {field.type === 'inline-text' && (
              <div className="flex-1 min-w-0">
                <InlineEditable.Text
                  value={task[field.key] ?? ''}
                  placeholder={`输入${field.label}...`}
                  onSave={async (v) => {
                    const result = await patchInlineValue('report_summary', task.id, field.key, v);
                    onRefresh();
                    return result;
                  }}
                  className="w-full"
                  inputClassName="h-7 text-sm"
                />
              </div>
            )}
            {field.type === 'inline-textarea' && (
              <div className="flex-1 min-w-0">
                <InlineEditable.Textarea
                  value={task[field.key] ?? ''}
                  placeholder={`输入${field.label}...`}
                  rows={2}
                  onSave={async (v) => {
                    const result = await patchInlineValue('report_summary', task.id, field.key, v);
                    onRefresh();
                    return result;
                  }}
                  className="w-full"
                  inputClassName="text-sm"
                />
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
