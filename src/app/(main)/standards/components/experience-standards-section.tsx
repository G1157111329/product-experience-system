'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { BookOpen, Plus, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { FilterBar, SearchField, StatusBadge, EmptyState, SkeletonList } from '@/components/app';
import type { CategoryWithProducts, Standard } from '../types';
import { categoryConfig } from '../types';
import { StandardCreateDialog } from './standard-create-dialog';
import { StandardImportDialog } from './standard-create-dialog';
import { StandardBatchDeleteDialog } from './standard-batch-delete-dialog';

type ExperienceStandardsSectionProps = {
  categories: CategoryWithProducts[];
  isAdmin: boolean;
};

export function ExperienceStandardsSection({ categories, isAdmin }: ExperienceStandardsSectionProps) {
  const [standards, setStandards] = useState<Standard[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const fetchStandards = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (keyword) params.set('keyword', keyword);
    if (filterCategory) params.set('category', filterCategory);
    const res = await fetch(`/api/standards?${params}`);
    const data = await res.json();
    if (data.code === 0) setStandards(data.data || []);
    setLoading(false);
  }, [keyword, filterCategory]);

  useEffect(() => { fetchStandards(); }, [fetchStandards]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const toggleSelectAll = () => {
    setSelectedIds(prev => prev.size === standards.length ? new Set() : new Set(standards.map(s => s.id)));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">体验标准</h2>
          <StatusBadge kind="generic" value={String(standards.length)} className="text-[10px]" />
        </div>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <Button size="sm" variant="destructive" className="h-7 text-xs shrink-0" onClick={() => setDeleteDialogOpen(true)}>
              <Trash2 className="h-3 w-3 mr-1" /> 删除({selectedIds.size})
            </Button>
          )}
          {isAdmin && (
            <>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1 shrink-0" onClick={() => setImportDialogOpen(true)}>
                <Upload className="h-3 w-3" /> 批量导入
              </Button>
              <Button size="sm" className="h-7 text-xs gap-1 shrink-0" onClick={() => setCreateDialogOpen(true)}>
                <Plus className="h-3 w-3" /> 新建标准
              </Button>
            </>
          )}
        </div>
      </div>

      <FilterBar>
        <SearchField placeholder="搜索标准..." value={keyword} onChange={(e) => setKeyword(e.target.value)} className="h-8 text-xs" />
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-28 h-8 text-xs"><SelectValue placeholder="全部分类" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部分类</SelectItem>
            {Object.entries(categoryConfig).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </FilterBar>

      {loading ? (
        <SkeletonList rows={3} />
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
              <Link href={`/standards/${std.id}`} className="flex-1 min-w-0">
                <div className="rounded-lg border bg-card p-3 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <StatusBadge kind="standard" value={std.category} className="text-[9px] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">{std.standard_name}</span>
                        {std.product_category && <span className="text-[10px] text-muted-foreground">{std.product_category}{std.product ? ` - ${std.product}` : ''}</span>}
                      </div>
                      <span className="text-[10px] text-muted-foreground">{std.standard_items?.[0]?.count || 0} 项检查项</span>
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}

      <StandardCreateDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} categories={categories} />
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
}
