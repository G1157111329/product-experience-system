import { decryptSecret, encryptSecret } from './secret-crypto';
import type { BindingProvider } from './binding-state';

export const BINDING_OAUTH_SETTING_KEY = 'binding_oauth_config';

export type StoredBindingOAuthConfig = {
  wechat?: { appId?: string; secretEncrypted?: string | null };
  wecom?: { corpId?: string; agentId?: string; secretEncrypted?: string | null };
  wecomBot?: {
    botId?: string;
    bindingCorpId?: string;
    secretEncrypted?: string | null;
    websocketUrl?: string;
    dmPolicy?: 'pairing' | 'allowlist' | 'disabled';
    groupPolicy?: 'allowlist' | 'disabled';
  };
};

export type ResolvedWecomBotConfig = {
  botId: string;
  bindingCorpId: string;
  secret: string;
  websocketUrl: string;
  dmPolicy: 'pairing' | 'allowlist' | 'disabled';
  groupPolicy: 'allowlist' | 'disabled';
  ready: boolean;
  source: 'environment' | 'platform' | 'missing';
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
  'WECHAT_APP_ID' | 'WECHAT_APP_SECRET' | 'WECOM_CORP_ID' | 'WECOM_AGENT_ID' | 'WECOM_SECRET'
  | 'WECOM_BOT_ID' | 'WECOM_BOT_SECRET' | 'WECOM_BINDING_CORP_ID' | 'WECOM_WEBSOCKET_URL'
  | 'WECOM_DM_POLICY' | 'WECOM_GROUP_POLICY',
  string | undefined
>>;

export function describeWeChatWebsiteOAuthCallback(callbackUrl: string): WeChatWebsiteOAuthCallback {
  const url = new URL(callbackUrl);
  return {
    authorizedRedirectDomain: url.hostname,
    callbackPath: url.pathname,
  };
}

const DEFAULT_WECOM_WEBSOCKET_URL = 'wss://openws.work.weixin.qq.com';

function wecomBotPolicy<const T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const candidate = String(value || '').trim().toLowerCase();
  return (allowed.includes(candidate as T) ? candidate : fallback) as T;
}

export function resolveWecomBotConfig(
  stored: StoredBindingOAuthConfig | null | undefined,
  environment?: BindingOAuthEnvironment,
): ResolvedWecomBotConfig {
  const source = environment ?? {
    WECOM_BOT_ID: process.env.WECOM_BOT_ID,
    WECOM_BOT_SECRET: process.env.WECOM_BOT_SECRET,
    WECOM_BINDING_CORP_ID: process.env.WECOM_BINDING_CORP_ID,
    WECOM_WEBSOCKET_URL: process.env.WECOM_WEBSOCKET_URL,
    WECOM_DM_POLICY: process.env.WECOM_DM_POLICY,
    WECOM_GROUP_POLICY: process.env.WECOM_GROUP_POLICY,
  };
  const env = {
    botId: String(source.WECOM_BOT_ID || '').trim(),
    bindingCorpId: String(source.WECOM_BINDING_CORP_ID || '').trim(),
    secret: String(source.WECOM_BOT_SECRET || '').trim(),
    websocketUrl: String(source.WECOM_WEBSOCKET_URL || DEFAULT_WECOM_WEBSOCKET_URL).trim() || DEFAULT_WECOM_WEBSOCKET_URL,
    dmPolicy: wecomBotPolicy(source.WECOM_DM_POLICY, ['pairing', 'allowlist', 'disabled'], 'pairing'),
    groupPolicy: wecomBotPolicy(source.WECOM_GROUP_POLICY, ['allowlist', 'disabled'], 'disabled'),
  } as const;
  if (env.botId && env.bindingCorpId && env.secret) return { ...env, ready: true, source: 'environment' };

  const platform = {
    botId: String(stored?.wecomBot?.botId || '').trim(),
    bindingCorpId: String(stored?.wecomBot?.bindingCorpId || '').trim(),
    secret: decryptSecret(stored?.wecomBot?.secretEncrypted),
    websocketUrl: String(stored?.wecomBot?.websocketUrl || DEFAULT_WECOM_WEBSOCKET_URL).trim() || DEFAULT_WECOM_WEBSOCKET_URL,
    dmPolicy: wecomBotPolicy(stored?.wecomBot?.dmPolicy, ['pairing', 'allowlist', 'disabled'], 'pairing'),
    groupPolicy: wecomBotPolicy(stored?.wecomBot?.groupPolicy, ['allowlist', 'disabled'], 'disabled'),
  } as const;
  return {
    ...platform,
    ready: Boolean(platform.botId && platform.bindingCorpId && platform.secret),
    source: platform.botId || platform.bindingCorpId || platform.secret ? 'platform' : 'missing',
  };
}

export function updateStoredWecomBotConfig(
  current: StoredBindingOAuthConfig | null | undefined,
  input: {
    botId: string;
    bindingCorpId: string;
    secret?: string;
    websocketUrl?: string;
    dmPolicy?: string;
    groupPolicy?: string;
  },
): StoredBindingOAuthConfig {
  return {
    wechat: { ...(current?.wechat || {}) },
    wecom: { ...(current?.wecom || {}) },
    wecomBot: {
      botId: input.botId.trim(),
      bindingCorpId: input.bindingCorpId.trim(),
      secretEncrypted: input.secret?.trim()
        ? encryptSecret(input.secret.trim())
        : current?.wecomBot?.secretEncrypted || null,
      websocketUrl: String(input.websocketUrl || DEFAULT_WECOM_WEBSOCKET_URL).trim() || DEFAULT_WECOM_WEBSOCKET_URL,
      dmPolicy: wecomBotPolicy(input.dmPolicy, ['pairing', 'allowlist', 'disabled'], 'pairing'),
      groupPolicy: wecomBotPolicy(input.groupPolicy, ['allowlist', 'disabled'], 'disabled'),
    },
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
