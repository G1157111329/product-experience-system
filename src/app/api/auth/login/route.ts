import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient as createClient } from '@/storage/database/supabase-client';
import crypto from 'crypto';

const HASH_SALT = 'xp_experience_platform';

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(HASH_SALT + password).digest('hex');
}

// Ensure initial admin account exists
async function ensureAdminAccount() {
  const supabase = createClient();
  const { data } = await supabase.from('platform_users').select('id').eq('account', 'bear2026').maybeSingle();
  if (!data) {
    await supabase.from('platform_users').insert({
      account: 'bear2026',
      password_hash: hashPassword('bear2026'),
      name: '管理员',
      role: 'admin',
      status: 'approved',
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { account, password } = body;

    if (!account || !password) {
      return NextResponse.json({ code: 1, message: '请输入账号和密码' });
    }

    try {
      await ensureAdminAccount();
    } catch (err) {
      const isDev = process.env.COZE_PROJECT_ENV !== 'PROD' && process.env.NODE_ENV !== 'production';
      const message = err instanceof Error ? err.message : '';
      const dbUnavailable = message.includes('ECONNREFUSED') || message.includes('Failed query');
      if (isDev && dbUnavailable && account === 'bear2026' && password === 'bear2026') {
        return NextResponse.json({
          code: 0,
          message: '开发环境登录成功',
          data: {
            id: 'local-dev-admin',
            account: 'bear2026',
            name: '管理员',
            role: 'admin',
          },
        });
      }
      return NextResponse.json({
        code: 1,
        message: '数据库未连接，请配置 Supabase 环境变量或启动本地 PostgreSQL',
      });
    }

    const supabase = createClient();
    const { data: user, error } = await supabase
      .from('platform_users')
      .select('id, account, name, role, status')
      .eq('account', account)
      .eq('password_hash', hashPassword(password))
      .maybeSingle();

    if (error) {
      return NextResponse.json({ code: 1, message: '登录失败' });
    }

    if (!user) {
      return NextResponse.json({ code: 1, message: '账号或密码错误' });
    }

    if (user.status !== 'approved') {
      return NextResponse.json({ code: 1, message: '账号尚未通过审核，请等待管理员审核' });
    }

    return NextResponse.json({
      code: 0,
      message: '登录成功',
      data: {
        id: user.id,
        account: user.account,
        name: user.name,
        role: user.role,
      },
    });
  } catch {
    return NextResponse.json({ code: 1, message: '登录失败' });
  }
}
