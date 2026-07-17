'use client';

/**
 * Mobile Matrix Cards — PRD §8.3–8.5
 *
 * Mobile-first view: group list → row cards → row edit page.
 */

import { useState } from 'react';
import { ChevronRight, CheckCircle2, AlertTriangle, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type {
  MatrixReadProjectionV2,
  MatrixRowProjection,
} from '@/lib/matrix/task-matrix-types';

interface MobileMatrixCardsProps {
  projection: MatrixReadProjectionV2;
  taskId: string;
  onRefresh: () => void;
}

export function MobileMatrixCards({ projection, taskId, onRefresh }: MobileMatrixCardsProps) {
  const { groups, summary } = projection;
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  const selectedGroup = groups.find((g) => g.id === selectedGroupId);
  const selectedRow = selectedGroup?.rows.find((r) => r.id === selectedRowId);

  // Row edit page (PRD §8.5)
  if (selectedRow && selectedGroup) {
    return (
      <div className="space-y-4 px-1">
        <Button variant="ghost" size="sm" onClick={() => setSelectedRowId(null)}>
          ← {selectedGroup.groupLabel}
        </Button>
        <RowEditCard row={selectedRow} taskId={taskId} onRefresh={onRefresh} />
      </div>
    );
  }

  // Group detail with row cards (PRD §8.4)
  if (selectedGroup) {
    return (
      <div className="space-y-4 px-1">
        <Button variant="ghost" size="sm" onClick={() => setSelectedGroupId(null)}>
          ← 返回分组列表
        </Button>
        <h3 className="font-semibold">{selectedGroup.groupLabel}</h3>
        <div className="space-y-3">
          {selectedGroup.rows.map((row) => (
            <Card
              key={row.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setSelectedRowId(row.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm">{row.rowLabel}</span>
                  <div className="flex items-center gap-1">
                    {row.completionStatus === 'completed' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                    {row.hasCalculationFailures && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                    {row.hasMissingRequired && <AlertTriangle className="h-4 w-4 text-red-500" />}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Badge variant="outline" className="text-xs">
                    {row.completionStatus === 'completed' ? '已完成' :
                      row.completionStatus === 'in_progress' ? '进行中' :
                        row.completionStatus === 'not_applicable' ? '不适用' :
                          '待补充'}
                  </Badge>
                  {row.primaryFields.map((pf, i) => (
                    <div key={i} className="text-xs text-muted-foreground">
                      <span className="font-medium">{pf.label}:</span> {pf.displayValue}
                    </div>
                  ))}
                </div>
                <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                  <span>证据 {Object.values(row.evidenceCounts).reduce((a, b) => a + b, 0)}</span>
                  <span>问题 {Object.values(row.issueCounts).reduce((a, b) => a + b, 0)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
          <Button variant="outline" size="sm" className="w-full">
            + 新增行
          </Button>
        </div>
      </div>
    );
  }

  // Group list — mobile home (PRD §8.3)
  return (
    <div className="space-y-4 px-1">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{projection.matrix.name}</h3>
        <div className="text-xs text-muted-foreground">
          完成 {summary.completedRows} / {summary.totalRows} 条
        </div>
      </div>

      {summary.anomalousRows > 0 && (
        <div className="flex gap-3 text-xs">
          <Button variant="ghost" size="sm" className="h-7 text-amber-600">
            异常 {summary.anomalousRows} 条
          </Button>
          {summary.pendingIssueRows > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-red-600">
              待补问题 {summary.pendingIssueRows} 条
            </Button>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="h-7 text-xs">仅看未完成</Button>
        <Button variant="outline" size="sm" className="h-7 text-xs">仅看异常</Button>
        <Button variant="outline" size="sm" className="h-7 text-xs">查看小结</Button>
      </div>

      <div className="space-y-3">
        {groups.map((group) => (
          <Card
            key={group.id}
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setSelectedGroupId(group.id)}
          >
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <span className="font-medium text-sm">{group.groupLabel}</span>
                <div className="text-xs text-muted-foreground mt-1">
                  {group.rows.filter((r) => r.completionStatus === 'completed').length} / {group.rows.length} 已完成
                  {group.rows.some((r) => r.hasCalculationFailures || r.hasMissingRequired) && (
                    <span className="text-amber-600 ml-2">
                      {group.rows.filter((r) => r.hasCalculationFailures || r.hasMissingRequired).length} 条异常
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        ))}
        <Button variant="outline" size="sm" className="w-full">
          + 新增分组
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row Edit Card — full mobile edit page (PRD §8.5)
// ---------------------------------------------------------------------------

function RowEditCard({
  row,
}: {
  row: MatrixRowProjection;
  taskId: string;
  onRefresh: () => void;
}) {
  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold">{row.rowLabel}</h4>
          <span className="text-xs text-green-600">已保存</span>
        </div>

        {/* Field values grouped by section would render here */}
        <div className="space-y-3">
          {row.primaryFields.map((pf, i) => (
            <div key={i} className="flex justify-between items-center py-1 border-b border-dashed">
              <span className="text-sm text-muted-foreground">{pf.label}</span>
              <span className="text-sm font-medium">{pf.displayValue}</span>
            </div>
          ))}
        </div>

        {row.primaryFields.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">暂无字段数据</p>
        )}

        <div className="flex gap-2 pt-2">
          <Button size="sm" variant="outline" className="flex-1 h-9 text-xs">
            <Camera className="mr-1 h-4 w-4" /> 拍照上传
          </Button>
          <Button size="sm" variant="outline" className="flex-1 h-9 text-xs">
            <AlertTriangle className="mr-1 h-4 w-4" /> 创建问题
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
