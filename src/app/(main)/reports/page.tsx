'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface Report {
  id: string; title: string; product_model: string | null;
  task_id: string; content: Record<string, unknown> | null;
  status: string; version: number; created_at: string;
  // Joined
  project_type?: string | null;
  project_phase?: string | null;
  task_name?: string;
}

interface MergedGroup {
  product_model: string;
  project_type: string | null;
  project_phase: string | null;
  reports: Report[];
}

const PROJECT_TYPES = ['ODM/OEM', '竞品研究', '自研', '前期研究', '改型/降本/优化', '海外产品'];
const PHASES = ['手板研究', '试制阶段', '试产阶段', '量产阶段'];

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [reportA, setReportA] = useState<string>('');
  const [reportB, setReportB] = useState<string>('');
  const [phaseFilter, setPhaseFilter] = useState<string>('all');

  const fetchReports = useCallback(async () => {
    const res = await fetch('/api/reports?limit=200');
    const data = await res.json();
    if (data.code === 0) {
      const raw = data.data;
      setReports(Array.isArray(raw) ? raw : (raw?.list || []));
    }
  }, []);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  // Enrich reports with task project_type/phase
  const enrichedReports = reports.map(r => {
    const task = r.content?.task as Record<string, unknown> | undefined;
    return {
      ...r,
      project_type: task?.project_type as string | null || null,
      project_phase: task?.project_phase as string | null || null,
      task_name: task?.task_name as string || '',
    };
  });

  // Group reports by product_model for 自研 and 改型/降本/优化
  const mergedGroups: MergedGroup[] = (() => {
    const groups: Record<string, MergedGroup> = {};
    for (const r of enrichedReports) {
      const shouldMerge = r.project_type === '自研' || r.project_type === '改型/降本/优化';
      const key = shouldMerge ? r.product_model || r.id : r.id;
      if (!groups[key]) {
        groups[key] = { product_model: r.product_model || '未命名型号', project_type: r.project_type, project_phase: r.project_phase, reports: [] };
      }
      groups[key].reports.push(r);
    }
    return Object.values(groups).sort((a, b) => {
      // Single reports (non-merged) first by date, then merged groups
      if (a.reports.length > 1 && b.reports.length <= 1) return 1;
      if (a.reports.length <= 1 && b.reports.length > 1) return -1;
      return b.reports[0].created_at.localeCompare(a.reports[0].created_at);
    });
  })();

  // Comparison logic
  const getReportById = (id: string) => enrichedReports.find(r => r.id === id);
  const reportAData = reportA ? getReportById(reportA) : null;
  const reportBData = reportB ? getReportById(reportB) : null;

  // Get records and issues from report content, with phase filter for 自研
  const getContentData = (report: Report | null) => {
    if (!report?.content) return { records: [], issues: [], recipes: [], failCount: 0, recipeProblemCount: 0 };
    const content = report.content;
    let records = (content.records || []) as Array<Record<string, unknown>>;
    const issues = (content.issues || []) as Array<Record<string, unknown>>;
    const recipes = (content.recipes || []) as Array<Record<string, unknown>>;

    // For 自研 reports, filter by selected phase
    if (report.project_type === '自研' && phaseFilter !== 'all') {
      const task = content.task as Record<string, unknown> | undefined;
      if (task?.project_phase !== phaseFilter) {
        records = [];
      }
    }

    const failCount = records.filter(r => r.evaluation_result === '不合格').length;
    const recipeProblemCount = recipes.reduce((sum, r) => sum + ((r as Record<string, unknown>).problem_count as number || 0), 0);
    return { records, issues, recipes, failCount, recipeProblemCount };
  };

  const dataA = getContentData(reportAData || null);
  const dataB = getContentData(reportBData || null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">报告中心</h1>
          <p className="text-sm text-muted-foreground mt-1">查看和对比体验报告</p>
        </div>
        <Button size="sm" onClick={() => setCompareOpen(true)}>报告对比</Button>
      </div>

      {/* Report List */}
      {mergedGroups.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <p>暂无报告</p>
            <p className="text-xs mt-1">在体验计划详情页中生成报告</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {mergedGroups.map((group) => {
            const isMerged = group.reports.length > 1;
            const latestReport = group.reports[0];
            return (
              <Card key={group.product_model + group.reports.map(r => r.id).join(',')} className="overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">
                      {isMerged ? (
                        <span>{group.product_model} <Badge variant="secondary" className="text-[10px] ml-1">合并 {group.reports.length} 份</Badge></span>
                      ) : (
                        <span>{latestReport.title}</span>
                      )}
                    </CardTitle>
                    <div className="flex gap-1">
                      {group.project_type && <Badge variant="outline" className="text-[10px]">{group.project_type}</Badge>}
                      {group.project_phase && <Badge variant="outline" className="text-[10px]">{group.project_phase}</Badge>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {isMerged && (
                    <Link href={`/reports/${latestReport.id}`}>
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/5 border border-primary/20 hover:bg-primary/10 cursor-pointer mb-2">
                        <span className="text-sm font-medium text-primary flex-1">查看合并报告</span>
                        <span className="text-xs text-primary">{group.reports.length} 份报告合并</span>
                      </div>
                    </Link>
                  )}
                  {group.reports.map((report) => {
                    const content = report.content as Record<string, unknown> | null;
                    const records = (content?.records || []) as Array<Record<string, unknown>>;
                    const issues = (content?.issues || []) as Array<Record<string, unknown>>;
                    const recipes = (content?.recipes || []) as Array<Record<string, unknown>>;
                    const failCount = records.filter(r => r.evaluation_result === '不合格').length;
                    const recipePC = recipes.reduce((s, r) => s + ((r as Record<string, unknown>).problem_count as number || 0), 0);
                    return (
                      <Link key={report.id} href={`/reports/${report.id}`}>
                        <div className="flex items-center gap-3 p-2 rounded-lg bg-background border hover:bg-muted/30 cursor-pointer">
                          <span className="text-sm flex-1 truncate">{report.title}</span>
                          <div className="flex gap-2 text-xs text-muted-foreground shrink-0">
                            <span>{records.length}项</span>
                            <span className="text-destructive">{failCount}不合格</span>
                            <span className="text-amber-600">{issues.length + recipePC}问题</span>
                          </div>
                          <Badge variant="secondary" className="text-[10px] shrink-0">{report.status}</Badge>
                        </div>
                      </Link>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Report Comparison Dialog */}
      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>报告对比</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Report selectors */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>报告 A</Label>
                <Select value={reportA} onValueChange={setReportA}>
                  <SelectTrigger><SelectValue placeholder="选择报告" /></SelectTrigger>
                  <SelectContent>
                    {enrichedReports.map(r => <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>报告 B</Label>
                <Select value={reportB} onValueChange={setReportB}>
                  <SelectTrigger><SelectValue placeholder="选择报告" /></SelectTrigger>
                  <SelectContent>
                    {enrichedReports.map(r => <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Phase filter for 自研 projects */}
            {(reportAData?.project_type === '自研' || reportBData?.project_type === '自研') && (
              <div className="space-y-1.5">
                <Label>项目阶段筛选（自研报告对比时选择阶段）</Label>
                <div className="flex gap-2">
                  <button onClick={() => setPhaseFilter('all')}
                    className={cn('px-3 py-1.5 rounded text-xs border', phaseFilter === 'all' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/50')}>
                    全部阶段
                  </button>
                  {PHASES.map(p => (
                    <button key={p} onClick={() => setPhaseFilter(p)}
                      className={cn('px-3 py-1.5 rounded text-xs border', phaseFilter === p ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/50')}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Comparison content */}
            {reportAData && reportBData && (
              <div className="grid grid-cols-2 gap-4">
                {[
                  { data: dataA, report: reportAData, label: 'A' },
                  { data: dataB, report: reportBData, label: 'B' },
                ].map(({ data, report, label }) => (
                  <Card key={label}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">{report.title}</CardTitle>
                      <div className="flex gap-1">
                        {report.project_type && <Badge variant="outline" className="text-[10px]">{report.project_type}</Badge>}
                        {report.project_phase && <Badge variant="outline" className="text-[10px]">{report.project_phase}</Badge>}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-2 text-center">
                        <div className="p-2 rounded bg-muted/30">
                          <p className="text-lg font-bold">{data.records.length}</p>
                          <p className="text-[10px] text-muted-foreground">检查项</p>
                        </div>
                        <div className="p-2 rounded bg-muted/30">
                          <p className="text-lg font-bold text-destructive">{data.failCount}</p>
                          <p className="text-[10px] text-muted-foreground">不合格</p>
                        </div>
                        <div className="p-2 rounded bg-muted/30">
                          <p className="text-lg font-bold text-amber-600">{data.issues.length}</p>
                          <p className="text-[10px] text-muted-foreground">整改问题</p>
                        </div>
                        <div className="p-2 rounded bg-muted/30">
                          <p className="text-lg font-bold text-orange-600">{data.recipeProblemCount}</p>
                          <p className="text-[10px] text-muted-foreground">食谱问题</p>
                        </div>
                      </div>

                      {/* Failed records list */}
                      {data.failCount > 0 && (
                        <div className="mt-3 space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">不合格项:</p>
                          {data.records.filter(r => r.evaluation_result === '不合格').slice(0, 10).map((r, i) => (
                            <div key={i} className="text-xs p-1.5 bg-destructive/5 rounded flex items-center gap-2">
                              <Badge className="text-[9px] bg-red-100 text-red-700 shrink-0">{(r.check_dimension as string) || ''}</Badge>
                              <span className="truncate">{r.check_item as string}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Recipe problems */}
                      {data.recipeProblemCount > 0 && (
                        <div className="mt-3 space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">食谱/功能问题:</p>
                          {data.recipes.filter(r => (r as Record<string, unknown>).problem_count as number > 0).slice(0, 5).map((recipe, i) => (
                            <div key={i} className="text-xs p-1.5 bg-orange-50 dark:bg-orange-950/20 rounded">
                              <span className="font-medium">{(recipe as Record<string, unknown>).name as string}</span>
                              <span className="text-muted-foreground ml-1">({(recipe as Record<string, unknown>).problem_count as number}个问题)</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {(!reportA || !reportB) && (
              <div className="text-center text-muted-foreground py-8">
                <p className="text-sm">请选择两份报告进行对比</p>
                <p className="text-xs mt-1">支持对比不同报告的问题点和数值</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
