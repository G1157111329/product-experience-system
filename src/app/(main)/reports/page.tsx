'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, Plus, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Report {
  id: string;
  task_id: string;
  title: string;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
}

interface Task {
  id: string;
  task_name: string;
  product_model: string;
}

const statusColors: Record<string, string> = {
  '草稿': 'bg-muted text-muted-foreground',
  '待审核': 'bg-amber-100 text-amber-700',
  '已审核': 'bg-emerald-100 text-emerald-700',
};

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/reports').then(r => r.json()),
      fetch('/api/tasks').then(r => r.json()),
    ]).then(([reportsRes, tasksRes]) => {
      if (reportsRes.code === 0) setReports(reportsRes.data || []);
      if (tasksRes.code === 0) setTasks(tasksRes.data?.list || []);
    }).finally(() => setLoading(false));
  }, []);

  const handleGenerate = async () => {
    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: selectedTask }),
    });
    const data = await res.json();
    if (data.code === 0) {
      setDialogOpen(false);
      toast.success('报告生成成功');
      // Refresh
      const refresh = await fetch('/api/reports');
      const refreshData = await refresh.json();
      if (refreshData.code === 0) setReports(refreshData.data || []);
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-semibold">报告中心</h1>
          <p className="text-sm text-muted-foreground mt-1">生成和管理体验报告</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1.5" /> 生成报告</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>生成体验报告</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              <div className="space-y-1.5">
                <Label>选择任务 *</Label>
                <Select value={selectedTask} onValueChange={setSelectedTask}>
                  <SelectTrigger><SelectValue placeholder="选择体验任务" /></SelectTrigger>
                  <SelectContent>
                    {tasks.map((task) => (
                      <SelectItem key={task.id} value={task.id}>{task.task_name} - {task.product_model}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleGenerate} className="w-full" disabled={!selectedTask}>
                生成报告
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="grid gap-3">{[1, 2].map((i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />)}</div>
      ) : reports.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center py-12 text-center">
          <FileText className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">暂无报告</p>
          <p className="text-xs text-muted-foreground mt-1">从体验任务生成报告</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {reports.map((report) => (
            <Link key={report.id} href={`/reports/${report.id}`}>
              <Card className="hover:bg-muted/30 transition-colors">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-medium truncate">{report.title}</h3>
                      <Badge className={cn('text-[10px]', statusColors[report.status] || '')}>{report.status}</Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>V{report.version}</span>
                      <span>{new Date(report.updated_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
