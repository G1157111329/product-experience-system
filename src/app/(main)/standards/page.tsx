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
      <div className="flex gap-2">
        <button
          onClick={() => setActiveSection('standards')}
          className={cn(
            'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            activeSection === 'standards' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
          )}
        >
          <BookOpen className="h-4 w-4" /> 体验标准
        </button>
        <button
          onClick={() => setActiveSection('recipes')}
          className={cn(
            'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            activeSection === 'recipes' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
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
