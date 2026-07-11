'use client';

import { useState, type ComponentType, type ReactNode } from 'react';
import {
  Eye,
  FileText,
  GitCompareArrows,
  PanelLeftClose,
  PanelLeftOpen,
  Table,
  WandSparkles,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type TaskTabKey = 'agent' | 'info' | 'materials' | 'senses' | 'functions' | 'comparison' | 'matrix';

type ReportAuthoringShellProps = {
  activeTab: TaskTabKey;
  isComparisonTask?: boolean;
  hasMatrixInstance?: boolean;
  onTabChange: (tab: TaskTabKey) => void;
  materialRail?: ReactNode;
  children: ReactNode;
};

const baseNavItems: Array<{ key: TaskTabKey; label: string; icon: ComponentType<{ className?: string }> | null }> = [
  { key: 'agent', label: 'AI方案', icon: WandSparkles },
  { key: 'senses', label: '五感体验', icon: Eye },
  { key: 'functions', label: '功能效果', icon: Wrench },
  { key: 'info', label: '总结', icon: FileText },
];

export function ReportAuthoringShell({
  activeTab,
  isComparisonTask = true,
  onTabChange,
  materialRail,
  children,
}: ReportAuthoringShellProps) {
  const [navCollapsed, setNavCollapsed] = useState(false);
  const matrixNavItem = { key: 'matrix' as const, label: '数据矩阵', icon: Table };
  const navItems = (() => {
    if (isComparisonTask) {
      return [
        baseNavItems[0],
        { key: 'comparison' as const, label: '对比矩阵', icon: GitCompareArrows },
        matrixNavItem,
        ...baseNavItems.slice(1),
      ];
    }
    return [baseNavItems[0], matrixNavItem, ...baseNavItems.slice(1)];
  })();

  return (
    <div
      className={cn(
        'lg:grid lg:gap-4 lg:items-start',
        navCollapsed ? 'lg:grid-cols-[56px_minmax(0,1fr)]' : 'lg:grid-cols-[240px_minmax(0,1fr)]',
      )}
    >
      {/* Mobile: horizontal scrollable tab bar */}
      <div className="lg:hidden -mx-3 px-0 sticky top-0 z-30 bg-background/95 pb-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none px-3">
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onTabChange(item.key)}
              className={cn(
                'flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors',
                activeTab === item.key ? 'bg-primary text-primary-foreground' : 'bg-muted/40 hover:bg-muted',
              )}
            >
              {item.icon && <item.icon className="h-3.5 w-3.5" />}
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <aside className="hidden lg:block rounded-lg border bg-card p-3 shadow-sm lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
        <div className={cn('mb-3 flex items-center gap-2', navCollapsed ? 'flex-col' : 'justify-between')}>
          {!navCollapsed && (
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">录入目录</h2>
            </div>
          )}
          <div className={cn('flex shrink-0 gap-2', navCollapsed && 'w-full flex-col')}>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => setNavCollapsed((current) => !current)}
              aria-label={navCollapsed ? '展开录入目录' : '隐藏录入目录'}
              title={navCollapsed ? '展开录入目录' : '隐藏录入目录'}
            >
              {navCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <nav className="grid grid-cols-2 gap-2 lg:grid-cols-1">
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onTabChange(item.key)}
              className={cn(
                'flex items-center rounded-md px-3 py-2 text-left text-sm transition-colors',
                navCollapsed ? 'justify-center px-2' : 'gap-2',
                activeTab === item.key ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted/40 hover:bg-muted',
              )}
              title={item.label}
            >
              {item.icon && <item.icon className="h-4 w-4 shrink-0" />}
              {!navCollapsed && <span className="min-w-0 truncate">{item.label}</span>}
            </button>
          ))}
        </nav>

      </aside>

      <div className="min-w-0 space-y-4">
        {children}
        {materialRail && (
          <div className="rounded-lg border bg-card p-3 shadow-sm" data-testid="task-evidence-bottom">
            {materialRail}
          </div>
        )}
        {/* Spacing for bottom nav + floating agent on mobile */}
        <div className="h-20 lg:hidden" />
      </div>
    </div>
  );
}
