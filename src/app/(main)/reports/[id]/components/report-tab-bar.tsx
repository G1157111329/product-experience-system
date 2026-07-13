'use client';

import React, { useRef } from 'react';
import { cn } from '@/lib/utils';

interface ReportTabBarProps {
  idPrefix?: string;
  tabs: { key: string; label: string; count?: number }[];
  active: string;
  onChange: (key: string) => void;
}

export function ReportTabBar({ idPrefix = 'report', tabs, active, onChange }: ReportTabBarProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const moveFocus = (index: number, direction: 1 | -1) => {
    if (tabs.length === 0) return;
    const next = (index + direction + tabs.length) % tabs.length;
    onChange(tabs[next].key);
    tabRefs.current[next]?.focus();
  };

  return (
    <nav role="tablist" aria-label="报告内容" className="flex items-center gap-1 overflow-x-auto border-b bg-muted/30 px-4 py-2">
      {tabs.map((tab, index) => (
        <button
          key={tab.key}
          ref={(node) => { tabRefs.current[index] = node; }}
          id={`${idPrefix}-tab-${tab.key}`}
          type="button"
          role="tab"
          aria-selected={active === tab.key}
          aria-controls={`${idPrefix}-panel-${tab.key}`}
          tabIndex={active === tab.key ? 0 : -1}
          onClick={() => onChange(tab.key)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight') { event.preventDefault(); moveFocus(index, 1); }
            if (event.key === 'ArrowLeft') { event.preventDefault(); moveFocus(index, -1); }
            if (event.key === 'Home') { event.preventDefault(); onChange(tabs[0].key); tabRefs.current[0]?.focus(); }
            if (event.key === 'End') { event.preventDefault(); onChange(tabs[tabs.length - 1].key); tabRefs.current[tabs.length - 1]?.focus(); }
          }}
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
