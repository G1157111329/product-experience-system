'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  ClipboardList, CheckCircle2, AlertTriangle, TrendingUp,
  Download, Filter, BarChart3,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';
import { MetricCard, PageHeader, PageShell, pageActionButtonClass, pageFilterControlClass } from '@/components/app';

interface CoreMetrics {
  totalTasks: number; completedTasks: number; completionRate: number;
  totalIssues: number; rectifiedIssues: number; rectificationRate: number;
}
interface FilterOptions {
  categories: Array<{ id: string; name: string; products: Array<{ id: string; name: string }> }>;
  projectTypes: string[];
  organizers: string[];
}
interface BreakdownItem { tasks: number; completedTasks: number; issues: number; rectifiedIssues: number }

const STATUS_COLORS: Record<string, string> = {
  '待执行': 'bg-slate-400', '进行中': 'bg-blue-500', '待审核': 'bg-violet-500',
  '已完成': 'bg-emerald-500', '已驳回': 'bg-destructive',
};
const LEVEL_COLORS: Record<string, string> = {
  '一类': 'bg-red-500', '二类': 'bg-amber-500', '三类': 'bg-blue-400',
};
const LEVEL_TEXT_COLORS: Record<string, string> = {
  '一类': 'text-red-600', '二类': 'text-amber-600', '三类': 'text-blue-600',
};
const RECT_STATUS_COLORS: Record<string, string> = {
  '待整改': 'bg-amber-100 text-amber-700', '整改中': 'bg-blue-100 text-blue-700',
  '整改完成': 'bg-emerald-100 text-emerald-700', '不整改': 'bg-muted text-muted-foreground',
};

