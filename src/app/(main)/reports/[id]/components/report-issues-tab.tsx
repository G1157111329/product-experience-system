'use client';

import { IssueRow } from './issue-row';
import type { IssueForRectification } from '@/components/issues/issue-rectification-dialog';

interface ReportIssuesTabProps {
  issues: Array<
    IssueForRectification & {
      occurrenceCount?: number;
      historyCount?: number;
      occurrenceTimeline?: Array<Record<string, unknown>>;
      rectificationHistory?: Array<Record<string, unknown>>;
      materials?: Array<Record<string, unknown>>;
    }
  >;
  onStatusClick: (issue: IssueForRectification) => void;
}

export function ReportIssuesTab({ issues, onStatusClick }: ReportIssuesTabProps) {
  if (issues.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        暂无问题点
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      {issues.map((issue) => (
        <IssueRow key={issue.id} issue={issue} onStatusClick={onStatusClick} />
      ))}
    </div>
  );
}
