'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { FileText, Printer, BarChart3, Users, User as UserIcon, ChevronRight, Trash2, Loader2, Share2, Copy, X, Search, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';

interface Report {
  id: string; title: string; product_model: string | null;
  task_id: string; content: Record<string, unknown> | null;
  status: string; version: number; created_at: string;
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

const MERGED_TYPES = ['自研', '改型/降本/优化'];

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

export default function ReportsPage() {
  const { user, isAdmin } = useAuth();
  const router = useRouter();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [keyword, setKeyword] = useState('');
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
      // If "show all" mode, don't filter by user; otherwise filter by current user
      if (!showAll && user?.id) {
        params.set('created_by', user.id);
      }
      if (keyword.trim()) params.set('keyword', keyword.trim());
      const res = await fetch(`/api/reports?${params}`);
      const data = await res.json();
      if (data.code === 0) setReports(data.data || []);
    } finally { setLoading(false); }
  }, [showAll, user?.id, keyword]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const handleDelete = async () => {
    if (!deleteId) return;
    const res = await fetch(`/api/reports/${deleteId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.code === 0) { toast.success('已删除'); fetchReports(); }
    else toast.error(data.message);
    setDeleteId(null);
  };

  const handlePrint = (id: string) => {
    window.open(`/reports/print?id=${id}`, '_blank');
  };

  const openShareDialog = async (reportId: string) => {
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
        body: JSON.stringify({ report_id: shareReportId, duration: shareDuration, created_by: user?.id }),
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
    navigator.clipboard.writeText(link).then(() => toast.success('链接已复制')).catch(() => toast.error('复制失败'));
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
  const selectedCompareReports = visibleReports.filter(r => compareIds.includes(r.id));

  const handleOpenCompare = async () => {
    if (compareIds.length !== 2) {
      toast.error('请选择两份报告进行对比');
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
        setCompareError(data.message || '报告对比失败');
      }
    } catch {
      setCompareError('网络错误，请重试');
    } finally {
      setCompareLoading(false);
    }
  };

  // Group by product_model for merged types
  const grouped: Array<{ key: string; model: string; project_type: string; reports: Report[] }> = [];
  const modelMap = new Map<string, { model: string; project_type: string; reports: Report[] }>();
  const ungrouped: Report[] = [];

  for (const r of visibleReports) {
    const pt = r.project_type || '';
    if (MERGED_TYPES.includes(pt) && r.product_model) {
      const key = `${r.product_model}__${pt}`;
      if (!modelMap.has(key)) {
        modelMap.set(key, { model: r.product_model, project_type: pt, reports: [] });
      }
      modelMap.get(key)!.reports.push(r);
    } else {
      ungrouped.push(r);
    }
  }
  modelMap.forEach((v) => grouped.push({ key: `${v.model}__${v.project_type}`, ...v }));

  const toggleCompare = (id: string) => {
    setCompareResult(null);
    setCompareError(null);
    setCompareIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 2) {
        toast.error('报告对比一次只能选择两份报告');
        return prev;
      }
      return [...prev, id];
    });
  };

  return (
    <div className="px-3 py-4 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border bg-card p-3 shadow-sm sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">报告中心</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">查看和管理体验报告</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Toggle: 显示全部 / 显示个人 */}
          <Button
            variant="outline"
            size="sm"
            className={`min-w-0 flex-1 gap-1.5 text-xs sm:flex-none ${showAll ? 'border-primary text-primary' : ''}`}
            onClick={() => { setShowAll(!showAll); setCompareIds([]); }}
          >
            {showAll ? <UserIcon className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
            {showAll ? '显示个人' : '显示全部'}
          </Button>
          {compareIds.length === 2 && (
            <Button size="sm" className="hidden gap-1.5 text-xs sm:inline-flex" onClick={handleOpenCompare}>
              <BarChart3 className="h-3.5 w-3.5" /> 报告对比 ({compareIds.length})
            </Button>
          )}
        </div>
      </div>

      <div className="sticky top-14 z-20 -mx-3 flex flex-col gap-2 border-y bg-background/95 px-3 py-2 backdrop-blur sm:static sm:mx-0 sm:flex-row sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
        <div className="relative flex-1 min-w-0">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(e) => { setKeyword(e.target.value); setCompareIds([]); }}
            placeholder="搜索报告名称、型号、品类、产品"
            className="h-11 pl-9 sm:h-10"
          />
        </div>
        <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setCompareIds([]); }}>
          <SelectTrigger className="h-11 w-full sm:h-10 sm:w-48">
            <SelectValue placeholder="按品类筛选" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部品类</SelectItem>
            {categoryOptions.map(category => (
              <SelectItem key={category} value={category}>{category}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : visibleReports.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">暂无匹配报告</p>
            <p className="text-xs mt-1">{keyword || categoryFilter !== 'all' ? '调整搜索或筛选条件后再试' : '在体验计划详情页中生成报告'}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Grouped reports (merged) */}
          {grouped.map(group => {
            const latestReport = group.reports[0];
            return (
              <Card key={group.key}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base sm:text-lg truncate">{group.model}</CardTitle>
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        {group.project_type && <Badge variant="outline" className="text-[10px]">{group.project_type}</Badge>}
                        {latestReport.product_category && <Badge variant="outline" className="text-[10px] max-w-[120px] truncate">{latestReport.product_category}</Badge>}
                        {latestReport.product && <Badge variant="outline" className="text-[10px] max-w-[120px] truncate">{latestReport.product}</Badge>}
                        <Badge variant="secondary" className="text-[10px]">{group.reports.length} 份报告</Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openShareDialog(latestReport.id)}>
                        <Share2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="outline" size="sm" className="shrink-0 text-xs gap-1" onClick={() => handlePrint(latestReport.id)}>
                        <Printer className="h-3 w-3" /> 打印
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-1">
                    {group.reports.map((r) => (
                      <div key={r.id} className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 text-sm cursor-pointer" onClick={() => router.push(`/reports/${r.id}`)}>
                        <input type="checkbox" checked={compareIds.includes(r.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggleCompare(r.id)}
                          className="h-3.5 w-3.5 shrink-0 rounded border-border" />
                        <span className="flex-1 min-w-0 truncate" onClick={(e) => e.stopPropagation()}>{r.title}</span>
                        <Badge variant="outline" className="text-[9px] shrink-0">{r.status === '草稿' ? '已完成' : r.status}</Badge>
                        <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:inline">
                          {formatBeijingTime(r.created_at)}
                        </span>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Ungrouped reports */}
          {ungrouped.map(r => (
            <Card key={r.id} className="cursor-pointer transition-shadow hover:border-primary/30 hover:shadow-md"
              onClick={() => router.push(`/reports/${r.id}`)}>
              <CardContent className="py-3 sm:py-4">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <FileText className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{r.title}</div>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {r.product_category && <Badge variant="outline" className="text-[10px] max-w-[120px] truncate">{r.product_category}</Badge>}
                      {r.product && <Badge variant="outline" className="text-[10px] max-w-[120px] truncate">{r.product}</Badge>}
                      {r.project_type && <Badge variant="outline" className="text-[10px]">{r.project_type}</Badge>}
                      <Badge variant={r.status === '已审核' ? 'default' : 'secondary'} className="text-[10px]">{r.status === '草稿' ? '已完成' : r.status}</Badge>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1 truncate">
                      {r.task_name && <span>{r.task_name}</span>}
                      <span className="ml-2">{formatBeijingTime(r.created_at)}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1 shrink-0 sm:flex sm:items-center" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={compareIds.includes(r.id)} onChange={() => toggleCompare(r.id)}
                      className="h-3.5 w-3.5 rounded border-border" />
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openShareDialog(r.id)}>
                      <Share2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handlePrint(r.id)}>
                      <Printer className="h-3.5 w-3.5" />
                    </Button>
                    {isAdmin && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(r.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {compareIds.length > 0 && (
        <div className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 rounded-lg border bg-card/95 p-2 shadow-lg backdrop-blur sm:hidden">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium">已选择 {compareIds.length}/2 份报告</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {selectedCompareReports.map((r) => r.title).join(' · ') || '请选择两份报告进行AI对比'}
              </p>
            </div>
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => setCompareIds([])}>
              <X className="h-4 w-4" />
            </Button>
            <Button size="sm" className="shrink-0 gap-1.5" disabled={compareIds.length !== 2} onClick={handleOpenCompare}>
              <BarChart3 className="h-3.5 w-3.5" /> 对比
            </Button>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>确认删除</DialogTitle><DialogDescription>删除后不可恢复，确定要删除该报告吗？</DialogDescription></DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteId(null)}>取消</Button>
            <Button variant="destructive" onClick={handleDelete}>确认删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Compare dialog */}
      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" /> 报告对比
            </DialogTitle>
            <DialogDescription>基于两份报告内容生成满意度 VS 总结</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[72vh]">
            <div className="space-y-4 pr-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {selectedCompareReports.map((r, idx) => {
                const content = (r.content || {}) as Record<string, unknown>;
                const records = (content.records || []) as unknown[];
                const recipes = (content.recipes || []) as Array<Record<string, unknown>>;
                const failed = records.filter((item) => (item as Record<string, unknown>).evaluation_result === '不合格').length;
                const recipeProblems = recipes.reduce((sum, recipe) => sum + Number(recipe.problem_count || 0), 0);
                const score = idx === 0 ? compareResult?.satisfaction_a : compareResult?.satisfaction_b;
                const isWinner = compareResult?.winner_report_id === r.id;
                return (
                <Card key={r.id} className="flex flex-col">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-sm min-w-0 break-words leading-5">{idx === 0 ? 'A' : 'B'} · {r.title}</CardTitle>
                      {isWinner && <Badge className="text-[10px] shrink-0">更优</Badge>}
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {r.product_category && <Badge variant="outline" className="text-[10px]">{r.product_category}</Badge>}
                      {r.product && <Badge variant="outline" className="text-[10px]">{r.product}</Badge>}
                      <Badge variant="outline" className="text-[10px]">{r.status === '草稿' ? '已完成' : r.status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground flex-1">
                    <div className="space-y-1">
                      <div className="flex"><span className="text-muted-foreground/70 shrink-0 w-20">产品型号</span><span className="break-all min-w-0">{r.product_model || '-'}</span></div>
                      <div className="flex"><span className="text-muted-foreground/70 shrink-0 w-20">版本</span><span>V{r.version}</span></div>
                      <div className="flex"><span className="text-muted-foreground/70 shrink-0 w-20">生成时间</span><span className="break-all">{formatBeijingTime(r.created_at)}</span></div>
                    </div>
                    <Separator className="my-2" />
                    <div className="space-y-1">
                      <div className="flex"><span className="text-muted-foreground/70 shrink-0 w-20">检查项</span><span>{records.length} / 不合格: {failed}</span></div>
                      <div className="flex"><span className="text-muted-foreground/70 shrink-0 w-20">效果问题</span><span>{recipeProblems}</span></div>
                    </div>
                    {score !== undefined && (
                      <div className="pt-2">
                        <div className="flex items-center justify-between mb-1">
                          <span>AI满意度</span>
                          <span className="font-semibold text-foreground">{score}/10</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${Math.min(100, Math.max(0, score * 10))}%` }} />
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
                );
              })}
              </div>

              {compareLoading && (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> AI正在分析两份报告...
                </div>
              )}
              {compareError && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                  {compareError}
                </div>
              )}
              {compareResult && (
                <div className="space-y-3">
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <span className="font-medium text-sm">{compareResult.headline || 'VS总结'}</span>
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap break-all">{compareResult.summary}</p>
                    {compareResult.recommendation && (
                      <p className="text-xs text-primary break-all">建议：{compareResult.recommendation}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm">A报告优势</CardTitle></CardHeader>
                      <CardContent className="space-y-1">
                        {compareResult.report_a_advantages.length > 0 ? compareResult.report_a_advantages.map((item, idx) => <p key={idx} className="text-xs text-muted-foreground break-all">{idx + 1}. {item}</p>) : <p className="text-xs text-muted-foreground">暂无明显优势</p>}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm">B报告优势</CardTitle></CardHeader>
                      <CardContent className="space-y-1">
                        {compareResult.report_b_advantages.length > 0 ? compareResult.report_b_advantages.map((item, idx) => <p key={idx} className="text-xs text-muted-foreground break-all">{idx + 1}. {item}</p>) : <p className="text-xs text-muted-foreground">暂无明显优势</p>}
                      </CardContent>
                    </Card>
                  </div>
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">关键差异与风险</CardTitle></CardHeader>
                    <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <p className="text-[10px] font-medium text-muted-foreground">关键差异</p>
                        {compareResult.key_differences.map((item, idx) => <p key={idx} className="text-xs text-muted-foreground break-all">{idx + 1}. {item}</p>)}
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-medium text-muted-foreground">主要风险</p>
                        {compareResult.risks.map((item, idx) => <p key={idx} className="text-xs text-muted-foreground break-all">{idx + 1}. {item}</p>)}
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
        <SheetContent side="bottom" className="rounded-t-2xl p-0 max-h-[80vh]">
          <SheetHeader className="px-5 pt-5 pb-2">
            <SheetTitle className="text-base">分享报告</SheetTitle>
          </SheetHeader>
          <div className="px-5 pb-5 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 60px)' }}>
            {!shareLink ? (
              /* Step 1: Select duration & generate */
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">选择有效期</p>
                <div className="flex gap-2">
                  {([
                    { value: '7d' as const, label: '7天' },
                    { value: '30d' as const, label: '30天' },
                    { value: 'permanent' as const, label: '永久有效' },
                  ]).map(opt => (
                    <button key={opt.value} type="button"
                      className={cn('flex-1 py-3 rounded-xl text-sm font-medium border transition-colors',
                        shareDuration === opt.value
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background border-border hover:bg-muted/50 active:bg-muted')}
                      onClick={() => setShareDuration(opt.value)}>
                      {opt.label}
                    </button>
                  ))}
                </div>
                <Button type="button" className="w-full h-11 rounded-xl text-sm" onClick={handleCreateShare} disabled={shareCreating}>
                  {shareCreating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Share2 className="h-4 w-4 mr-2" />}
                  生成分享链接
                </Button>
                {shareLinks.length > 0 && (
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground mb-2">已有链接</p>
                    <div className="space-y-2">
                      {shareLinks.map(s => (
                        <div key={s.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                          <span className={cn('text-xs shrink-0 font-medium', s.is_expired ? 'text-destructive' : 'text-emerald-600')}>
                            {s.is_expired ? '已过期' : s.expires_at ? `${new Date(s.expires_at).toLocaleDateString('zh-CN')}前` : '永久'}
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
                <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-4 space-y-3 border border-emerald-200 dark:border-emerald-800">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center shrink-0">
                      <Share2 className="h-4 w-4 text-emerald-600" />
                    </div>
                    <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">链接已生成</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {shareDuration === 'permanent' ? '此链接永久有效' : `此链接${shareDuration === '7d' ? '7天' : '30天'}内有效`}
                  </p>
                </div>
                <Button type="button" className="w-full h-11 rounded-xl text-sm" onClick={() => handleCopyLink(shareLink)}>
                  <Copy className="h-4 w-4 mr-2" /> 复制链接
                </Button>
                <Button type="button" variant="outline" className="w-full h-10 rounded-xl text-sm" onClick={() => { setShareLink(null); }}>
                  再生成一个
                </Button>
                {shareLinks.length > 0 && (
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground mb-2">全部链接 ({shareLinks.length})</p>
                    <div className="space-y-2">
                      {shareLinks.map(s => (
                        <div key={s.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                          <span className={cn('text-xs shrink-0 font-medium', s.is_expired ? 'text-destructive' : 'text-emerald-600')}>
                            {s.is_expired ? '已过期' : s.expires_at ? `${new Date(s.expires_at).toLocaleDateString('zh-CN')}前` : '永久'}
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
    </div>
  );
}
