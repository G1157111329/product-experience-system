import { createHmac, timingSafeEqual } from 'node:crypto';

export type BindingProvider = 'wecom' | 'wechat';

export type BindingStatePayload = {
  sessionId: string;
  provider: BindingProvider;
  expiresAt: number;
};

function encode(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function sign(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createBindingState(payload: BindingStatePayload, secret: string): string {
  const encoded = encode(JSON.stringify(payload));
  return `${encoded}.${sign(encoded, secret)}`;
}

export function verifyBindingState(state: string, secret: string, now = Date.now()): BindingStatePayload | null {
  const [encoded, signature, extra] = state.split('.');
  if (!encoded || !signature || extra) return null;
  const expected = sign(encoded, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as BindingStatePayload;
    if (!payload.sessionId || !['wecom', 'wechat'].includes(payload.provider)) return null;
    if (!Number.isFinite(payload.expiresAt) || payload.expiresAt < now) return null;
    return payload;
  } catch {
    return null;
  }
}
