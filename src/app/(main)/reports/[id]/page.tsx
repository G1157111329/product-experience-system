'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ReportDetail {
  id: string;
  task_id: string;
  title: string;
  status: string;
  version: number;
  content: {
    task: Record<string, unknown>;
    records: Array<Record<string, unknown>>;
    issues: Array<Record<string, unknown>>;
    generatedAt: string;
  } | null;
  created_at: string;
  updated_at: string;
}

export default function ReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/reports/${id}`).then(r => r.json()).then(res => {
      if (res.code === 0) setReport(res.data);
    }).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-6 animate-pulse space-y-4"><div className="h-8 bg-muted rounded w-64" /></div>;
  if (!report) return <div className="p-6">报告不存在</div>;

  const records = report.content?.records || [];
  const issues = report.content?.issues || [];
  const task = report.content?.task;
  const passCount = records.filter((r) => r.evaluation_result === '合格').length;
  const failCount = records.filter((r) => r.evaluation_result === '不合格').length;

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" className="shrink-0" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold truncate">{report.title}</h1>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
            <Badge variant="secondary" className="text-[10px]">{report.status}</Badge>
            <span>V{report.version}</span>
            {task && <span>{String(task.product_model || '')}</span>}
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: '检查项总数', value: records.length, color: '' },
          { label: '合格', value: passCount, color: 'text-emerald-600' },
          { label: '不合格', value: failCount, color: 'text-destructive' },
          { label: '问题数', value: issues.length, color: 'text-amber-600' },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4 text-center">
              <p className={cn('text-2xl font-bold', stat.color)}>{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Task Info */}
      {task && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">任务信息</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
              {Object.entries(task).filter(([k]) => !['id', 'selected_standards'].includes(k)).map(([key, value]) => (
                <div key={key}>
                  <span className="text-xs text-muted-foreground">{key}</span>
                  <p className="truncate">{String(value || '-')}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Records Table */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">检查记录 ({records.length})</CardTitle></CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">暂无记录</p>
          ) : (
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-3 text-xs font-medium text-muted-foreground">检查项</th>
                    <th className="text-left py-2 pr-3 text-xs font-medium text-muted-foreground">维度</th>
                    <th className="text-left py-2 pr-3 text-xs font-medium text-muted-foreground">结果</th>
                    <th className="text-left py-2 text-xs font-medium text-muted-foreground">问题描述</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record, idx) => (
                    <tr key={idx} className="border-b border-border/50">
                      <td className="py-2 pr-3 max-w-[200px] truncate">{String(record.check_item || '')}</td>
                      <td className="py-2 pr-3 text-xs">{String(record.sensory_dimension || '-')}</td>
                      <td className="py-2 pr-3">
                        <span className={cn(
                          'text-xs font-medium',
                          record.evaluation_result === '合格' && 'text-emerald-600',
                          record.evaluation_result === '不合格' && 'text-destructive',
                          record.evaluation_result === '待定' && 'text-amber-600',
                        )}>{String(record.evaluation_result || '')}</span>
                      </td>
                      <td className="py-2 max-w-[200px] truncate text-xs text-muted-foreground">{String(record.problem_description || '-')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Issues */}
      {issues.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">问题清单 ({issues.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {issues.map((issue, idx) => (
              <div key={idx} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30">
                <Badge className={cn('text-[10px]',
                  issue.severity === '致命' ? 'bg-red-100 text-red-700' :
                  issue.severity === '严重' ? 'bg-amber-100 text-amber-700' :
                  'bg-blue-100 text-blue-700'
                )}>{String(issue.severity || '')}</Badge>
                <span className="text-sm flex-1 truncate">{String(issue.title || '')}</span>
                <Badge variant="secondary" className="text-[10px]">{String(issue.status || '')}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
