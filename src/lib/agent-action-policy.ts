const DENIED_ACTION_PARTS = /(^|_)(delete|remove|destroy|setting|settings|config|configuration|admin)(_|$)/i;

/** AI actions may create or edit business data, but never delete data or change settings. */
export function isAgentActionAllowed(actionType: string): boolean {
  const normalized = actionType.trim();
  return normalized.length > 0 && !DENIED_ACTION_PARTS.test(normalized);
}
