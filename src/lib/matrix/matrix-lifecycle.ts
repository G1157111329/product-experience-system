export type MatrixLifecycleAction = 'archive' | 'restore';

export function matrixLifecyclePatch(
  action: MatrixLifecycleAction,
  now: string,
  reason?: string,
  restoreStatus: 'active' | 'designing' = 'active',
) {
  if (action === 'archive') {
    return {
      status: 'archived',
      archived_at: now,
      archived_reason: reason || 'user_delete',
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
