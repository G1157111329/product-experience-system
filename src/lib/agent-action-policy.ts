import { classifyTaskEditAction } from './task-editing-contract';

/** AI actions may create or edit business data, but never delete data or change settings. */
export function isAgentActionAllowed(actionType: string): boolean {
  return classifyTaskEditAction(actionType) === 'direct';
}
