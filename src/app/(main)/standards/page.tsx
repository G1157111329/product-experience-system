'use client';

import { useEffect, useState, useCallback } from 'react';
import { BookOpen, ChefHat } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { PageShell, PageHeader } from '@/components/app';
import type { CategoryWithProducts } from './types';
import { ExperienceStandardsSection } from './components/experience-standards-section';
import { RecipeLibrarySection } from './components/recipe-library-section';

export default function StandardsPage() {
  const { isAdmin } = useAuth();
  const [categories, setCategories] = useState<CategoryWithProducts[]>([]);
  const [activeSection, setActiveSection] = useState<'standards' | 'recipes'>('standards');

  const fetchCategories = useCallback(async () => {
    const res = await fetch('/api/categories');
    const data = await res.json();
    if (data.code === 0) setCategories(data.data || []);
  }, []);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  return (
    <PageShell>
      <PageHeader
        title="标准管理"
        description="管理和维护体验标准库与食谱库"
      />

      {/* Section Tabs */}
      <div className="inline-flex w-full gap-1 rounded-lg border bg-card p-1 shadow-sm sm:w-auto">
        <button
          onClick={() => setActiveSection('standards')}
          className={cn(
            'flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors sm:flex-none',
            activeSection === 'standards' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
          )}
        >
          <BookOpen className="h-4 w-4" /> 体验标准
        </button>
        <button
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
        <ExperienceStandardsSection categories={categories} isAdmin={isAdmin} />
      )}
      {activeSection === 'recipes' && (
        <RecipeLibrarySection categories={categories} isAdmin={isAdmin} />
      )}
    </PageShell>
  );
}
