'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { deletionImpactItems, type DeletionImpact } from '@/lib/deletion-impact-ui';

export function DeletionImpactDialog({
  open,
  targetLabel,
  impact,
  deleting,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  targetLabel: string;
  impact: DeletionImpact | null;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next && !deleting) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认删除“{targetLabel}”？</AlertDialogTitle>
          <AlertDialogDescription>
            以下影响由服务器实时计算。确认后将执行一次删除请求，操作无法撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        {impact && (
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {deletionImpactItems(impact).map((item) => (
              <div key={item.key} data-impact-field={item.key} className="rounded-md border bg-muted/30 p-2 text-center">
                <dt className="text-xs text-muted-foreground">{item.label}</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums">{item.value}</dd>
              </div>
            ))}
          </dl>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
          <AlertDialogAction
            disabled={deleting || !impact}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(event) => {
              event.preventDefault();
              void onConfirm();
            }}
          >
            {deleting ? '删除中…' : '确认删除'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
