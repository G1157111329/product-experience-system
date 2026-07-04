'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, FileJson, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type AuditLogRow = {
  id: string;
  action: string;
  outcome: 'success' | 'failed' | 'denied' | string;
  actor_user_id?: string | null;
  actor_account?: string | null;
  target_type?: string | null;
  target_id?: string | null;
  ip_address?: string | null;
  request_path?: string | null;
  request_method?: string | null;
  user_agent?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
};

type AuditLogSettingsProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const outcomeOptions = [
  { value: 'all', label: '全部结果' },
  { value: 'success', label: '成功' },
  { value: 'failed', label: '失败' },
  { value: 'denied', label: '拒绝' },
];

const actionLabels: Record<string, string> = {
  'auth.login': '用户登录',
  'auth.login_failed': '登录失败',
  'auth.logout': '退出登录',
  'auth.register': '注册申请',
  'auth.forgot_password': '密码重置申请',
  'auth.audit': '账号审核',
  'auth.user_role': '账号角色调整',
  'auth.user_delete': '账号删除',
  'settings.update': '平台设置更新',
  'ai_config.create': 'AI配置创建',
  'ai_config.update': 'AI配置更新',
  'ai_config.delete': 'AI配置删除',
  'ai.call': 'AI调用',
  'report.export_pdf': '报告PDF导出',
  'report_share.create': '分享链接创建',
  'report_share.view': '分享链接访问',
  'report_share.revoke': '分享链接撤销',
  'security_audit.export': '审计日志导出',
};

function outcomeLabel(outcome: string) {
  if (outcome === 'success') return '成功';
  if (outcome === 'failed') return '失败';
  if (outcome === 'denied') return '拒绝';
  return outcome || '未知';
}

function outcomeClass(outcome: string) {
  if (outcome === 'success') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (outcome === 'denied') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (outcome === 'failed') return 'border-red-200 bg-red-50 text-red-700';
  return 'border-muted bg-muted/30 text-muted-foreground';
}

function formatDateTime(value: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

function buildQuery(params: Record<string, string>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value && value !== 'all') query.set(key, value);
  });
  return query.toString();
}

