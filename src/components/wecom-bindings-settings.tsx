'use client';

/**
 * Admin WeCom bindings settings — PRD V3.1.2.4 §12 skeleton UI.
 * Lists / creates / revokes wecom_bindings via /api/v1/admin/wecom-bindings.
 */
import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type BindingRow = {
  id: string;
  platformUserId: string;
  wecomUserId: string;
  wecomCorpId: string | null;
  status: string;
  createdAt: string;
};

export function WecomBindingsSettings({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [items, setItems] = useState<BindingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [platformUserId, setPlatformUserId] = useState('');
  const [wecomUserId, setWecomUserId] = useState('');
  const [wecomCorpId, setWecomCorpId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/admin/wecom-bindings?limit=200', { cache: 'no-store' });
      const json = await res.json();
      if (json.code === 0) {
        setItems((json.data?.items ?? []) as BindingRow[]);
      } else {
        toast.error(json.message || '加载失败');
      }
    } catch {
      toast.error('加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const handleCreate = async () => {
    if (!platformUserId.trim() || !wecomUserId.trim()) {
      toast.error('请填写平台用户 ID 与企微 UserId');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/v1/admin/wecom-bindings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platformUserId: platformUserId.trim(),
          wecomUserId: wecomUserId.trim(),
          wecomCorpId: wecomCorpId.trim() || null,
        }),
      });
      const json = await res.json();
      if (json.code === 0) {
        toast.success('绑定已保存');
        setPlatformUserId('');
        setWecomUserId('');
        setWecomCorpId('');
        await load();
      } else {
        toast.error(json.message || '保存失败');
      }
    } catch {
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!window.confirm('确认撤销该企微绑定？')) return;
    try {
      const res = await fetch(`/api/v1/admin/wecom-bindings/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.code === 0) {
        toast.success('已撤销');
        await load();
      } else {
        toast.error(json.message || '撤销失败');
      }
    } catch {
      toast.error('撤销失败');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>企微素材接入</DialogTitle>
          <DialogDescription>
            绑定平台用户与企微 UserId。回调与下载需配置 WECOM_* 环境变量，并将
            wecom_material_ingest_enabled 设为 true。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 border-b pb-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">平台用户 ID</Label>
              <Input
                value={platformUserId}
                onChange={(e) => setPlatformUserId(e.target.value)}
                placeholder="platform_users.id"
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">企微 UserId</Label>
              <Input
                value={wecomUserId}
                onChange={(e) => setWecomUserId(e.target.value)}
                placeholder="WeCom userid"
                className="h-8"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">CorpId（可选）</Label>
            <Input
              value={wecomCorpId}
              onChange={(e) => setWecomCorpId(e.target.value)}
              placeholder="留空则按 UserId 匹配"
              className="h-8"
            />
          </div>
          <Button size="sm" onClick={() => void handleCreate()} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            添加绑定
          </Button>
        </div>

        <div className="max-h-64 space-y-2 overflow-y-auto">
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
              加载中…
            </div>
          ) : items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">暂无绑定</p>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium truncate">{item.wecomUserId}</span>
                    <Badge variant={item.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">
                      {item.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground break-all">
                    平台用户 {item.platformUserId}
                    {item.wecomCorpId ? ` · corp ${item.wecomCorpId}` : ''}
                  </p>
                </div>
                {item.status === 'active' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 p-0 text-destructive"
                    onClick={() => void handleRevoke(item.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
