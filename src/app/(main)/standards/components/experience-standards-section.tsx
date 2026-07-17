'use client';

import { useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import Link from 'next/link';
import { AlertCircle, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import {
  FilterBar,
  SearchField,
  StatusBadge,
  EmptyState,
  SkeletonList,
  pageActionButtonClass,
  pageFilterControlClass,
  pageListBodyClass,
  pageListCardClass,
  pageListContentClass,
  pageListDescriptionClass,
  pageListMetaClass,
  pageListTitleClass,
} from '@/components/app';
import type { CategoryWithProducts, Standard } from '../types';
import { categoryConfig } from '../types';
import { StandardCreateDialog } from './standard-create-dialog';
import { StandardImportDialog } from './standard-create-dialog';
import { StandardBatchDeleteDialog } from './standard-batch-delete-dialog';

export interface StandardsSectionRef {
  openCreateDialog: () => void;
  openImportDialog: () => void;
  openDeleteDialog: () => void;
}

type ExperienceStandardsSectionProps = {
  categories: CategoryWithProducts[];
  isAdmin: boolean;
  onSelectedCountChange?: (count: number) => void;
};

export const ExperienceStandardsSection = forwardRef<StandardsSectionRef, ExperienceStandardsSectionProps>(
function ExperienceStandardsSection({ categories, isAdmin, onSelectedCountChange }, ref) {
  const [standards, setStandards] = useState<Standard[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [keyword, setKeyword] = useState('');
  const debouncedKeyword = useDebouncedValue(keyword, 300);
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useImperativeHandle(ref, () => ({
    openCreateDialog: () => setCreateDialogOpen(true),
    openImportDialog: () => setImportDialogOpen(true),
    openDeleteDialog: () => setDeleteDialogOpen(true),
  }));

  useEffect(() => {
    onSelectedCountChange?.(selectedIds.size);
  }, [selectedIds.size, onSelectedCountChange]);

  const fetchStandards = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setErrorMessage('');
    try {
      const params = new URLSearchParams();
      if (debouncedKeyword.trim()) params.set('keyword', debouncedKeyword.trim());
      if (filterCategory && filterCategory !== 'all') params.set('category', filterCategory);
      const res = await fetch(`/api/standards?${params}`, { cache: 'no-store', signal: signal });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (!res.ok || data?.code !== 0) {
        throw new Error(data?.message || `标准接口请求失败 (${res.status})`);
      }
      setStandards(data.data || []);
      setSelectedIds(new Set());
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setErrorMessage(error instanceof Error ? error.message : '标准列表加载失败');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [debouncedKeyword, filterCategory]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchStandards(controller.signal);
    return () => controller.abort();
  }, [fetchStandards]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const toggleSelectAll = () => {
    setSelectedIds(prev => prev.size === standards.length ? new Set() : new Set(standards.map(s => s.id)));
  };

  return (
    <div className="space-y-3">
      <FilterBar sticky={false}>
        <SearchField placeholder="搜索标准..." value={keyword} onChange={(e) => setKeyword(e.target.value)} className={pageFilterControlClass} />
        <Select value={filterCategory || 'all'} onValueChange={(value) => setFilterCategory(value === 'all' ? '' : value)}>
          <SelectTrigger className={cn(pageFilterControlClass, 'w-full sm:w-32')}><SelectValue placeholder="全部分类" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部分类</SelectItem>
            {Object.entries(categoryConfig).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </FilterBar>

      {errorMessage && standards.length > 0 && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <span className="min-w-0 break-words">刷新失败，当前仍显示上一次结果：{errorMessage}</span>
          <Button variant="outline" size="sm" className="shrink-0" onClick={() => void fetchStandards()}>
            重试
          </Button>
        </div>
      )}

      {loading && standards.length === 0 ? (
        <SkeletonList rows={3} />
      ) : errorMessage && standards.length === 0 ? (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
          <div className="flex min-w-0 items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-destructive">标准列表加载失败</p>
              <p className="mt-1 break-words text-xs text-muted-foreground">{errorMessage}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className={cn(pageActionButtonClass, 'shrink-0')} onClick={() => void fetchStandards()}>
            重新加载
          </Button>
        </div>
      ) : standards.length === 0 ? (
        <EmptyState icon={BookOpen} title="暂无标准" />
      ) : (
        <div className="grid gap-2">
          {isAdmin && (
            <div className="flex items-center gap-3 px-1">
              <Checkbox checked={selectedIds.size === standards.length && standards.length > 0} onCheckedChange={toggleSelectAll} className="h-4 w-4" />
              <span className="text-xs text-muted-foreground">{selectedIds.size > 0 ? `已选 ${selectedIds.size} 项` : '全选'}</span>
            </div>
          )}
          {standards.map((std) => (
            <div key={std.id} className="flex items-center gap-2">
              {isAdmin && (
                <Checkbox checked={selectedIds.has(std.id)} onCheckedChange={() => toggleSelect(std.id)} className="h-4 w-4 shrink-0" />
              )}
              <Link href={`/standards/${std.id}`} className="group flex-1 min-w-0 rounded-lg focus-visible:outline-none">
                <div className={cn('rounded-lg border bg-card group-focus-visible:border-ring group-focus-visible:ring-2 group-focus-visible:ring-ring/30', pageListCardClass)}>
                  <div className={pageListContentClass}>
                    <div className={pageListBodyClass}>
                      <StatusBadge kind="standard" value={std.category} className="mt-0.5 shrink-0 text-[9px]" />
                      <div className="min-w-0 flex-1">
                        <div className={pageListTitleClass}>{std.standard_name}</div>
                        <div className={pageListDescriptionClass}>
                          {std.product_category ? `${std.product_category}${std.product ? ` - ${std.product}` : ''}` : '平台通用标准'}
                        </div>
                        <div className={pageListMetaClass}>
                          <StatusBadge kind="generic" value={`${std.standard_items?.[0]?.count || 0} 项检查项`} className="text-xs" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}

      <StandardCreateDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} categories={categories} onAdded={fetchStandards} />
      <StandardImportDialog open={importDialogOpen} onOpenChange={setImportDialogOpen} categories={categories} onImported={fetchStandards} />
      <StandardBatchDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        selectedCount={selectedIds.size}
        selectedIds={selectedIds}
        onDeleted={() => { setSelectedIds(new Set()); fetchStandards(); }}
      />
    </div>
  );
});
