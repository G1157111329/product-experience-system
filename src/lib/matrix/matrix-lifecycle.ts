export type MatrixLifecycleAction = 'archive' | 'clear_and_archive' | 'restore';

export function matrixLifecyclePatch(
  action: MatrixLifecycleAction,
  now: string,
  reason?: string,
  restoreStatus: 'active' | 'designing' = 'active',
) {
  if (action === 'archive' || action === 'clear_and_archive') {
    return {
      status: 'archived',
      archived_at: now,
      archived_reason: reason || (action === 'clear_and_archive' ? 'user_clear' : 'user_delete'),
      updated_at: now,
    };
  }

  return {
    status: restoreStatus,
    archived_at: null,
    archived_reason: null,
    updated_at: now,
  };
}
