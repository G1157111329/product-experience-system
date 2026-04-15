'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, ClipboardList, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface Task {
  id: string;
  task_name: string;
  product_category: string;
  product_model: string;
  project_phase: string | null;
  test_date: string | null;
  organizer: string | null;
  status: string;
  created_at: string;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  '待执行': { label: '待执行', color: 'bg-muted text-muted-foreground' },
  '进行中': { label: '进行中', color: 'bg-primary/10 text-primary' },
  '待审核': { label: '待审核', color: 'bg-amber-100 text-amber-700' },
  '已完成': { label: '已完成', color: 'bg-emerald-100 text-emerald-700' },
  '已驳回': { label: '已驳回', color: 'bg-destructive/10 text-destructive' },
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    task_name: '', product_category: '', product_model: '',
    project_phase: '', test_date: '', organizer: '',
    target_user: '', test_purpose: '', test_method: '',
  });

  const fetchTasks = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (keyword) params.set('keyword', keyword);
    if (filterStatus && filterStatus !== 'all') params.set('status', filterStatus);
    const res = await fetch(`/api/tasks?${params}`);
    const data = await res.json();
    if (data.code === 0) { setTasks(data.data?.list || []); setTotal(data.data?.total || 0); }
    setLoading(false);
  };

  useEffect(() => { fetchTasks(); }, [keyword, filterStatus]);

  const handleCreate = async () => {
    const res = await fetch('/api/tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (data.code === 0) {
      setDialogOpen(false);
      setForm({ task_name: '', product_category: '', product_model: '', project_phase: '', test_date: '', organizer: '', target_user: '', test_purpose: '', test_method: '' });
      fetchTasks();
    }
  };

  const tabs = ['all', '待执行', '进行中', '待审核', '已完成'];

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-semibold">体验计划</h1>
          <p className="text-sm text-muted-foreground mt-1">创建和管理体验任务</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1.5" /> 新建任务</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>创建体验任务</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              <div className="space-y-1.5">
                <Label>任务名称 *</Label>
                <Input placeholder="如：PBJ-F10U1新品体验" value={form.task_name} onChange={(e) => setForm({ ...form, task_name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>产品品类 *</Label>
                  <Select value={form.product_category} onValueChange={(v) => setForm({ ...form, product_category: v })}>
                    <SelectTrigger><SelectValue placeholder="选择品类" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="破壁机">破壁机</SelectItem>
                      <SelectItem value="电饭煲">电饭煲</SelectItem>
                      <SelectItem value="电水壶">电水壶</SelectItem>
                      <SelectItem value="空气炸锅">空气炸锅</SelectItem>
                      <SelectItem value="其他">其他</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>产品型号 *</Label>
                  <Input placeholder="如：PBJ-F10U1" value={form.product_model} onChange={(e) => setForm({ ...form, product_model: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>项目阶段</Label>
                  <Select value={form.project_phase} onValueChange={(v) => setForm({ ...form, project_phase: v })}>
                    <SelectTrigger><SelectValue placeholder="选择阶段" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="新品开发">新品开发</SelectItem>
                      <SelectItem value="竞品对比">竞品对比</SelectItem>
                      <SelectItem value="问题验证">问题验证</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>体验时间</Label>
                  <Input type="date" value={form.test_date} onChange={(e) => setForm({ ...form, test_date: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>体验目的</Label>
                <Textarea placeholder="本次体验的目标" value={form.test_purpose} onChange={(e) => setForm({ ...form, test_purpose: e.target.value })} rows={2} />
              </div>
              <Button onClick={handleCreate} className="w-full" disabled={!form.task_name || !form.product_category || !form.product_model}>
                创建任务
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setFilterStatus(tab)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors',
              filterStatus === tab ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {tab === 'all' ? '全部' : tab}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="搜索型号、任务名称..." className="pl-9" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
      </div>

      {/* Tasks List */}
      {loading ? (
        <div className="grid gap-3">{[1, 2, 3].map((i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}</div>
      ) : tasks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <ClipboardList className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">暂无任务</p>
            <p className="text-xs text-muted-foreground mt-1">创建第一个体验任务开始使用</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {tasks.map((task) => (
            <Link key={task.id} href={`/tasks/${task.id}`}>
              <Card className="hover:bg-muted/30 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-medium truncate">{task.task_name}</h3>
                        <Badge variant="secondary" className={cn('text-[10px]', statusConfig[task.status]?.color)}>
                          {statusConfig[task.status]?.label || task.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                        <span>{task.product_model}</span>
                        {task.product_category && <span>品类: {task.product_category}</span>}
                        {task.project_phase && <span>{task.project_phase}</span>}
                        {task.test_date && <span>{task.test_date}</span>}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
