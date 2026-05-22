'use client';

import { Eye, Wrench, Package } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TabKey = 'info' | 'materials' | 'senses' | 'functions';

const tabs: Array<{ key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> | null }> = [
  { key: 'info', label: '基本信息', icon: null },
  { key: 'materials', label: '素材仓库', icon: Package },
  { key: 'senses', label: '五感体验', icon: Eye },
  { key: 'functions', label: '功能效果', icon: Wrench },
];

type TaskDetailTabsProps = {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
};

export function TaskDetailTabs({ activeTab, onTabChange }: TaskDetailTabsProps) {
  return (
    <div className="sticky top-14 z-20 -mx-3 flex gap-2 overflow-x-auto border-y bg-background/95 px-3 py-2 backdrop-blur scrollbar-none sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onTabChange(tab.key)}
          className={cn(
            'flex min-w-[5.6rem] flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors sm:flex-none sm:px-4 sm:py-2',
            activeTab === tab.key
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          )}
        >
          {tab.icon && <tab.icon className="h-4 w-4" />}
          {tab.label}
        </button>
      ))}
    </div>
  );
}
