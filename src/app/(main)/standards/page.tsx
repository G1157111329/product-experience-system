'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { BookOpen, ChefHat, Plus, Trash2, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import { PageShell, PageHeader, pageActionButtonClass } from '@/components/app';
import type { CategoryWithProducts } from './types';
import { ExperienceStandardsSection, StandardsSectionRef } from './components/experience-standards-section';
import { RecipeLibrarySection, RecipeSectionRef } from './components/recipe-library-section';

export default function StandardsPage() {
  const { isAdmin } = useAuth();
  const [categories, setCategories] = useState<CategoryWithProducts[]>([]);
  const [activeSection, setActiveSection] = useState<'standards' | 'recipes'>('standards');
  const [selectedCount, setSelectedCount] = useState(0);

  const standardsRef = useRef<StandardsSectionRef>(null);
  const recipesRef = useRef<RecipeSectionRef>(null);

  const fetchCategories = useCallback(async () => {
    const res = await fetch('/api/categories');
    const data = await res.json();
    if (data.code === 0) setCategories(data.data || []);
  }, []);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  const handleSelectedCountChange = useCallback((count: number) => {
    setSelectedCount(count);
  }, []);

  return (
    <PageShell className="space-y-3">
      <PageHeader
        title="标准管理"
        description="管理和维护体验标准库与食谱库"
        actions={
          activeSection === 'standards' ? (
            isAdmin && (
              <div className="flex gap-2">
                {selectedCount > 0 && (
                  <Button size="sm" variant="destructive" className={pageActionButtonClass} onClick={() => standardsRef.current?.openDeleteDialog()}>
                    <Trash2 className="h-3 w-3" /> 删除({selectedCount})
                  </Button>
                )}
                <Button variant="outline" size="sm" className={pageActionButtonClass} onClick={() => standardsRef.current?.openImportDialog()}>
                  <Upload className="h-3 w-3" /> 批量导入
                </Button>
                <Button size="sm" className={pageActionButtonClass} onClick={() => standardsRef.current?.openCreateDialog()}>
                  <Plus className="h-3 w-3" /> 新建标准
                </Button>
              </div>
            )
          ) : (
            isAdmin && (
              <Button variant="outline" size="sm" className={pageActionButtonClass} onClick={() => recipesRef.current?.openAddDialog()}>
                <Plus className="h-3 w-3" /> 添加食谱
              </Button>
            )
          )
        }
      />

      {/* Section Tabs */}
      <div className="inline-flex w-full gap-1 rounded-lg border bg-card p-1 shadow-sm sm:w-auto">
        <button
          data-testid="standards-section-tab"
          onClick={() => setActiveSection('standards')}
          className={cn(
            'flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors sm:flex-none',
            activeSection === 'standards' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
          )}
        >
          <BookOpen className="h-4 w-4" /> 体验标准
        </button>
        <button
          data-testid="recipe-library-section-tab"
          onClick={() => setActiveSection('recipes')}
          className={cn(
            'flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors sm:flex-none',
            activeSection === 'recipes' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
          )}
        >
          <ChefHat className="h-4 w-4" /> 食谱库
        </button>
      </div>

      {/* Section Content */}
      {activeSection === 'standards' && (
        <ExperienceStandardsSection ref={standardsRef} categories={categories} isAdmin={isAdmin} onSelectedCountChange={handleSelectedCountChange} />
      )}
      {activeSection === 'recipes' && (
        <RecipeLibrarySection ref={recipesRef} categories={categories} isAdmin={isAdmin} />
      )}
    </PageShell>
  );
}
