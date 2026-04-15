'use client';

import { useEffect, useState } from 'react';
import {
  ClipboardList,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface DashboardData {
  taskStats: {
    total: number;
    pending: number;
    inProgress: number;
    review: number;
    completed: number;
    rejected: number;
  };
  issueStats: {
    total: number;
    pending: number;
    inProgress: number;
    verified: number;
    noImprove: number;
    bySeverity: {
      fatal: number;
      serious: number;
      normal: number;
      minor: number;
    };
  };
  recentTasks: Array<{
    id: string;
    task_name: string;
    product_model: string;
    status: string;
    created_at: string;
  }>;
}

const statusMap: Record<string, { label: string; color: string }> = {
  '待执行': { label: '待执行', color: 'bg-muted text-muted-foreground' },
  '进行中': { label: '进行中', color: 'bg-primary/10 text-primary' },
  '待审核': { label: '待审核', color: 'bg-amber-100 text-amber-700' },
  '已完成': { label: '已完成', color: 'bg-emerald-100 text-emerald-700' },
  '已驳回': { label: '已驳回', color: 'bg-destructive/10 text-destructive' },
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard')
      .then((r) => r.json())
      .then((res) => {
        if (res.code === 0) setData(res.data);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-4 lg:p-6 space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 bg-muted rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!data) return <div className="p-6">加载失败</div>;

  const statCards = [
    {
      label: '体验任务',
      value: data.taskStats.total,
      icon: ClipboardList,
      sub: `${data.taskStats.inProgress} 进行中`,
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      label: '问题总数',
      value: data.issueStats.total,
      icon: AlertTriangle,
      sub: `${data.issueStats.pending} 待整改`,
      color: 'text-amber-600',
      bg: 'bg-amber-100',
    },
    {
      label: '已完成任务',
      value: data.taskStats.completed,
      icon: CheckCircle2,
      sub: `${data.taskStats.total > 0 ? Math.round((data.taskStats.completed / data.taskStats.total) * 100) : 0}% 完成率`,
      color: 'text-emerald-600',
      bg: 'bg-emerald-100',
    },
    {
      label: '待审核',
      value: data.taskStats.review,
      icon: Clock,
      sub: `${data.issueStats.verified} 已验证`,
      color: 'text-blue-600',
      bg: 'bg-blue-100',
    },
  ];

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl lg:text-2xl font-semibold">工作台</h1>
          <p className="text-sm text-muted-foreground mt-1">产品体验管理平台概览</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        {statCards.map((card) => (
          <Card key={card.label} className="relative overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                  <p className="text-2xl lg:text-3xl font-bold mt-1">{card.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
                </div>
                <div className={cn('rounded-lg p-2', card.bg)}>
                  <card.icon className={cn('h-4 w-4', card.color)} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Issue Severity */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              问题等级分布
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: '致命', value: data.issueStats.bySeverity.fatal, color: 'bg-red-500' },
              { label: '严重', value: data.issueStats.bySeverity.serious, color: 'bg-amber-500' },
              { label: '一般', value: data.issueStats.bySeverity.normal, color: 'bg-blue-500' },
              { label: '轻微', value: data.issueStats.bySeverity.minor, color: 'bg-emerald-500' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <div className={cn('w-2 h-2 rounded-full', item.color)} />
                <span className="text-sm flex-1">{item.label}</span>
                <span className="text-sm font-medium">{item.value}</span>
                <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn('h-full rounded-full', item.color)}
                    style={{
                      width: data.issueStats.total > 0 ? `${(item.value / data.issueStats.total) * 100}%` : '0%',
                    }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Recent Tasks */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">最近任务</CardTitle>
              <Link
                href="/tasks"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                查看全部 <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {data.recentTasks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                暂无任务，点击
                <Link href="/tasks" className="text-primary hover:underline mx-1">创建任务</Link>
                开始体验
              </div>
            ) : (
              <div className="space-y-2">
                {data.recentTasks.map((task) => (
                  <Link
                    key={task.id}
                    href={`/tasks/${task.id}`}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{task.task_name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{task.product_model}</p>
                    </div>
                    <Badge
                      variant="secondary"
                      className={cn('text-[10px] shrink-0 ml-2', statusMap[task.status]?.color)}
                    >
                      {statusMap[task.status]?.label || task.status}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
