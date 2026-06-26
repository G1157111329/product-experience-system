'use client';

import { cloneElement, isValidElement, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import {
  Eye,
  FileText,
  GitCompareArrows,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  WandSparkles,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { AgentAssistPanel } from './agent-assist-panel';

type TaskTabKey = 'agent' | 'info' | 'materials' | 'senses' | 'functions' | 'comparison';

type ReportAuthoringShellProps = {
  taskId: string;
  activeTab: TaskTabKey;
  agentOpen: boolean;
  isComparisonTask?: boolean;
  onTabChange: (tab: TaskTabKey) => void;
  onAgentOpenChange: (open: boolean) => void;
  materialRail?: ReactNode;
  children: ReactNode;
};

const baseNavItems: Array<{ key: TaskTabKey; label: string; icon: ComponentType<{ className?: string }> | null }> = [
  { key: 'agent', label: 'AI体验方案', icon: WandSparkles },
  { key: 'senses', label: '五感体验', icon: Eye },
  { key: 'functions', label: '功能效果', icon: Wrench },
  { key: 'info', label: 'AI总结/报告', icon: FileText },
];

export function ReportAuthoringShell({
  taskId,
  activeTab,
  agentOpen,
  isComparisonTask = true,
  onTabChange,
  onAgentOpenChange,
  materialRail,
  children,
}: ReportAuthoringShellProps) {
  const [navCollapsed, setNavCollapsed] = useState(false);
  const navItems = isComparisonTask
    ? [
      baseNavItems[0],
      { key: 'comparison' as const, label: '对比矩阵', icon: GitCompareArrows },
      ...baseNavItems.slice(1),
    ]
    : baseNavItems;

  const compactRail = useMemo(() => {
    if (!materialRail || !isValidElement(materialRail)) return materialRail;
    return cloneElement(materialRail, { compact: true } as { compact?: boolean });
  }, [materialRail]);

  return (
    <div
      className={cn(
        'grid gap-4 lg:items-start',
        navCollapsed ? 'lg:grid-cols-[56px_minmax(0,1fr)]' : 'lg:grid-cols-[240px_minmax(0,1fr)]',
      )}
    >
      <aside className="rounded-lg border bg-card p-3 shadow-sm lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
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
            <Button
              variant={agentOpen ? 'default' : 'outline'}
              size={navCollapsed ? 'icon' : 'sm'}
              className={cn('h-9 shrink-0', !navCollapsed && 'gap-1.5 px-2.5', navCollapsed && 'w-full')}
              onClick={() => onAgentOpenChange(!agentOpen)}
              aria-label={agentOpen ? '关闭 AI辅助' : '打开 AI辅助'}
              title="AI辅助"
            >
              <Sparkles className="h-4 w-4" />
              {!navCollapsed && <span className="text-xs">AI辅助</span>}
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

        {!navCollapsed && materialRail && (
          <div className="mt-3 border-t pt-3">
            {materialRail}
          </div>
        )}
      </aside>

      <div className="min-w-0 space-y-4">
        {navCollapsed && materialRail && (
          <div className="sticky top-0 z-30 bg-background/95 pb-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <div className="rounded-lg border bg-card p-3 shadow-sm">
              {compactRail}
            </div>
          </div>
        )}
        {children}
      </div>

      <Dialog open={agentOpen} onOpenChange={onAgentOpenChange}>
        <DialogContent className="max-h-[90dvh] max-w-3xl overflow-hidden p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>AI辅助</DialogTitle>
          </DialogHeader>
          <AgentAssistPanel
            taskId={taskId}
            onClose={() => onAgentOpenChange(false)}
            embedded
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
