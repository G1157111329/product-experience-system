import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient as createClient } from '@/storage/database/supabase-client';
import crypto from 'crypto';

const HASH_SALT = 'xp_experience_platform';

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(HASH_SALT + password).digest('hex');
}

// Register: create user with status=pending + create audit request
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { account, password, name } = body;

    if (!account || !password || !name) {
      return NextResponse.json({ code: 1, message: '请填写完整信息' });
    }

    if (account.length < 4) {
      return NextResponse.json({ code: 1, message: '账号至少4个字符' });
    }

    if (password.length < 4) {
      return NextResponse.json({ code: 1, message: '密码至少4个字符' });
    }

    const supabase = createClient();

    // Check if account already exists
    const { data: existing } = await supabase
      .from('platform_users')
      .select('id, status')
      .eq('account', account)
      .maybeSingle();

    if (existing) {
      if (existing.status === 'pending') {
        return NextResponse.json({ code: 1, message: '该账号已注册，正在等待管理员审核' });
      }
      if (existing.status === 'approved') {
        return NextResponse.json({ code: 1, message: '该账号已存在' });
      }
      if (existing.status === 'rejected') {
        // Allow re-registration after rejection
        await supabase.from('platform_users').delete().eq('id', existing.id);
      }
    }

    // Create user with pending status
    const { data: newUser, error: insertError } = await supabase
      .from('platform_users')
      .insert({
        account,
        password_hash: hashPassword(password),
        name,
        role: 'user',
        status: 'pending',
      })
      .select('id')
      .single();

    if (insertError || !newUser) {
      return NextResponse.json({ code: 1, message: '注册失败，请稍后重试' });
    }

    // Create audit request for registration
    await supabase.from('platform_audit_requests').insert({
      user_id: newUser.id,
      request_type: 'register',
      status: 'pending',
      new_value: JSON.stringify({ account, name }),
    });

    return NextResponse.json({
      code: 0,
      message: '注册成功，请等待管理员审核',
    });
  } catch {
    return NextResponse.json({ code: 1, message: '注册失败' });
  }
}
