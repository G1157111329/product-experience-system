import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient as createClient } from '@/storage/database/supabase-client';
import { setSessionCookie, type AuthUser } from '@/lib/server/auth';
import { hashPassword, passwordNeedsRehash, validatePasswordStrength, verifyPassword } from '@/lib/server/password';
import { checkSharedRateLimit } from '@/lib/server/rate-limit';
import { writeSecurityAudit } from '@/lib/server/security-audit';

async function ensureAdminAccount() {
  const initialAccount = process.env.INITIAL_ADMIN_ACCOUNT?.trim() || '';
  const initialPassword = process.env.INITIAL_ADMIN_PASSWORD || '';
  if (!initialAccount || !initialPassword) return;
  const passwordError = validatePasswordStrength(initialPassword);
  if (passwordError) throw new Error(`INITIAL_ADMIN_PASSWORD is weak: ${passwordError}`);

  const supabase = createClient();
  const { data, error } = await supabase.from('platform_users').select('id').eq('account', initialAccount).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    const { error: insertError } = await supabase.from('platform_users').insert({
      account: initialAccount,
      password_hash: hashPassword(initialPassword),
      name: '管理员',
      role: 'admin',
      status: 'approved',
    });
    if (insertError) throw new Error(insertError.message);
  }
}

function loginSuccess(user: AuthUser, rememberMe: boolean) {
  const response = NextResponse.json({
    code: 0,
    message: '登录成功',
    data: user,
    session: {
      persistent: rememberMe,
    },
  });
  setSessionCookie(response, user, { persistent: rememberMe });
  return response;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const body = await request.json();
    const { account, password } = body;
    const rememberMe = body.remember_me === true || body.rememberMe === true;
    const limited = await checkSharedRateLimit(request, {
      scope: 'auth-login',
      subject: String(account || 'unknown'),
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });
    if (limited) {
      await writeSecurityAudit(supabase, {
        request,
        action: 'auth.login.rate_limited',
        outcome: 'denied',
        actorAccount: account || null,
      });
      return limited;
    }

    if (!account || !password) {
      return NextResponse.json({ code: 1, message: '请输入账号和密码' }, { status: 400 });
    }

    try {
      await ensureAdminAccount();
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      console.error('[auth.login] initial admin bootstrap failed:', message || err);
      return NextResponse.json({
        code: 1,
        message: '数据库未连接，请配置环境变量或启动本地 PostgreSQL',
      }, { status: 503 });
    }

    const { data: user, error } = await supabase
      .from('platform_users')
      .select('id, account, name, role, status, password_hash')
      .eq('account', account)
      .maybeSingle();

    if (error || !user || !verifyPassword(password, user.password_hash)) {
      await writeSecurityAudit(supabase, {
        request,
        action: 'auth.login',
        outcome: 'failed',
        actorAccount: account || null,
        metadata: { reason: 'invalid_credentials' },
      });
      return NextResponse.json({ code: 1, message: '账号或密码错误' }, { status: 401 });
    }

    if (user.status !== 'approved') {
      await writeSecurityAudit(supabase, {
        request,
        action: 'auth.login',
        outcome: 'denied',
        actorUserId: user.id,
        actorAccount: user.account,
        metadata: { reason: 'not_approved', status: user.status },
      });
      return NextResponse.json({ code: 1, message: '账号尚未通过审核，请等待管理员审核' }, { status: 403 });
    }

    if (passwordNeedsRehash(user.password_hash)) {
      await supabase.from('platform_users').update({ password_hash: hashPassword(password) }).eq('id', user.id);
    }

    const authUser: AuthUser = {
      id: user.id,
      account: user.account,
      name: user.name,
      role: user.role,
    };
    await writeSecurityAudit(supabase, {
      request,
      action: 'auth.login',
      outcome: 'success',
      actor: authUser,
    });

    return loginSuccess(authUser, rememberMe);
  } catch {
    return NextResponse.json({ code: 1, message: '登录失败' }, { status: 500 });
  }
}