function downloadUrl(url: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = '';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function AuditLogSettings({ open, onOpenChange }: AuditLogSettingsProps) {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [action, setAction] = useState('');
  const [outcome, setOutcome] = useState('all');
  const [targetType, setTargetType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [limit, setLimit] = useState('100');
  const [selected, setSelected] = useState<AuditLogRow | null>(null);

  const queryParams = useMemo(() => ({
    keyword: keyword.trim(),
    action: action.trim(),
    outcome,
    target_type: targetType.trim(),
    date_from: dateFrom ? new Date(dateFrom).toISOString() : '',
    date_to: dateTo ? new Date(`${dateTo}T23:59:59`).toISOString() : '',
    limit,
  }), [action, dateFrom, dateTo, keyword, limit, outcome, targetType]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const query = buildQuery(queryParams);
      const res = await fetch(`/api/security/audit-logs${query ? `?${query}` : ''}`);
      const data = await res.json();
      if (data.code === 0) {
        setLogs(data.data || []);
      } else {
        toast.error(data.message || '审计日志查询失败');
      }
    } catch {
      toast.error('审计日志查询失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const exportLogs = (format: 'csv' | 'json') => {
    const query = buildQuery({ ...queryParams, format });
    downloadUrl(`/api/security/audit-logs?${query}`);
    toast.success(format === 'csv' ? '正在导出CSV日志' : '正在导出JSON日志');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-none overflow-hidden p-0 sm:!w-[min(1180px,calc(100vw-2rem))] sm:!max-w-[1180px]">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> 日志管理
          </DialogTitle>
          <DialogDescription>
            查看账号、报告、AI、导出、分享等关键操作日志；筛选后可导出CSV或JSON用于追溯分析。
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[calc(90vh-5.5rem)] min-h-0 flex-col overflow-hidden lg:grid lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 overflow-y-auto px-5 py-4">
            <div className="grid grid-cols-1 gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="sm:col-span-2 xl:col-span-2">
                <Label className="text-xs">关键词</Label>
                <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="动作、账号、对象、路径" className="mt-1 h-9" />
              </div>
              <div>
                <Label className="text-xs">结果</Label>
                <Select value={outcome} onValueChange={setOutcome}>
                  <SelectTrigger className="mt-1 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {outcomeOptions.map((item) => (
                      <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">数量</Label>
                <Select value={limit} onValueChange={setLimit}>
                  <SelectTrigger className="mt-1 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                    <SelectItem value="200">200</SelectItem>
                    <SelectItem value="500">500</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">动作</Label>
                <Input value={action} onChange={(event) => setAction(event.target.value)} placeholder="report.export_pdf" className="mt-1 h-9" />
              </div>
              <div>
                <Label className="text-xs">对象类型</Label>
                <Input value={targetType} onChange={(event) => setTargetType(event.target.value)} placeholder="report" className="mt-1 h-9" />
              </div>
              <div>
                <Label className="text-xs">开始日期</Label>
                <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="mt-1 h-9" />
              </div>
              <div>
                <Label className="text-xs">结束日期</Label>
                <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="mt-1 h-9" />
              </div>
              <div className="flex flex-wrap items-end gap-2 sm:col-span-2 xl:col-span-4">
                <Button type="button" className="h-9" onClick={fetchLogs} disabled={loading}>
                  {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
                  查询
                </Button>
                <Button type="button" variant="outline" className="h-9" onClick={() => exportLogs('csv')}>
                  <Download className="mr-1.5 h-4 w-4" /> CSV
                </Button>
                <Button type="button" variant="outline" className="h-9" onClick={() => exportLogs('json')}>
                  <FileJson className="mr-1.5 h-4 w-4" /> JSON
                </Button>
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-lg border">
              <div className="hidden gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground md:grid md:grid-cols-[9rem_minmax(0,1fr)_6rem_8rem]">
                <span>时间</span>
                <span>事件</span>
                <span>结果</span>
                <span>操作者</span>
              </div>
              <div className="divide-y">
                {logs.map((log) => (
                  <button
                    key={log.id}
                    type="button"
                    onClick={() => setSelected(log)}
                    className={cn(
                      'grid w-full grid-cols-1 gap-1 px-3 py-3 text-left text-xs hover:bg-muted/40 md:grid-cols-[9rem_minmax(0,1fr)_6rem_8rem] md:gap-3',
                      selected?.id === log.id && 'bg-muted/60',
                    )}
                  >
                    <span className="text-muted-foreground md:whitespace-nowrap">{formatDateTime(log.created_at)}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{actionLabels[log.action] || log.action}</span>
                      <span className="mt-0.5 block truncate text-muted-foreground">{log.request_method || '-'} {log.request_path || '-'}</span>
                    </span>
                    <span>
                      <Badge variant="outline" className={cn('text-[10px]', outcomeClass(log.outcome))}>{outcomeLabel(log.outcome)}</Badge>
                    </span>
                    <span className="truncate text-muted-foreground">{log.actor_account || '-'}</span>
                  </button>
                ))}
                {!loading && logs.length === 0 && (
                  <div className="px-3 py-10 text-center text-sm text-muted-foreground">暂无匹配日志</div>
                )}
              </div>
            </div>
          </div>

          <aside className="max-h-72 min-h-0 overflow-y-auto border-t bg-muted/15 p-4 lg:max-h-none lg:border-l lg:border-t-0">
            <p className="text-sm font-medium">事件详情</p>
            {selected ? (
              <div className="mt-3 space-y-3 text-xs">
                <div>
                  <Label className="text-[11px] text-muted-foreground">动作</Label>
                  <p className="mt-1 break-words font-medium">{actionLabels[selected.action] || selected.action}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[11px] text-muted-foreground">操作者</Label>
                    <p className="mt-1 break-words">{selected.actor_account || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">结果</Label>
                    <p className="mt-1">{outcomeLabel(selected.outcome)}</p>
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">对象类型</Label>
                    <p className="mt-1 break-words">{selected.target_type || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">对象ID</Label>
                    <p className="mt-1 break-words">{selected.target_id || '-'}</p>
                  </div>
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">请求路径</Label>
                  <p className="mt-1 break-words">{selected.request_method || '-'} {selected.request_path || '-'}</p>
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">IP / 浏览器</Label>
                  <p className="mt-1 break-words">{selected.ip_address || '-'}</p>
                  <p className="mt-1 break-words text-muted-foreground">{selected.user_agent || '-'}</p>
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">附加信息</Label>
                  <pre className="mt-1 max-h-48 overflow-auto rounded-md border bg-background p-2 text-[11px] leading-5">
                    {JSON.stringify(selected.metadata || {}, null, 2)}
                  </pre>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs leading-5 text-muted-foreground">选择左侧日志查看详情。</p>
            )}
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
