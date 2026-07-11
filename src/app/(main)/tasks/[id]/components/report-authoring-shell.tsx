'use client';

import type { ReactNode } from 'react';

type TaskTabKey = 'agent' | 'info' | 'materials' | 'senses' | 'functions' | 'comparison' | 'matrix';

type ReportAuthoringShellProps = {
  activeTab: TaskTabKey;
  isComparisonTask?: boolean;
  hasMatrixInstance?: boolean;
  onTabChange: (tab: TaskTabKey) => void;
  materialRail?: ReactNode;
  children: ReactNode;
};

/**
 * The task context cards are the single task-level navigation surface. This
 * shell deliberately owns only content and the shared evidence area so desktop
 * and mobile do not render a second, conflicting "录入目录".
 */
export function ReportAuthoringShell({ materialRail, children }: ReportAuthoringShellProps) {
  return (
    <div className="min-w-0 space-y-4">
      {children}
      {materialRail && (
        <div className="rounded-lg border bg-card p-3 shadow-sm" data-testid="task-evidence-bottom">
          {materialRail}
        </div>
      )}
      <div className="h-20 lg:hidden" />
    </div>
  );
}
