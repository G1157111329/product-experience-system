export type HierarchyDeletionDecision =
  | { mode: 'delete'; requiresConfirmation: false }
  | { mode: 'archive'; requiresConfirmation: true };

export function decideHierarchyDeletion(input: {
  meaningfulCellCount: number;
  mediaLinkCount: number;
  issuePointCount: number;
}): HierarchyDeletionDecision {
  const hasData = input.meaningfulCellCount > 0
    || input.mediaLinkCount > 0
    || input.issuePointCount > 0;
  return hasData
    ? { mode: 'archive', requiresConfirmation: true }
    : { mode: 'delete', requiresConfirmation: false };
}
