'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Printer, BarChart3, Users, User as UserIcon, ChevronRight, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
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

export default function ReportsPage() {
  const { user, isAdmin } = useAuth();
  const router = useRouter();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);

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
    <div className="space-y-4 sm:space-y-6">
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
                      <CardTitle className="text-base sm:text-lg">{group.model}</CardTitle>
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        {group.project_type && <Badge variant="outline" className="text-[10px]">{group.project_type}</Badge>}
                        {latestReport.product_category && <Badge variant="outline" className="text-[10px]">{latestReport.product_category}{latestReport.product ? ` - ${latestReport.product}` : ''}</Badge>}
                        <Badge variant="secondary" className="text-[10px]">{group.reports.length} 份报告</Badge>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="shrink-0 text-xs gap-1" onClick={() => handlePrint(latestReport.id)}>
                      <Printer className="h-3 w-3" /> 打印
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-1">
                    {group.reports.map((r) => (
                      <div key={r.id} className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 text-sm">
                        <input type="checkbox" checked={compareIds.includes(r.id)} onChange={() => toggleCompare(r.id)}
                          className="h-3.5 w-3.5 shrink-0 rounded border-border" />
                        <span className="flex-1 min-w-0 truncate">{r.title}</span>
                        <Badge variant="outline" className="text-[9px] shrink-0">{r.status}</Badge>
                        <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:inline">
                          {new Date(r.created_at).toLocaleDateString('zh-CN')}
                        </span>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 cursor-pointer"
                          onClick={() => router.push(`/reports/${r.id}`)} />
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
                      {r.product_category && <Badge variant="outline" className="text-[10px]">{r.product_category}{r.product ? ` - ${r.product}` : ''}</Badge>}
                      {r.project_type && <Badge variant="outline" className="text-[10px]">{r.project_type}</Badge>}
                      <Badge variant={r.status === '已审核' ? 'default' : 'secondary'} className="text-[10px]">{r.status}</Badge>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {r.task_name && <span>{r.task_name}</span>}
                      <span className="ml-2">{new Date(r.created_at).toLocaleDateString('zh-CN')}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={compareIds.includes(r.id)} onChange={() => toggleCompare(r.id)}
                      className="h-3.5 w-3.5 rounded border-border" />
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
                      <Badge variant="outline" className="text-[10px]">{r.status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground space-y-1">
                    <div>产品型号: {r.product_model || '-'}</div>
                    <div>版本: V{r.version}</div>
                    <div>生成时间: {new Date(r.created_at).toLocaleString('zh-CN')}</div>
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
    </div>
  );
}
