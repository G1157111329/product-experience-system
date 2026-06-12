import { NextRequest } from 'next/server';
import type { AuthUser } from './auth';

type SupabaseClientLike = {
  from?: (table: string) => {
    insert?: (values: Record<string, unknown>) => Promise<{ error?: { message?: string } | null }>;
  };
};

export type SecurityAuditOutcome = 'success' | 'failed' | 'denied';

export interface SecurityAuditInput {
  action: string;
  outcome: SecurityAuditOutcome;
  request?: NextRequest;
  actor?: AuthUser | null;
  actorUserId?: string | null;
  actorAccount?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}

function getIpAddress(request?: NextRequest) {
  if (!request) return null;
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || null;
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') return value.slice(0, 500);
  if (Array.isArray(value)) return value.slice(0, 50).map(sanitizeValue);
  if (!value || typeof value !== 'object') return value;
  return sanitizeMetadata(value as Record<string, unknown>);
}

function sanitizeMetadata(value: Record<string, unknown> = {}) {
  const blocked = new Set([
    'password',
    'new_password',
    'token',
    'share_token',
    'api_key',
    'custom_api_key',
    'custom_api_key_encrypted',
    'authorization',
    'cookie',
  ]);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !blocked.has(key.toLowerCase()))
      .map(([key, item]) => [key, sanitizeValue(item)]),
  );
}

export async function writeSecurityAudit(client: unknown, input: SecurityAuditInput) {
  try {
    const auditClient = client as SupabaseClientLike;
    if (!auditClient.from) return;
    const actorUserId = input.actor?.id ?? input.actorUserId ?? null;
    const actorAccount = input.actor?.account ?? input.actorAccount ?? null;
    const table = auditClient.from('security_audit_logs');
    if (!table.insert) return;
    const { error } = await table.insert({
      action: input.action,
      actor_user_id: actorUserId,
      actor_account: actorAccount,
      target_type: input.targetType || null,
      target_id: input.targetId || null,
      outcome: input.outcome,
      ip_address: getIpAddress(input.request),
      user_agent: input.request?.headers.get('user-agent') || null,
      request_path: input.request?.nextUrl?.pathname || null,
      request_method: input.request?.method || null,
      metadata: sanitizeMetadata(input.metadata),
    });
    if (error) console.warn('[security-audit] insert failed:', error.message);
  } catch (error) {
    console.warn('[security-audit] insert failed:', error);
  }
}