export default function AnalysisPage() {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<CoreMetrics | null>(null);
  const [taskStatusDist, setTaskStatusDist] = useState<Record<string, number>>({});
  const [issueLevelDist, setIssueLevelDist] = useState<Record<string, number>>({});
  const [rectGrid, setRectGrid] = useState<Record<string, Record<string, number>>>({});
  const [byCategoryProduct, setByCategoryProduct] = useState<Record<string, BreakdownItem>>({});
  const [byProjectType, setByProjectType] = useState<Record<string, BreakdownItem>>({});
  const [byOrganizer, setByOrganizer] = useState<Record<string, BreakdownItem>>({});
  const [byIssueLevel, setByIssueLevel] = useState<Record<string, number>>({});
  const [monthTrend, setMonthTrend] = useState<Record<string, BreakdownItem>>({});
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({ categories: [], projectTypes: [], organizers: [] });

  // Filters
  const [fCategory, setFCategory] = useState('all');
  const [fProduct, setFProduct] = useState('all');
  const [fProjectType, setFProjectType] = useState('all');
  const [fOrganizer, setFOrganizer] = useState('all');
  const [fIssueLevel, setFIssueLevel] = useState('all');
  const [fDateFrom, setFDateFrom] = useState('');
  const [fDateTo, setFDateTo] = useState('');

  // Derived: available products for selected category
  const selectedCatData = filterOptions.categories.find(c => c.name === fCategory);
  const availableProducts = selectedCatData?.products || [];

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (fCategory !== 'all') params.set('product_category', fCategory);
    if (fProduct !== 'all') params.set('product', fProduct);
    if (fProjectType !== 'all') params.set('project_type', fProjectType);
    if (fOrganizer !== 'all') params.set('organizer', fOrganizer);
    if (fIssueLevel !== 'all') params.set('issue_level', fIssueLevel);
    if (fDateFrom) params.set('date_from', fDateFrom);
    if (fDateTo) params.set('date_to', fDateTo);

    try {
      const res = await fetch(`/api/analysis?${params}`);
      const data = await res.json();
      if (data.code === 0) {
        setMetrics(data.data.coreMetrics);
        setTaskStatusDist(data.data.taskStatusDist);
        setIssueLevelDist(data.data.issueLevelDist);
        setRectGrid(data.data.issueRectificationGrid);
        setByCategoryProduct(data.data.byCategoryProduct);
        setByProjectType(data.data.byProjectType);
        setByOrganizer(data.data.byOrganizer);
        setByIssueLevel(data.data.byIssueLevel);
        setMonthTrend(data.data.monthTrend);
        setFilterOptions(data.data.filterOptions);
      }
    } finally {
      setLoading(false);
    }
  }, [fCategory, fProduct, fProjectType, fOrganizer, fIssueLevel, fDateFrom, fDateTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleExport = async () => {
    try {
      const res = await fetch('/api/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: 'csv' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.message || '导出失败');
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition') || '';
      const match = disposition.match(/filename="?([^"]+)"?/i);
      downloadCsv(blob, match?.[1] || 'analysis-export.csv');
      toast.success('项目列表导出成功');
    } catch {
      toast.error('导出失败');
    }
  };

  const downloadCsv = (csvContent: string | Blob, filename: string) => {
    const BOM = '\uFEFF';
    const blob = csvContent instanceof Blob ? csvContent : new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const resetFilters = () => {
    setFCategory('all'); setFProduct('all'); setFProjectType('all');
    setFOrganizer('all'); setFIssueLevel('all'); setFDateFrom(''); setFDateTo('');
  };

  const handleCategoryChange = (val: string) => {
    setFCategory(val);
    setFProduct('all'); // Reset product when category changes
  };

  const activeFilterCount = [
    fCategory !== 'all',
    fProduct !== 'all',
    fProjectType !== 'all',
    fOrganizer !== 'all',
    fIssueLevel !== 'all',
    Boolean(fDateFrom),
    Boolean(fDateTo),
  ].filter(Boolean).length;

  if (loading && !metrics) {
    return (
      <PageShell className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-28 bg-muted rounded-lg" />)}
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell className="space-y-5">
      <PageHeader
        title="数据分析"
        description="产品体验核心数据看板"
        actions={isAdmin && (
          <Button variant="outline" size="sm" onClick={handleExport} className={pageActionButtonClass}>
            <Download className="h-4 w-4" /> 导出项目列表
          </Button>
        )}
      />

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">筛选条件</span>
            {activeFilterCount > 0 && <Badge variant="secondary" className="text-[10px]">已启用 {activeFilterCount} 项</Badge>}
            <Button variant="ghost" size="sm" className={cn(pageActionButtonClass, 'ml-auto')} onClick={resetFilters}>重置</Button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
            <div className="space-y-1">
              <Label className="text-xs">品类</Label>
              <Select value={fCategory} onValueChange={handleCategoryChange}>
                <SelectTrigger className={pageFilterControlClass}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部品类</SelectItem>
                  {filterOptions.categories.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">产品</Label>
              <Select value={fProduct} onValueChange={setFProduct} disabled={fCategory === 'all'}>
                <SelectTrigger className={pageFilterControlClass}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部产品</SelectItem>
                  {availableProducts.map(p => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">项目类型</Label>
              <Select value={fProjectType} onValueChange={setFProjectType}>
                <SelectTrigger className={pageFilterControlClass}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部类型</SelectItem>
                  {filterOptions.projectTypes.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">任务人</Label>
              <Select value={fOrganizer} onValueChange={setFOrganizer}>
                <SelectTrigger className={pageFilterControlClass}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  {filterOptions.organizers.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">问题点分类</Label>
              <Select value={fIssueLevel} onValueChange={setFIssueLevel}>
                <SelectTrigger className={pageFilterControlClass}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="一类">一类</SelectItem>
                  <SelectItem value="二类">二类</SelectItem>
                  <SelectItem value="三类">三类</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">开始日期</Label>
              <Input
                type="date"
                lang="zh-CN"
                value={fDateFrom}
                onChange={e => setFDateFrom(e.target.value)}
                className={pageFilterControlClass}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">结束日期</Label>
              <Input
                type="date"
                lang="zh-CN"
                value={fDateTo}
                onChange={e => setFDateTo(e.target.value)}
                className={pageFilterControlClass}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {metrics && (
        <>
          {/* Core Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard label="任务总数" value={metrics.totalTasks} icon={ClipboardList} />
            <MetricCard label="完成率" value={`${metrics.completionRate}%`} icon={CheckCircle2} tone="success" helper={`${metrics.completedTasks}/${metrics.totalTasks} 已完成`} />
            <MetricCard label="问题总数" value={metrics.totalIssues} icon={AlertTriangle} tone="warning" />
            <MetricCard label="问题整改率" value={`${metrics.rectificationRate}%`} icon={TrendingUp} tone="info" helper={`${metrics.rectifiedIssues}/${metrics.totalIssues} 已验证`} />
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            {/* Task Status Distribution */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" /> 任务状态分布
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(taskStatusDist).sort((a, b) => b[1] - a[1]).map(([status, count]) => {
                  const pct = metrics.totalTasks > 0 ? Math.round((count / metrics.totalTasks) * 100) : 0;
                  return (
                    <div key={status} className="flex items-center gap-3">
                      <span className="text-sm w-16 shrink-0">{status}</span>
                      <div className="flex-1 h-6 bg-muted/50 rounded-full overflow-hidden">
                        <div className={cn('h-full rounded-full transition-all', STATUS_COLORS[status] || 'bg-muted')} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-sm font-medium w-8 text-right">{count}</span>
                      <span className="text-xs text-muted-foreground w-10 text-right">{pct}%</span>
                    </div>
                  );
                })}
                {Object.keys(taskStatusDist).length === 0 && <p className="text-center text-muted-foreground text-sm py-4">暂无数据</p>}
              </CardContent>
            </Card>

            {/* Issue Level Distribution */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" /> 问题等级分布
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {['一类', '二类', '三类'].map(level => {
                  const count = issueLevelDist[level] || 0;
                  const pct = metrics.totalIssues > 0 ? Math.round((count / metrics.totalIssues) * 100) : 0;
                  return (
                    <div key={level} className="flex items-center gap-3">
                      <span className={cn('text-sm w-16 shrink-0 font-medium', LEVEL_TEXT_COLORS[level])}>{level}</span>
                      <div className="flex-1 h-6 bg-muted/50 rounded-full overflow-hidden">
                        <div className={cn('h-full rounded-full transition-all', LEVEL_COLORS[level])} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-sm font-medium w-8 text-right">{count}</span>
                      <span className="text-xs text-muted-foreground w-10 text-right">{pct}%</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          {/* Issue Rectification Progress Grid */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" /> 问题整改进度（按状态 × 等级分布）
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium">整改状态</th>
                      <th className="text-center py-2 px-3 text-red-600 font-medium">一类</th>
                      <th className="text-center py-2 px-3 text-amber-600 font-medium">二类</th>
                      <th className="text-center py-2 px-3 text-blue-600 font-medium">三类</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-medium">合计</th>
                    </tr>
                  </thead>
                  <tbody>
                    {['待整改', '整改中', '整改完成', '不整改'].map(status => {
                      const row = rectGrid[status] || {};
                      const rowTotal = (row['一类'] || 0) + (row['二类'] || 0) + (row['三类'] || 0);
                      return (
                        <tr key={status} className="border-b last:border-0">
                          <td className="py-2 px-3"><Badge variant="secondary" className={cn('text-xs', RECT_STATUS_COLORS[status])}>{status}</Badge></td>
                          <td className="text-center py-2 px-3">{row['一类'] || 0}</td>
                          <td className="text-center py-2 px-3">{row['二类'] || 0}</td>
                          <td className="text-center py-2 px-3">{row['三类'] || 0}</td>
                          <td className="text-center py-2 px-3 font-medium">{rowTotal}</td>
                        </tr>
                      );
                    })}
                    <tr className="font-medium">
                      <td className="py-2 px-3">合计</td>
                      <td className="text-center py-2 px-3">{(rectGrid['待整改']?.['一类'] || 0) + (rectGrid['整改中']?.['一类'] || 0) + (rectGrid['整改完成']?.['一类'] || 0) + (rectGrid['不整改']?.['一类'] || 0)}</td>
                      <td className="text-center py-2 px-3">{(rectGrid['待整改']?.['二类'] || 0) + (rectGrid['整改中']?.['二类'] || 0) + (rectGrid['整改完成']?.['二类'] || 0) + (rectGrid['不整改']?.['二类'] || 0)}</td>
                      <td className="text-center py-2 px-3">{(rectGrid['待整改']?.['三类'] || 0) + (rectGrid['整改中']?.['三类'] || 0) + (rectGrid['整改完成']?.['三类'] || 0) + (rectGrid['不整改']?.['三类'] || 0)}</td>
                      <td className="text-center py-2 px-3">{metrics.totalIssues}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="grid lg:grid-cols-2 gap-4">
            {/* By Category + Product */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">按品类-产品分布</CardTitle>
              </CardHeader>
              <CardContent>
                {Object.keys(byCategoryProduct).length === 0 ? (
                  <p className="text-center text-muted-foreground text-sm py-4">暂无数据</p>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(byCategoryProduct).sort((a, b) => b[1].tasks - a[1].tasks).map(([key, item]) => {
                      const rate = item.tasks > 0 ? Math.round((item.completedTasks / item.tasks) * 100) : 0;
                      const iRate = item.issues > 0 ? Math.round((item.rectifiedIssues / item.issues) * 100) : 0;
                      return (
                        <div key={key} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30">
                          <span className="text-sm w-28 shrink-0 truncate" title={key}>{key}</span>
                          <div className="flex-1 grid grid-cols-4 gap-2 text-xs text-center">
                            <div><p className="font-medium text-sm">{item.tasks}</p>任务</div>
                            <div><p className="font-medium text-sm text-emerald-600">{rate}%</p>完成率</div>
                            <div><p className="font-medium text-sm">{item.issues}</p>问题</div>
                            <div><p className="font-medium text-sm text-blue-600">{iRate}%</p>整改率</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* By Project Type */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">按项目类型分布</CardTitle>
              </CardHeader>
              <CardContent>
                {Object.keys(byProjectType).length === 0 ? (
                  <p className="text-center text-muted-foreground text-sm py-4">暂无数据</p>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(byProjectType).sort((a, b) => b[1].tasks - a[1].tasks).map(([pt, item]) => {
                      const rate = item.tasks > 0 ? Math.round((item.completedTasks / item.tasks) * 100) : 0;
                      const iRate = item.issues > 0 ? Math.round((item.rectifiedIssues / item.issues) * 100) : 0;
                      return (
                        <div key={pt} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30">
                          <span className="text-sm w-24 shrink-0 truncate" title={pt}>{pt}</span>
                          <div className="flex-1 grid grid-cols-4 gap-2 text-xs text-center">
                            <div><p className="font-medium text-sm">{item.tasks}</p>任务</div>
                            <div><p className="font-medium text-sm text-emerald-600">{rate}%</p>完成率</div>
                            <div><p className="font-medium text-sm">{item.issues}</p>问题</div>
                            <div><p className="font-medium text-sm text-blue-600">{iRate}%</p>整改率</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* By Organizer */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">按任务人分布</CardTitle>
              </CardHeader>
              <CardContent>
                {Object.keys(byOrganizer).length === 0 ? (
                  <p className="text-center text-muted-foreground text-sm py-4">暂无数据</p>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(byOrganizer).sort((a, b) => b[1].tasks - a[1].tasks).map(([org, item]) => {
                      const rate = item.tasks > 0 ? Math.round((item.completedTasks / item.tasks) * 100) : 0;
                      const iRate = item.issues > 0 ? Math.round((item.rectifiedIssues / item.issues) * 100) : 0;
                      return (
                        <div key={org} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30">
                          <span className="text-sm w-20 shrink-0 truncate" title={org}>{org}</span>
                          <div className="flex-1 grid grid-cols-4 gap-2 text-xs text-center">
                            <div><p className="font-medium text-sm">{item.tasks}</p>任务</div>
                            <div><p className="font-medium text-sm text-emerald-600">{rate}%</p>完成率</div>
                            <div><p className="font-medium text-sm">{item.issues}</p>问题</div>
                            <div><p className="font-medium text-sm text-blue-600">{iRate}%</p>整改率</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* By Issue Level */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">问题点分类分布</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {['一类', '二类', '三类'].map(level => {
                  const count = byIssueLevel[level] || 0;
                  const pct = metrics.totalIssues > 0 ? Math.round((count / metrics.totalIssues) * 100) : 0;
                  return (
                    <div key={level} className="flex items-center gap-3">
                      <span className={cn('text-sm w-16 shrink-0 font-medium', LEVEL_TEXT_COLORS[level])}>{level}</span>
                      <div className="flex-1 h-6 bg-muted/50 rounded-full overflow-hidden">
                        <div className={cn('h-full rounded-full transition-all', LEVEL_COLORS[level])} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-sm font-medium w-8 text-right">{count}</span>
                      <span className="text-xs text-muted-foreground w-10 text-right">{pct}%</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          {/* Monthly Trend */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" /> 月度趋势
              </CardTitle>
            </CardHeader>
            <CardContent>
              {Object.keys(monthTrend).length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-4">暂无数据</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-3 text-muted-foreground font-medium">月份</th>
                        <th className="text-center py-2 px-3 font-medium">任务数</th>
                        <th className="text-center py-2 px-3 font-medium text-emerald-600">完成率</th>
                        <th className="text-center py-2 px-3 font-medium">问题数</th>
                        <th className="text-center py-2 px-3 font-medium text-blue-600">整改率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(monthTrend).sort((a, b) => a[0].localeCompare(b[0])).map(([month, item]) => {
                        const rate = item.tasks > 0 ? Math.round((item.completedTasks / item.tasks) * 100) : 0;
                        const iRate = item.issues > 0 ? Math.round((item.rectifiedIssues / item.issues) * 100) : 0;
                        return (
                          <tr key={month} className="border-b last:border-0">
                            <td className="py-2 px-3">{month}</td>
                            <td className="text-center py-2 px-3">{item.tasks}</td>
                            <td className="text-center py-2 px-3 text-emerald-600">{rate}%</td>
                            <td className="text-center py-2 px-3">{item.issues}</td>
                            <td className="text-center py-2 px-3 text-blue-600">{iRate}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </PageShell>
  );
}
