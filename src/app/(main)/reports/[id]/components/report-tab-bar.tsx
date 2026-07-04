'use client';

import { cn } from '@/lib/utils';

interface ReportTabBarProps {
  tabs: { key: string; label: string; count?: number }[];
  active: string;
  onChange: (key: string) => void;
}

export function ReportTabBar({ tabs, active, onChange }: ReportTabBarProps) {
  return (
    <nav className="flex items-center gap-1 border-b bg-muted/30 px-4 py-2">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={cn(
            'relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            active === tab.key
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
          )}
        >
          {tab.label}
          {typeof tab.count === 'number' && (
            <span className="rounded-full bg-muted px-1.5 py-0 text-[10px] tabular-nums">{tab.count}</span>
          )}
        </button>
      ))}
    </nav>
  );
}
