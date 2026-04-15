'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Play, AlertTriangle, FileText, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface TaskDetail {
  id: string;
  task_name: string;
  product_category: string;
  product_model: string;
  project_phase: string | null;
  test_date: string | null;
  organizer: string | null;
  target_user: string | null;
  test_purpose: string | null;
  test_method: string | null;
  status: string;
  assigned_to: string | null;
  created_at: string;
  records: CheckRecord[];
  issues: Issue[];
}

interface CheckRecord {
  id: string;
  sensory_dimension: string | null;
  check_item: string;
  evaluation_result: string;
  problem_description: string | null;
}

interface Issue {
  id: string;
  title: string;
  severity: string;
  status: string;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  '待执行': { label: '待执行', color: 'bg-muted text-muted-foreground' },
  '进行中': { label: '进行中', color: 'bg-primary/10 text-primary' },
  '待审核': { label: '待审核', color: 'bg-amber-100 text-amber-700' },
  '已完成': { label: '已完成', color: 'bg-emerald-100 text-emerald-700' },
  '已驳回': { label: '已驳回', color: 'bg-destructive/10 text-destructive' },
};

const resultColors: Record<string, string> = {
  '合格': 'text-emerald-600',
  '不合格': 'text-destructive',
  '待定': 'text-amber-600',
};

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/tasks/${id}`)
      .then((r) => r.json())
      .then((res) => { if (res.code === 0) setTask(res.data); })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-6 animate-pulse space-y-4"><div className="h-8 bg-muted rounded w-64" /></div>;
  if (!task) return <div className="p-6">任务不存在</div>;

  const completedRecords = task.records?.filter((r) => r.evaluation_result !== '待定').length || 0;
  const totalRecords = task.records?.length || 0;
  const progress = totalRecords > 0 ? Math.round((completedRecords / totalRecords) * 100) : 0;

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" className="shrink-0" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold truncate">{task.task_name}</h1>
            <Badge variant="secondary" className={cn('text-[10px]', statusConfig[task.status]?.color)}>
              {statusConfig[task.status]?.label || task.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{task.product_model} | {task.product_category}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          {(task.status === '待执行' || task.status === '进行中') && (
            <Link href={`/tasks/${id}/walkthrough`}>
              <Button size="sm"><Play className="h-4 w-4 mr-1.5" /> 开始走查</Button>
            </Link>
          )}
        </div>
      </div>

      {/* Progress */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">走查进度</span>
            <span className="text-sm text-muted-foreground">{completedRecords}/{totalRecords} ({progress}%)</span>
          </div>
          <Progress value={progress} className="h-2" />
          <div className="grid grid-cols-3 gap-3 mt-3">
            <div className="text-center">
              <p className="text-lg font-semibold text-emerald-600">{task.records?.filter(r => r.evaluation_result === '合格').length || 0}</p>
              <p className="text-[10px] text-muted-foreground">合格</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-destructive">{task.records?.filter(r => r.evaluation_result === '不合格').length || 0}</p>
              <p className="text-[10px] text-muted-foreground">不合格</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-amber-600">{task.records?.filter(r => r.evaluation_result === '待定').length || 0}</p>
              <p className="text-[10px] text-muted-foreground">待定</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Info + Issues */}
      <Tabs defaultValue="info">
        <TabsList className="w-full">
          <TabsTrigger value="info" className="flex-1">基本信息</TabsTrigger>
          <TabsTrigger value="records" className="flex-1">检查记录 ({totalRecords})</TabsTrigger>
          <TabsTrigger value="issues" className="flex-1">问题 ({task.issues?.length || 0})</TabsTrigger>
        </TabsList>
        <TabsContent value="info" className="mt-3">
          <Card>
            <CardContent className="p-4 space-y-3">
              {[
                { label: '项目阶段', value: task.project_phase },
                { label: '体验时间', value: task.test_date },
                { label: '组织人', value: task.organizer },
                { label: '目标人群', value: task.target_user },
                { label: '体验目的', value: task.test_purpose },
                { label: '体验方法', value: task.test_method },
              ].map((item) => (
                <div key={item.label} className="flex gap-4">
                  <span className="text-xs text-muted-foreground w-20 shrink-0">{item.label}</span>
                  <span className="text-sm">{item.value || '-'}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="records" className="mt-3">
          <div className="space-y-2">
            {task.records?.map((record) => (
              <Card key={record.id}>
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{record.check_item}</p>
                    {record.problem_description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{record.problem_description}</p>
                    )}
                  </div>
                  <span className={cn('text-xs font-medium shrink-0 ml-2', resultColors[record.evaluation_result] || 'text-muted-foreground')}>
                    {record.evaluation_result}
                  </span>
                </CardContent>
              </Card>
            ))}
            {(!task.records || task.records.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-8">暂无检查记录</p>
            )}
          </div>
        </TabsContent>
        <TabsContent value="issues" className="mt-3">
          <div className="space-y-2">
            {task.issues?.map((issue) => (
              <Link key={issue.id} href={`/issues/${issue.id}`}>
                <Card className="hover:bg-muted/30 transition-colors">
                  <CardContent className="p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      <span className="text-sm truncate">{issue.title}</span>
                    </div>
                    <Badge variant="secondary" className="text-[10px] shrink-0 ml-2">{issue.severity}</Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
            {(!task.issues || task.issues.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-8">暂无问题</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
