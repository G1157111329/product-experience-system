'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, AlertTriangle, Plus, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface Issue {
  id: string;
  task_id: string;
  title: string;
  product_model: string | null;
  category: string | null;
  severity: string;
  priority: string;
  status: string;
  description: string | null;
  is_improve: boolean | null;
  responsible_person: string | null;
  created_at: string;
}

const severityColors: Record<string, string> = {
  '致命': 'bg-red-100 text-red-700',
  '严重': 'bg-amber-100 text-amber-700',
  '一般': 'bg-blue-100 text-blue-700',
  '轻微': 'bg-emerald-100 text-emerald-700',
};

const statusColors: Record<string, string> = {
  '待整改': 'bg-amber-100 text-amber-700',
  '整改中': 'bg-blue-100 text-blue-700',
  '已验证': 'bg-emerald-100 text-emerald-700',
  '不整改': 'bg-muted text-muted-foreground',
};

export default function IssuesPage() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    task_id: '', title: '', product_model: '', category: '',
    severity: '一般', priority: 'P2', description: '',
    is_improve: true, responsible_person: '', plan_complete_date: '',
  });

  const fetchIssues = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (keyword) params.set('keyword', keyword);
    if (filterStatus && filterStatus !== 'all') params.set('status', filterStatus);
    if (filterSeverity) params.set('severity', filterSeverity);
    const res = await fetch(`/api/issues?${params}`);
    const data = await res.json();
    if (data.code === 0) setIssues(data.data?.list || []);
    setLoading(false);
  };

  useEffect(() => { fetchIssues(); }, [keyword, filterStatus, filterSeverity]);

  const handleCreate = async () => {
    const res = await fetch('/api/issues', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (data.code === 0) {
      setDialogOpen(false);
      fetchIssues();
    }
  };

  const tabs = ['all', '待整改', '整改中', '已验证'];

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-semibold">问题管理</h1>
          <p className="text-sm text-muted-foreground mt-1">跟踪和管理体验问题整改</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1.5" /> 新建问题</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>新建问题</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              <div className="space-y-1.5">
                <Label>问题标题 *</Label>
                <Input placeholder="描述问题" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>严重等级</Label>
                  <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="致命">致命</SelectItem>
                      <SelectItem value="严重">严重</SelectItem>
                      <SelectItem value="一般">一般</SelectItem>
                      <SelectItem value="轻微">轻微</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>优先级</Label>
                  <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="P0">P0</SelectItem>
                      <SelectItem value="P1">P1</SelectItem>
                      <SelectItem value="P2">P2</SelectItem>
                      <SelectItem value="P3">P3</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>产品型号</Label>
                  <Input value={form.product_model} onChange={(e) => setForm({ ...form, product_model: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>问题分类</Label>
                  <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>问题描述</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
              </div>
              <div className="space-y-1.5">
                <Label>责任人</Label>
                <Input value={form.responsible_person} onChange={(e) => setForm({ ...form, responsible_person: e.target.value })} />
              </div>
              <Button onClick={handleCreate} className="w-full" disabled={!form.title}>
                创建问题
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {tabs.map((tab) => (
          <button key={tab} onClick={() => setFilterStatus(tab)}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors',
              filterStatus === tab ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>
            {tab === 'all' ? '全部' : tab}
          </button>
        ))}
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="搜索问题..." className="pl-9" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        </div>
        <Select value={filterSeverity} onValueChange={setFilterSeverity}>
          <SelectTrigger className="w-28"><SelectValue placeholder="等级" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部等级</SelectItem>
            <SelectItem value="致命">致命</SelectItem>
            <SelectItem value="严重">严重</SelectItem>
            <SelectItem value="一般">一般</SelectItem>
            <SelectItem value="轻微">轻微</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Issues List */}
      {loading ? (
        <div className="grid gap-3">{[1, 2, 3].map((i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />)}</div>
      ) : issues.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center py-12 text-center">
          <AlertTriangle className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">暂无问题</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {issues.map((issue) => (
            <Link key={issue.id} href={`/issues/${issue.id}`}>
              <Card className="hover:bg-muted/30 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-medium truncate">{issue.title}</h3>
                        <Badge className={cn('text-[10px]', severityColors[issue.severity] || '')}>{issue.severity}</Badge>
                        <Badge className={cn('text-[10px]', statusColors[issue.status] || '')}>{issue.status}</Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                        {issue.product_model && <span>{issue.product_model}</span>}
                        {issue.category && <span>{issue.category}</span>}
                        {issue.responsible_person && <span>负责人: {issue.responsible_person}</span>}
                        <span>{issue.priority}</span>
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
