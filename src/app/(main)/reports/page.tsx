'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { copyToClipboard } from '@/lib/clipboard';
import { BarChart3, ChevronRight, Copy, FileText, Loader2, Printer, Share2, Sparkles, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';
import { getReportMergeModel, isMergeableReportProjectType, sortReportsByCreatedAtDesc } from '@/lib/report-merge';
import {
  ActionDock,
  EmptyState,
  FilterBar,
  LoadingState,
  PageHeader,
  PageShell,
  SearchField,
  pageActionButtonClass,
  pageFilterControlClass,
} from '@/components/app';

interface Report {
  id: string; title: string; product_model: string | null;
  task_id: string; content: Record<string, unknown> | null;
  status: string; version: number; created_at: string;
  summary_stats?: {
    records: number;
    failedRecords: number;
    recipes: number;
    recipeProblems: number;
    media: number;
  };
  project_type?: string | null;
  project_phase?: string | null;
  task_name?: string;
  product_category?: string | null;
  product?: string | null;
  task_created_by?: string | null;
}

interface CompareResult {
  winner_report_id: string | null;
  satisfaction_a: number;
  satisfaction_b: number;
  headline: string;
  summary: string;
  report_a_advantages: string[];
  report_b_advantages: string[];
  key_differences: string[];
  risks: string[];
  recommendation: string;
}

function formatBeijingTime(isoStr: string | null | undefined): string {
  if (!isoStr) return '-';
  try {
    const d = new Date(isoStr);
    const offset = 8 * 60;
    const utc = d.getTime() + d.getTimezoneOffset() * 60000;
    const beijing = new Date(utc + offset * 60000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${beijing.getFullYear()}-${pad(beijing.getMonth() + 1)}-${pad(beijing.getDate())} ${pad(beijing.getHours())}:${pad(beijing.getMinutes())}:${pad(beijing.getSeconds())}`;
  } catch { return String(isoStr); }
}

function getReportReviewStats(report: Report) {
  if (report.summary_stats) return report.summary_stats;

  const content = (report.content || {}) as Record<string, unknown>;
  const records = Array.isArray(content.records) ? content.records as Array<Record<string, unknown>> : [];
  const recipes = Array.isArray(content.recipes) ? content.recipes as Array<Record<string, unknown>> : [];
  const failedRecords = records.filter((record) => String(record.evaluation_result || '').includes('不合格')).length;
  const recipeProblems = recipes.reduce((sum, recipe) => sum + Number(recipe.problem_count || 0), 0);
  const recordMedia = records.reduce((sum, record) => sum + (Array.isArray(record.materials) ? record.materials.length : 0), 0);
  const recipeMedia = recipes.reduce((sum, recipe) => {
    const steps = Array.isArray(recipe.recipe_steps) ? recipe.recipe_steps as Array<Record<string, unknown>> : [];
    const stepMedia = steps.reduce((stepSum, step) => stepSum + (Array.isArray(step.materials) ? step.materials.length : 0), 0);
    const effectMedia = Array.isArray(recipe.effect_materials) ? recipe.effect_materials.length : 0;
    return sum + stepMedia + effectMedia;
  }, 0);

  return {
    records: records.length,
    failedRecords,
    recipes: recipes.length,
    recipeProblems,
    media: recordMedia + recipeMedia,
  };
}

function getScorePercent(score: number | undefined) {
  if (score === undefined || !Number.isFinite(score)) return 0;
  return Math.min(100, Math.max(0, score * 10));
}

function getStatusLabel(status: string) {
  return status === '草稿' ? '已完成' : status;
}

function getCompareProductLabel(report: Report) {
  const parts = [report.product_category, report.product, report.product_model].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : report.title;
}

export default function ReportsPage() {
  const { user, isAdmin } = useAuth();
  const router = useRouter();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [reportScope, setReportScope] = useState<'all' | 'mine'>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [shareReportId, setShareReportId] = useState<string | null>(null);
  const [shareDuration, setShareDuration] = useState<'7d' | '30d' | 'permanent'>('30d');
  const [shareCreating, setShareCreating] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareLinks, setShareLinks] = useState<Array<{ id: string; share_token: string; expires_at: string | null; is_expired: boolean; created_at: string }>>([]);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '200' });
      params.set('scope', reportScope);
      if (keyword.trim()) params.set('keyword', keyword.trim());
      const res = await fetch(`/api/reports?${params}`);
      const data = await res.json();
      if (data.code === 0) setReports(data.data || []);
    } finally { setLoading(false); }
  }, [keyword, reportScope]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const handleDelete = async () => {
    if (!deleteId) return;
    if (!isAdmin || !user?.id) {
      toast.error('仅管理员可删除报告');
      setDeleteId(null);
      return;
    }
    const res = await fetch(`/api/reports/${deleteId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.code === 0) { toast.success('已删除'); fetchReports(); }
    else toast.error(data.message);
    setDeleteId(null);
  };

  const handlePrint = (id: string) => {
    window.open(`/reports/print?id=${id}&mode=fast`, '_blank');
  };

  const canManageReport = useCallback((report: Report | null | undefined) => {
    return Boolean(report && (isAdmin || report.task_created_by === user?.id));
  }, [isAdmin, user?.id]);

  const openShareDialog = async (reportId: string) => {
    const report = reports.find((item) => item.id === reportId);
    if (!canManageReport(report)) {
      toast.error('仅报告负责人或管理员可生成分享链接');
      return;
    }
    setShareReportId(reportId);
    setShareLink(null);
    setShareDuration('30d');
    // Fetch existing share links
    try {
      const res = await fetch(`/api/reports/share/list?report_id=${reportId}`);
      const data = await res.json();
      if (data.code === 0) setShareLinks(data.data || []);
    } catch { setShareLinks([]); }
  };

  const handleCreateShare = async () => {
    if (!shareReportId) return;
    setShareCreating(true);
    try {
      const res = await fetch('/api/reports/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_id: shareReportId, duration: shareDuration }),
      });
      const data = await res.json();
      if (data.code === 0) {
        const token = data.data.share_token;
        const domain = window.location.origin;
        setShareLink(`${domain}/reports/share/${token}`);
        toast.success('分享链接已创建');
        // Refresh share links
        const listRes = await fetch(`/api/reports/share/list?report_id=${shareReportId}`);
        const listData = await listRes.json();
        if (listData.code === 0) setShareLinks(listData.data || []);
      } else {
        toast.error(data.message);
      }
    } finally { setShareCreating(false); }
  };

  const handleCopyLink = (link: string) => {
    copyToClipboard(link).then(() => toast.success('链接已复制')).catch(() => toast.error('复制失败'));
  };

  const handleRevokeShare = async (id: string) => {
    const res = await fetch(`/api/reports/share/list?id=${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.code === 0) {
      toast.success('已撤销');
      setShareLinks(prev => prev.filter(s => s.id !== id));
    }
  };

  const categoryOptions = Array.from(new Set(reports.map(r => r.product_category).filter(Boolean) as string[]));
  const visibleReports = categoryFilter === 'all'
    ? reports
    : reports.filter(r => r.product_category === categoryFilter);
  const selectedCompareReports = compareIds
    .map(id => visibleReports.find(r => r.id === id))
    .filter((report): report is Report => Boolean(report));
  const selectedShareReport = shareReportId ? reports.find(r => r.id === shareReportId) : null;
  const shareDurationOptions = [
    { value: '7d' as const, label: '7天' },
    { value: '30d' as const, label: '30天' },
    { value: 'permanent' as const, label: '永久' },
  ];
  const shareDurationLabel = shareDurationOptions.find(opt => opt.value === shareDuration)?.label || '30天';
  const formatShareExpiry = (share: { expires_at: string | null; is_expired: boolean }) => {
    if (share.is_expired) return '已过期';
    if (!share.expires_at) return '永久有效';
    return `${new Date(share.expires_at).toLocaleDateString('zh-CN')} 前有效`;
  };
  const handleOpenCompare = async () => {
    if (compareIds.length !== 2) {
      toast.error('请选择两份产品体验报告进行对比');
      return;
    }
    setCompareOpen(true);
    setCompareResult(null);
    setCompareError(null);
    setCompareLoading(true);
    try {
      const res = await fetch('/api/reports/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_ids: compareIds }),
      });
      const data = await res.json();
      if (data.code === 0) {
        setCompareResult(data.data.result);
      } else {
        setCompareError(data.message || '产品体验对比失败');
      }
    } catch {
      setCompareError('网络错误，请重试');
    } finally {
      setCompareLoading(false);
    }
  };

  // Group self-developed and cost-optimization reports by product model.
  const grouped: Array<{ key: string; model: string; projectTypes: string[]; reports: Report[] }> = [];
  const modelMap = new Map<string, { model: string; projectTypes: string[]; reports: Report[] }>();
  const ungrouped: Report[] = [];

  for (const r of visibleReports) {
    const pt = r.project_type || '';
    const model = getReportMergeModel(r.product_model);
    if (isMergeableReportProjectType(pt) && model) {
      const key = model;
      if (!modelMap.has(key)) {
        modelMap.set(key, { model, projectTypes: [], reports: [] });
      }
      const group = modelMap.get(key)!;
      if (pt && !group.projectTypes.includes(pt)) group.projectTypes.push(pt);
      group.reports.push(r);
    } else {
      ungrouped.push(r);
    }
  }
  modelMap.forEach((v) => grouped.push({ key: v.model, ...v, reports: sortReportsByCreatedAtDesc(v.reports) }));

  const toggleCompare = (id: string) => {
    setCompareResult(null);
    setCompareError(null);
    setCompareIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 2) {
        toast.error('产品体验对比一次只能选择两份报告');
        return prev;
      }
      return [...prev, id];
    });
  };

  return (
    <PageShell size="wide" className="space-y-4 sm:space-y-6">
      <PageHeader
        title="报告中心"
        description="查看和管理体验报告"
        actions={
        <>
          {/* Toggle: 显示全部 / 显示个人 */}
          {compareIds.length === 2 && (
            <Button size="sm" className={cn(pageActionButtonClass, 'hidden sm:inline-flex')} onClick={handleOpenCompare}>
              <BarChart3 className="h-3.5 w-3.5" /> 产品体验对比 ({compareIds.length})
            </Button>
          )}
        </>
        }
      />

      <FilterBar>
        <div className="flex w-full rounded-lg border bg-background p-1 sm:w-auto" role="tablist" aria-label="报告范围">
          <Button
            type="button"
            role="tab"
            aria-selected={reportScope === 'all'}
            size="sm"
            variant={reportScope === 'all' ? 'default' : 'ghost'}
            className="h-8 flex-1 px-3 text-xs sm:flex-none"
            onClick={() => { setReportScope('all'); setCompareIds([]); }}
          >
            全部报告
          </Button>
          <Button
            type="button"
            role="tab"
            aria-selected={reportScope === 'mine'}
            size="sm"
            variant={reportScope === 'mine' ? 'default' : 'ghost'}
            className="h-8 flex-1 px-3 text-xs sm:flex-none"
            onClick={() => { setReportScope('mine'); setCompareIds([]); }}
          >
            个人报告
          </Button>
        </div>
        <SearchField
          value={keyword}
          onChange={(e) => { setKeyword(e.target.value); setCompareIds([]); }}
          placeholder="搜索报告名称、型号、品类、产品"
        />
        <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setCompareIds([]); }}>
          <SelectTrigger className={cn(pageFilterControlClass, 'w-full sm:w-48')}>
            <SelectValue placeholder="按品类筛选" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部品类</SelectItem>
            {categoryOptions.map(category => (
              <SelectItem key={category} value={category}>{category}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterBar>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>当前显示 {loading ? '-' : visibleReports.length} 份报告</span>
        {categoryFilter !== 'all' && <Badge variant="outline" className="text-[10px]">品类：{categoryFilter}</Badge>}
        {keyword.trim() && <Badge variant="outline" className="max-w-full text-[10px]">关键词：{keyword.trim()}</Badge>}
        {compareIds.length > 0 && <Badge variant="secondary" className="text-[10px]">已选择 {compareIds.length}/2 份用于对比</Badge>}
      </div>

      {/* Content */}
      {loading ? (
        <LoadingState label="正在加载报告" />
      ) : visibleReports.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="暂无匹配报告"
          description={keyword || categoryFilter !== 'all' ? '调整搜索或筛选条件后再试。' : '在体验计划详情页中生成报告。'}
        />
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {/* Grouped reports (merged) */}
          {grouped.map(group => {
            const latestReport = group.reports[0];
            const groupStats = group.reports.reduce((acc, report) => {
              const stats = getReportReviewStats(report);
              acc.records += stats.records;
              acc.failedRecords += stats.failedRecords;
              acc.media += stats.media;
              return acc;
            }, { records: 0, failedRecords: 0, media: 0 });
            return (
              <Card key={group.key} className="overflow-hidden transition-colors hover:border-primary/30">
                <CardHeader className="border-b bg-muted/20 pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base sm:text-lg truncate">{group.model}</CardTitle>
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        {group.projectTypes.map(projectType => (
                          <Badge key={projectType} variant="outline" className="text-[10px]">{projectType}</Badge>
                        ))}
                        {latestReport.product_category && <Badge variant="outline" className="text-[10px] max-w-[120px] truncate">{latestReport.product_category}</Badge>}
                        {latestReport.product && <Badge variant="outline" className="text-[10px] max-w-[120px] truncate">{latestReport.product}</Badge>}
                        <Badge variant="secondary" className="text-[10px]">{group.reports.length} 份报告</Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {canManageReport(latestReport) && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="分享" aria-label="分享" onClick={() => openShareDialog(latestReport.id)}>
                          <Share2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button variant="outline" size="sm" className="shrink-0 text-xs gap-1" title="打印" onClick={() => handlePrint(latestReport.id)}>
                        <Printer className="h-3 w-3" /> 打印
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-3 gap-2 py-3 text-xs">
                    <div className="rounded-md bg-muted/30 p-2">
                      <p className="font-semibold tabular-nums">{groupStats.records}</p>
                      <p className="text-muted-foreground">检查项</p>
                    </div>
                    <div className="rounded-md bg-muted/30 p-2">
                      <p className="font-semibold tabular-nums text-destructive">{groupStats.failedRecords}</p>
                      <p className="text-muted-foreground">不合格</p>
                    </div>
                    <div className="rounded-md bg-muted/30 p-2">
                      <p className="font-semibold tabular-nums">{groupStats.media}</p>
                      <p className="text-muted-foreground">证据</p>
                    </div>
                  </div>
                  <div className="divide-y rounded-md border bg-background">
                    {group.reports.map((r) => (
                      <div key={r.id} className="flex items-center gap-2 px-2.5 py-2 text-sm transition-colors hover:bg-muted/50">
                        <input type="checkbox" checked={compareIds.includes(r.id)} onChange={() => toggleCompare(r.id)}
                          className="h-3.5 w-3.5 shrink-0 rounded border-border" />
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          onClick={() => router.push(`/reports/${r.id}`)}
                        >
                          <span className="flex-1 min-w-0 truncate">{r.title}</span>
                          <Badge variant="outline" className="text-[9px] shrink-0">{r.status === '草稿' ? '已完成' : r.status}</Badge>
                          <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:inline">
                            {formatBeijingTime(r.created_at)}
                          </span>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        </button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Ungrouped reports */}
          {ungrouped.map(r => {
            const stats = getReportReviewStats(r);
            const displayTitle = r.product_model || r.title;
            return (
              <Card key={r.id} className="overflow-hidden transition-colors hover:border-primary/30">
                <CardHeader className="border-b bg-muted/20 pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => router.push(`/reports/${r.id}`)}>
                      <CardTitle className="text-base sm:text-lg truncate">{displayTitle}</CardTitle>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {r.project_type && <Badge variant="outline" className="text-[10px]">{r.project_type}</Badge>}
                        {r.product_category && <Badge variant="outline" className="max-w-[120px] truncate text-[10px]">{r.product_category}</Badge>}
                        {r.product && <Badge variant="outline" className="max-w-[120px] truncate text-[10px]">{r.product}</Badge>}
                        {r.product_model && <Badge variant="outline" className="max-w-[120px] truncate text-[10px]">{r.product_model}</Badge>}
                        <Badge variant="secondary" className="text-[10px]">1 份报告</Badge>
                      </div>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      {canManageReport(r) && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="分享" aria-label="分享" onClick={() => openShareDialog(r.id)}>
                          <Share2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button variant="outline" size="sm" className="shrink-0 gap-1 text-xs" title="打印" onClick={() => handlePrint(r.id)}>
                        <Printer className="h-3 w-3" /> 打印
                      </Button>
                      {isAdmin && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="删除" aria-label="删除" onClick={() => setDeleteId(r.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-3 gap-2 py-3 text-xs">
                    <div className="rounded-md bg-muted/30 p-2">
                      <p className="font-semibold tabular-nums">{stats.records}</p>
                      <p className="text-muted-foreground">检查项</p>
                    </div>
                    <div className="rounded-md bg-muted/30 p-2">
                      <p className="font-semibold tabular-nums text-destructive">{stats.failedRecords}</p>
                      <p className="text-muted-foreground">不合格</p>
                    </div>
                    <div className="rounded-md bg-muted/30 p-2">
                      <p className="font-semibold tabular-nums">{stats.media}</p>
                      <p className="text-muted-foreground">证据</p>
                    </div>
                  </div>
                  <div className="rounded-md border bg-background">
                    <div className="flex items-center gap-2 px-2.5 py-2 text-sm transition-colors hover:bg-muted/50">
                      <input
                        type="checkbox"
                        checked={compareIds.includes(r.id)}
                        onChange={() => toggleCompare(r.id)}
                        className="h-3.5 w-3.5 shrink-0 rounded border-border"
                      />
                      <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => router.push(`/reports/${r.id}`)}>
                        <span className="min-w-0 flex-1 truncate">{r.title}</span>
                        <Badge variant="outline" className="shrink-0 text-[9px]">{getStatusLabel(r.status)}</Badge>
                        <span className="hidden shrink-0 text-[10px] text-muted-foreground sm:inline">{formatBeijingTime(r.created_at)}</span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {compareIds.length > 0 && (
        <ActionDock mobileOnly={false} className="sm:left-auto sm:right-6 sm:bottom-6 sm:w-[28rem]">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium">已选择 {compareIds.length}/2 份体验报告</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {selectedCompareReports.map(getCompareProductLabel).join(' · ') || '请选择两份报告进行产品体验对比'}
              </p>
            </div>
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => setCompareIds([])} aria-label="清空已选报告">
              <X className="h-4 w-4" />
            </Button>
            <Button size="sm" className={cn(pageActionButtonClass, 'shrink-0')} disabled={compareIds.length !== 2} onClick={handleOpenCompare}>
              <BarChart3 className="h-3.5 w-3.5" /> 体验对比
            </Button>
          </div>
        </ActionDock>
      )}

      {/* Delete confirm */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>确认删除</DialogTitle><DialogDescription>删除后不可恢复，确定要删除该报告吗？</DialogDescription></DialogHeader>
          <DialogFooter className="gap-3 sm:gap-3">
            <Button variant="outline" onClick={() => setDeleteId(null)}>取消</Button>
            <Button variant="destructive" onClick={handleDelete}>确认删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Compare dialog */}
      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="max-h-[96vh] w-full max-w-[calc(100vw-32px)] sm:max-w-[1200px] gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-4 py-4 sm:px-8 sm:py-5">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-xl">
              <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5 text-primary" /> 产品体验对比
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm mt-0.5 sm:mt-1">基于两份报告对比两款产品的体验表现、优劣势与关键差异</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[calc(96vh-80px)] sm:max-h-[calc(96vh-88px)]">
            <div className="space-y-5 p-4 sm:space-y-6 sm:p-8">
              <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-2">
              {selectedCompareReports.map((r, idx) => {
                const stats = getReportReviewStats(r);
                const score = idx === 0 ? compareResult?.satisfaction_a : compareResult?.satisfaction_b;
                const isWinner = compareResult?.winner_report_id === r.id;
                const productLabel = getCompareProductLabel(r);
                return (
                <Card key={r.id} className={cn('overflow-hidden', isWinner && 'border-primary/40 bg-primary/[0.03]')}>
                  <CardHeader className="space-y-2 p-4 sm:space-y-3 sm:p-6 sm:pb-4">
                    <div className="flex items-center gap-2.5 sm:gap-3">
                      <div className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full border bg-background text-xs sm:text-sm font-semibold text-foreground">
                        {idx === 0 ? 'A' : 'B'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center justify-between gap-2">
                          <CardTitle className="min-w-0 text-sm sm:text-base leading-snug [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
                            {productLabel}
                          </CardTitle>
                          {isWinner && <Badge className="shrink-0 text-[10px]">体验更优</Badge>}
                        </div>
                        <div className="mt-1 sm:mt-1.5 flex flex-wrap gap-1 sm:gap-1.5">
                          {r.product_category && <Badge variant="outline" className="max-w-[80px] sm:max-w-[96px] truncate text-[10px]">{r.product_category}</Badge>}
                          {r.product && <Badge variant="outline" className="max-w-[80px] sm:max-w-[96px] truncate text-[10px]">{r.product}</Badge>}
                          <Badge variant="outline" className="text-[10px]">{getStatusLabel(r.status)}</Badge>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 sm:space-y-4 p-4 sm:p-6 sm:pt-0 text-xs sm:text-sm text-muted-foreground">
                    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 sm:gap-x-4 gap-y-1.5 sm:gap-y-2">
                      <dt>产品型号</dt><dd className="min-w-0 break-words text-foreground font-medium">{r.product_model || '-'}</dd>
                      <dt>版本</dt><dd className="text-foreground font-medium">V{r.version}</dd>
                      <dt>生成时间</dt><dd className="min-w-0 break-words text-foreground font-medium">{formatBeijingTime(r.created_at)}</dd>
                    </dl>
                    <Separator />
                    <div className="grid grid-cols-3 gap-2 sm:gap-3">
                      <div className="rounded-lg bg-muted/40 px-3 py-2 sm:px-4 sm:py-3">
                        <p className="text-[10px] sm:text-xs text-muted-foreground">检查项</p>
                        <p className="mt-0.5 sm:mt-1 text-base sm:text-lg font-semibold text-foreground tabular-nums">{stats.records}</p>
                      </div>
                      <div className="rounded-lg bg-muted/40 px-3 py-2 sm:px-4 sm:py-3">
                        <p className="text-[10px] sm:text-xs text-muted-foreground">不合格</p>
                        <p className="mt-0.5 sm:mt-1 text-base sm:text-lg font-semibold text-destructive tabular-nums">{stats.failedRecords}</p>
                      </div>
                      <div className="rounded-lg bg-muted/40 px-3 py-2 sm:px-4 sm:py-3">
                        <p className="text-[10px] sm:text-xs text-muted-foreground">功能问题</p>
                        <p className="mt-0.5 sm:mt-1 text-base sm:text-lg font-semibold text-foreground tabular-nums">{stats.recipeProblems}</p>
                      </div>
                    </div>
                    {score !== undefined && (
                      <div className="pt-1">
                        <div className="flex items-center justify-between mb-1 sm:mb-1.5">
                          <span className="text-xs sm:text-sm">AI满意度</span>
                          <span className="text-base sm:text-lg font-semibold text-foreground">{score}<span className="text-xs sm:text-sm font-normal text-muted-foreground">/10</span></span>
                        </div>
                        <div className="h-2.5 sm:h-3 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${getScorePercent(score)}%` }} />
                        </div>
                      </div>
                    )}
                  </CardContent>
                  <div className="border-t bg-muted/20 px-4 sm:px-6 py-2.5 sm:py-3 text-xs text-muted-foreground">
                    <span className="mr-1">报告来源：</span>
                    <span className="break-words text-foreground">{r.title}</span>
                  </div>
                </Card>
                );
              })}
              </div>

              {compareLoading && (
                <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> AI正在分析两份报告...
                </div>
              )}
              {compareError && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 sm:p-4 text-sm text-destructive">
                  {compareError}
                </div>
              )}
              {compareResult && (
                <div className="space-y-4 sm:space-y-5">
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 sm:p-6">
                    <div className="mb-2 sm:mb-3 flex items-start gap-2 sm:gap-2.5">
                      <Sparkles className="mt-0.5 h-4 w-4 sm:h-5 sm:w-5 shrink-0 text-primary" />
                      <span className="text-sm font-medium leading-6 text-foreground">{compareResult.headline || '产品体验差异总结'}</span>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm leading-6 sm:leading-7 text-muted-foreground">{compareResult.summary}</p>
                    {compareResult.recommendation && (
                      <p className="mt-3 sm:mt-4 rounded-md bg-background/70 px-3 py-2.5 sm:px-4 sm:py-3 text-sm leading-6 text-primary break-words">建议：{compareResult.recommendation}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2">
                    <Card>
                      <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-3"><CardTitle className="text-sm">A产品优势</CardTitle></CardHeader>
                      <CardContent className="space-y-2 sm:space-y-3 p-4 sm:p-6 pt-0">
                        {compareResult.report_a_advantages.length > 0 ? compareResult.report_a_advantages.map((item, idx) => <p key={idx} className="text-sm leading-6 text-muted-foreground break-words">{idx + 1}. {item}</p>) : <p className="text-sm text-muted-foreground">暂无明显优势</p>}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-3"><CardTitle className="text-sm">B产品优势</CardTitle></CardHeader>
                      <CardContent className="space-y-2 sm:space-y-3 p-4 sm:p-6 pt-0">
                        {compareResult.report_b_advantages.length > 0 ? compareResult.report_b_advantages.map((item, idx) => <p key={idx} className="text-sm leading-6 text-muted-foreground break-words">{idx + 1}. {item}</p>) : <p className="text-sm text-muted-foreground">暂无明显优势</p>}
                      </CardContent>
                    </Card>
                  </div>
                  <Card>
                    <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-3"><CardTitle className="text-sm">关键差异与风险</CardTitle></CardHeader>
                    <CardContent className="grid grid-cols-1 gap-4 sm:gap-6 p-4 sm:p-6 pt-0 md:grid-cols-2">
                      <div className="space-y-2 sm:space-y-3">
                        <p className="text-xs font-medium text-muted-foreground">关键差异</p>
                        {compareResult.key_differences.map((item, idx) => <p key={idx} className="text-sm leading-6 text-muted-foreground break-words">{idx + 1}. {item}</p>)}
                      </div>
                      <div className="space-y-2 sm:space-y-3">
                        <p className="text-xs font-medium text-muted-foreground">主要风险</p>
                        {compareResult.risks.map((item, idx) => <p key={idx} className="text-sm leading-6 text-muted-foreground break-words">{idx + 1}. {item}</p>)}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Share Sheet */}
      <Sheet open={!!shareReportId} onOpenChange={(v) => { if (!v) { setShareReportId(null); setShareLink(null); } }}>
        <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b px-5 py-4 text-left">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Share2 className="h-4 w-4 text-primary" />
              分享报告
            </SheetTitle>
            <SheetDescription className="line-clamp-2 text-xs leading-5 text-muted-foreground">
              {selectedShareReport?.title || '生成只读链接，适合发给外部评审或跨团队查看。'}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-5 py-5">
            {!shareLink ? (
              /* Step 1: Select duration & generate */
              <div className="space-y-4">
                <p className="text-sm font-medium">有效期</p>
                <div className="grid grid-cols-3 gap-2">
                  {shareDurationOptions.map(opt => (
                    <button key={opt.value} type="button"
                      className={cn('rounded-lg border px-3 py-3 text-sm font-medium transition-colors',
                        shareDuration === opt.value
                          ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                          : 'bg-background hover:bg-muted/50 active:bg-muted')}
                      onClick={() => setShareDuration(opt.value)}>
                      {opt.label}
                    </button>
                  ))}
                </div>
                <Button type="button" className="h-10 w-full text-sm" onClick={handleCreateShare} disabled={shareCreating}>
                  {shareCreating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Share2 className="h-4 w-4 mr-2" />}
                  生成分享链接
                </Button>
                {shareLinks.length > 0 && (
                  <div className="space-y-2 pt-3">
                    <p className="text-xs font-medium text-muted-foreground">已有链接</p>
                    <div className="space-y-2">
                      {shareLinks.map(s => (
                        <div key={s.id} className="flex items-center gap-2 rounded-lg border bg-card p-2">
                          <span className={cn('text-xs shrink-0 font-medium', s.is_expired ? 'text-destructive' : 'text-emerald-600')}>
                            {formatShareExpiry(s)}
                          </span>
                          <span className="flex-1 min-w-0 truncate text-xs text-muted-foreground">
                            /reports/share/{s.share_token.slice(0, 8)}...
                          </span>
                          <div className="flex shrink-0 gap-1">
                            {!s.is_expired && (
                              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => handleCopyLink(`${typeof window !== 'undefined' ? window.location.origin : ''}/reports/share/${s.share_token}`)}>
                                <Copy className="h-3 w-3 mr-1" />复制
                              </Button>
                            )}
                            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive" onClick={() => handleRevokeShare(s.id)}>
                              撤销
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Step 2: Link generated */
              <div className="space-y-4">
                <div className="space-y-3 rounded-lg border bg-card p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">链接已生成</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">有效期：{shareDurationLabel}</p>
                    </div>
                    <Button type="button" size="sm" className="h-8 shrink-0 text-xs" onClick={() => handleCopyLink(shareLink)}>
                      <Copy className="mr-1.5 h-3.5 w-3.5" /> 复制
                    </Button>
                  </div>
                  <div className="rounded-md bg-muted/45 px-3 py-2 font-mono text-xs text-muted-foreground break-all">
                    {shareLink}
                  </div>
                  <Button type="button" variant="outline" className="h-9 w-full text-xs" onClick={() => { setShareLink(null); }}>
                    继续生成新链接
                  </Button>
                </div>
                {shareLinks.length > 0 && (
                  <div className="space-y-2 pt-3">
                    <p className="text-xs font-medium text-muted-foreground">全部链接 ({shareLinks.length})</p>
                    <div className="space-y-2">
                      {shareLinks.map(s => (
                        <div key={s.id} className="flex items-center gap-2 rounded-lg border bg-card p-2">
                          <span className={cn('text-xs shrink-0 font-medium', s.is_expired ? 'text-destructive' : 'text-emerald-600')}>
                            {formatShareExpiry(s)}
                          </span>
                          <span className="flex-1 min-w-0 truncate text-xs text-muted-foreground">
                            /reports/share/{s.share_token.slice(0, 8)}...
                          </span>
                          <div className="flex shrink-0 gap-1">
                            {!s.is_expired && (
                              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => handleCopyLink(`${typeof window !== 'undefined' ? window.location.origin : ''}/reports/share/${s.share_token}`)}>
                                <Copy className="h-3 w-3" />
                              </Button>
                            )}
                            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive" onClick={() => handleRevokeShare(s.id)}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}
