'use client';

import type { ComponentType, ReactNode } from 'react';
import { Eye, FileText, Sparkles, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AgentAssistPanel } from './agent-assist-panel';

type TaskTabKey = 'info' | 'materials' | 'senses' | 'functions';

type ReportAuthoringShellProps = {
  taskId: string;
  activeTab: TaskTabKey;
  agentOpen: boolean;
  onTabChange: (tab: TaskTabKey) => void;
  onAgentOpenChange: (open: boolean) => void;
  children: ReactNode;
};

const navItems: Array<{ key: TaskTabKey; label: string; icon: ComponentType<{ className?: string }> | null }> = [
  { key: 'senses', label: '五感体验', icon: Eye },
  { key: 'functions', label: '功能效果', icon: Wrench },
  { key: 'info', label: 'AI总结/报告', icon: FileText },
];

export function ReportAuthoringShell({
  taskId,
  activeTab,
  agentOpen,
  onTabChange,
  onAgentOpenChange,
  children,
}: ReportAuthoringShellProps) {
  return (
    <div className={cn('grid gap-4 lg:items-start', agentOpen ? 'lg:grid-cols-[220px_minmax(0,1fr)_320px]' : 'lg:grid-cols-[220px_minmax(0,1fr)]')}>
      <aside className="rounded-lg border bg-card p-3 shadow-sm lg:sticky lg:top-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">录入目录</h2>
          </div>
          <Button
            variant={agentOpen ? 'default' : 'outline'}
            size="sm"
            className="h-9 gap-1.5 px-2.5"
            onClick={() => onAgentOpenChange(!agentOpen)}
            aria-label={agentOpen ? '关闭 AI助手' : '唤醒 AI助手'}
          >
            <Sparkles className="h-4 w-4" />
            <span className="text-xs">AI辅助</span>
          </Button>
        </div>

        <nav className="grid grid-cols-2 gap-2 lg:grid-cols-1">
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onTabChange(item.key)}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors',
                activeTab === item.key ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted/40 hover:bg-muted'
              )}
            >
              {item.icon && <item.icon className="h-4 w-4 shrink-0" />}
              <span className="min-w-0 truncate">{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 space-y-4">{children}</div>

      {agentOpen && (
        <AgentAssistPanel
          taskId={taskId}
          onClose={() => onAgentOpenChange(false)}
        />
      )}
    </div>
  );
}
