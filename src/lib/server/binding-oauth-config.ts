import { decryptSecret, encryptSecret } from './secret-crypto';
import type { BindingProvider } from './binding-state';

export const BINDING_OAUTH_SETTING_KEY = 'binding_oauth_config';

export type StoredBindingOAuthConfig = {
  wechat?: { appId?: string; secretEncrypted?: string | null };
  wecom?: { corpId?: string; agentId?: string; secretEncrypted?: string | null };
};

export type ResolvedBindingOAuthConfig = {
  appId: string;
  agentId: string;
  secret: string;
  ready: boolean;
  source: 'environment' | 'platform' | 'missing';
};

export type WeChatWebsiteOAuthCallback = {
  authorizedRedirectDomain: string;
  callbackPath: string;
};

type BindingOAuthEnvironment = Partial<Record<
  'WECHAT_APP_ID' | 'WECHAT_APP_SECRET' | 'WECOM_CORP_ID' | 'WECOM_AGENT_ID' | 'WECOM_SECRET',
  string | undefined
>>;

export function describeWeChatWebsiteOAuthCallback(callbackUrl: string): WeChatWebsiteOAuthCallback {
  const url = new URL(callbackUrl);
  return {
    authorizedRedirectDomain: url.hostname,
    callbackPath: url.pathname,
  };
}

export function resolveBindingOAuthConfig(
  provider: BindingProvider,
  stored: StoredBindingOAuthConfig | null | undefined,
  environment?: BindingOAuthEnvironment,
): ResolvedBindingOAuthConfig {
  const source = environment ?? {
    WECHAT_APP_ID: process.env.WECHAT_APP_ID,
    WECHAT_APP_SECRET: process.env.WECHAT_APP_SECRET,
    WECOM_CORP_ID: process.env.WECOM_CORP_ID,
    WECOM_AGENT_ID: process.env.WECOM_AGENT_ID,
    WECOM_SECRET: process.env.WECOM_SECRET,
  };
  if (provider === 'wecom') {
    const env = {
      appId: String(source.WECOM_CORP_ID || '').trim(),
      agentId: String(source.WECOM_AGENT_ID || '').trim(),
      secret: String(source.WECOM_SECRET || '').trim(),
    };
    if (env.appId && env.agentId && env.secret) return { ...env, ready: true, source: 'environment' };
    const platform = {
      appId: String(stored?.wecom?.corpId || '').trim(),
      agentId: String(stored?.wecom?.agentId || '').trim(),
      secret: decryptSecret(stored?.wecom?.secretEncrypted),
    };
    return {
      ...platform,
      ready: Boolean(platform.appId && platform.agentId && platform.secret),
      source: platform.appId || platform.agentId || platform.secret ? 'platform' : 'missing',
    };
  }

  const env = {
    appId: String(source.WECHAT_APP_ID || '').trim(),
    agentId: '',
    secret: String(source.WECHAT_APP_SECRET || '').trim(),
  };
  if (env.appId && env.secret) return { ...env, ready: true, source: 'environment' };
  const platform = {
    appId: String(stored?.wechat?.appId || '').trim(),
    agentId: '',
    secret: decryptSecret(stored?.wechat?.secretEncrypted),
  };
  return {
    ...platform,
    ready: Boolean(platform.appId && platform.secret),
    source: platform.appId || platform.secret ? 'platform' : 'missing',
  };
}

export function updateStoredBindingOAuthConfig(
  current: StoredBindingOAuthConfig | null | undefined,
  provider: BindingProvider,
  input: { appId: string; agentId?: string; secret?: string },
): StoredBindingOAuthConfig {
  const next: StoredBindingOAuthConfig = {
    wechat: { ...(current?.wechat || {}) },
    wecom: { ...(current?.wecom || {}) },
  };
  if (provider === 'wecom') {
    next.wecom = {
      corpId: input.appId.trim(),
      agentId: String(input.agentId || '').trim(),
      secretEncrypted: input.secret?.trim()
        ? encryptSecret(input.secret.trim())
        : current?.wecom?.secretEncrypted || null,
    };
  } else {
    next.wechat = {
      appId: input.appId.trim(),
      secretEncrypted: input.secret?.trim()
        ? encryptSecret(input.secret.trim())
        : current?.wechat?.secretEncrypted || null,
    };
  }
  return next;
}
