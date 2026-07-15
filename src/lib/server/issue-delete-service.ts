import {
  deleteIssueAtomically,
  type ContentDeleteStore,
} from '@/lib/server/content-delete-service';

export type IssueDeletionStore = ContentDeleteStore;

/** Direct issue deletion shares the exact descendant/material transaction used by record, step and recipe deletion. */
export async function deleteIssueWithMaterialCleanup(
  issueId: string,
  actorId: string,
  store?: IssueDeletionStore,
): Promise<boolean> {
  return deleteIssueAtomically({ issueId, actorId }, store);
}
