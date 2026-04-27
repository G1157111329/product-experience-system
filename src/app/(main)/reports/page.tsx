'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { FileText, Printer, BarChart3, Users, User as UserIcon, ChevronRight, Trash2, Loader2, Share2, Copy, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
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
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
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
      const res = await fetch(`/api/reports?${params}`);
      const data = await res.json();
      if (data.code === 0) setReports(data.data || []);
    } finally { setLoading(false); }
  }, [showAll, user?.id]);

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

  // Group by product_model for merged types
  const grouped: Array<{ key: string; model: string; project_type: string; reports: Report[] }> = [];
  const modelMap = new Map<string, { model: string; project_type: string; reports: Report[] }>();
  const ungrouped: Report[] = [];

  for (const r of reports) {
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
    setCompareIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  return (
    <div className="p-4 lg:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">报告中心</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">查看和管理体验报告</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Toggle: 显示全部 / 显示个人 */}
          <Button
            variant="outline"
            size="sm"
            className={`gap-1.5 text-xs ${showAll ? 'border-primary text-primary' : ''}`}
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? <UserIcon className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
            {showAll ? '显示个人' : '显示全部'}
          </Button>
          {compareIds.length >= 2 && (
            <Button size="sm" className="gap-1.5 text-xs" onClick={() => setCompareOpen(true)}>
              <BarChart3 className="h-3.5 w-3.5" /> 报告对比 ({compareIds.length})
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : reports.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">暂无报告</p>
            <p className="text-xs mt-1">在体验计划详情页中生成报告</p>
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
                      <div key={r.id} className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 text-sm cursor-pointer"
                        onClick={(e) => { if ((e.target as HTMLElement).tagName !== 'INPUT') router.push(`/reports/${r.id}`); }}>
                        <input type="checkbox" checked={compareIds.includes(r.id)} onChange={() => toggleCompare(r.id)}
                          className="h-3.5 w-3.5 shrink-0 rounded border-border" onClick={e => e.stopPropagation()} />
                        <span className="flex-1 min-w-0 truncate">{r.title}</span>
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
            <Card key={r.id} className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => router.push(`/reports/${r.id}`)}>
              <CardContent className="py-3 sm:py-4">
                <div className="flex items-start gap-3">
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
                  <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
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
        <DialogContent className="max-w-3xl max-h-[85vh]">
          <DialogHeader><DialogTitle>报告对比</DialogTitle><DialogDescription>对比 {compareIds.length} 份报告</DialogDescription></DialogHeader>
          <ScrollArea className="max-h-[70vh]">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {reports.filter(r => compareIds.includes(r.id)).map(r => (
                <Card key={r.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{r.title}</CardTitle>
                    <div className="flex gap-1 flex-wrap">
                      {r.product_category && <Badge variant="outline" className="text-[10px]">{r.product_category}</Badge>}
                      <Badge variant="outline" className="text-[10px]">{r.status === '草稿' ? '已完成' : r.status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground space-y-1">
                    <div>产品型号: {r.product_model || '-'}</div>
                    <div>版本: V{r.version}</div>
                    <div>生成时间: {formatBeijingTime(r.created_at)}</div>
                    {r.content && (
                      <>
                        <Separator className="my-1" />
                        <div>检查项: {(r.content as Record<string, unknown>)?.records ? ((r.content as Record<string, unknown>).records as unknown[]).length : 0}</div>
                        <div>问题数: {(r.content as Record<string, unknown>)?.issues ? ((r.content as Record<string, unknown>).issues as unknown[]).length : 0}</div>
                      </>
                    )}
                  </CardContent>
                </Card>
              ))}
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
