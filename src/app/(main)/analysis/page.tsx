'use client';

import { useEffect, useState } from 'react';
import { BarChart3, TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface AnalysisData {
  taskStats: {
    total: number;
    pending: number;
    inProgress: number;
    review: number;
    completed: number;
  };
  issueStats: {
    total: number;
    pending: number;
    inProgress: number;
    verified: number;
    noImprove: number;
    bySeverity: { fatal: number; serious: number; normal: number; minor: number };
  };
  recentTasks: Array<Record<string, string>>;
}

export default function AnalysisPage() {
  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard').then(r => r.json()).then(res => {
      if (res.code === 0) setData(res.data);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-6 animate-pulse space-y-4"><div className="h-8 bg-muted rounded w-48" /><div className="grid grid-cols-2 gap-4"><div className="h-40 bg-muted rounded-lg" /><div className="h-40 bg-muted rounded-lg" /></div></div>;
  }

  if (!data) return <div className="p-6">加载失败</div>;

  const taskCompletionRate = data.taskStats.total > 0
    ? Math.round((data.taskStats.completed / data.taskStats.total) * 100) : 0;
  const issueResolutionRate = data.issueStats.total > 0
    ? Math.round(((data.issueStats.verified + data.issueStats.inProgress) / data.issueStats.total) * 100) : 0;

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div>
        <h1 className="text-xl lg:text-2xl font-semibold">数据分析</h1>
        <p className="text-sm text-muted-foreground mt-1">体验质量数据概览与趋势</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: '任务完成率', value: `${taskCompletionRate}%`, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-100' },
          { label: '问题整改率', value: `${issueResolutionRate}%`, icon: TrendingUp, color: 'text-primary', bg: 'bg-primary/10' },
          { label: '问题总数', value: data.issueStats.total, icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-100' },
          { label: '任务总数', value: data.taskStats.total, icon: BarChart3, color: 'text-blue-600', bg: 'bg-blue-100' },
        ].map((card) => (
          <Card key={card.label}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                  <p className="text-2xl font-bold mt-1">{card.value}</p>
                </div>
                <div className={cn('rounded-lg p-2', card.bg)}>
                  <card.icon className={cn('h-4 w-4', card.color)} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Task Status Distribution */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">任务状态分布</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: '待执行', value: data.taskStats.pending, color: 'bg-muted' },
              { label: '进行中', value: data.taskStats.inProgress, color: 'bg-primary' },
              { label: '待审核', value: data.taskStats.review, color: 'bg-amber-500' },
              { label: '已完成', value: data.taskStats.completed, color: 'bg-emerald-500' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <span className="text-sm w-16 shrink-0">{item.label}</span>
                <div className="flex-1 h-6 bg-muted/50 rounded overflow-hidden">
                  <div
                    className={cn('h-full rounded transition-all', item.color)}
                    style={{ width: data.taskStats.total > 0 ? `${(item.value / data.taskStats.total) * 100}%` : '0%' }}
                  />
                </div>
                <span className="text-sm font-medium w-8 text-right">{item.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Issue Severity Distribution */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">问题等级分布</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: '致命', value: data.issueStats.bySeverity.fatal, color: 'bg-red-500', textColor: 'text-red-600' },
              { label: '严重', value: data.issueStats.bySeverity.serious, color: 'bg-amber-500', textColor: 'text-amber-600' },
              { label: '一般', value: data.issueStats.bySeverity.normal, color: 'bg-blue-500', textColor: 'text-blue-600' },
              { label: '轻微', value: data.issueStats.bySeverity.minor, color: 'bg-emerald-500', textColor: 'text-emerald-600' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <div className={cn('w-2.5 h-2.5 rounded-full', item.color)} />
                <span className="text-sm flex-1">{item.label}</span>
                <span className={cn('text-sm font-medium', item.textColor)}>{item.value}</span>
                <div className="w-24 h-5 bg-muted/50 rounded overflow-hidden">
                  <div
                    className={cn('h-full rounded', item.color)}
                    style={{ width: data.issueStats.total > 0 ? `${(item.value / data.issueStats.total) * 100}%` : '0%' }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Issue Status */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">问题整改进度</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: '待整改', value: data.issueStats.pending, color: 'bg-amber-100 text-amber-700', border: 'border-amber-200' },
                { label: '整改中', value: data.issueStats.inProgress, color: 'bg-blue-100 text-blue-700', border: 'border-blue-200' },
                { label: '已验证', value: data.issueStats.verified, color: 'bg-emerald-100 text-emerald-700', border: 'border-emerald-200' },
                { label: '不整改', value: data.issueStats.noImprove, color: 'bg-muted text-muted-foreground', border: 'border-border' },
              ].map((item) => (
                <div key={item.label} className={cn('rounded-lg p-4 text-center border', item.border)}>
                  <p className="text-2xl font-bold">{item.value}</p>
                  <Badge className={cn('text-[10px] mt-1', item.color)}>{item.label}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
