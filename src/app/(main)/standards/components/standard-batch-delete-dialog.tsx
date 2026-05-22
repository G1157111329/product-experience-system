'use client';

import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';

type StandardBatchDeleteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  selectedIds: Set<string>;
  onDeleted: () => void;
};

export function StandardBatchDeleteDialog({ open, onOpenChange, selectedCount, selectedIds, onDeleted }: StandardBatchDeleteDialogProps) {
  const [deleting, setDeleting] = useState(false);

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    try {
      await Promise.all(Array.from(selectedIds).map(id => fetch(`/api/standards/${id}`, { method: 'DELETE' }).then(r => r.json())));
      onDeleted();
      onOpenChange(false);
    } catch { /* toast handled by parent */ } finally { setDeleting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>确认删除</DialogTitle><DialogDescription>确定要删除选中的 {selectedCount} 项标准吗？此操作不可撤销。</DialogDescription></DialogHeader>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>取消</Button>
          <Button variant="destructive" onClick={handleBatchDelete} disabled={deleting}>
            {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}确认删除
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
