import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient as createClient } from '@/storage/database/supabase-client';
import crypto from 'crypto';

const HASH_SALT = 'xp_experience_platform';

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(HASH_SALT + password).digest('hex');
}

// Forgot password: verify account exists, create audit request
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { account, new_password } = body;

    if (!account || !new_password) {
      return NextResponse.json({ code: 1, message: '请填写账号和新密码' });
    }

    if (new_password.length < 4) {
      return NextResponse.json({ code: 1, message: '密码至少4个字符' });
    }

    const supabase = createClient();

    // Verify account exists
    const { data: user } = await supabase
      .from('platform_users')
      .select('id, status')
      .eq('account', account)
      .maybeSingle();

    if (!user) {
      return NextResponse.json({ code: 1, message: '该账号不存在' });
    }

    if (user.status !== 'approved') {
      return NextResponse.json({ code: 1, message: '该账号尚未通过审核' });
    }

    // Check if there's already a pending password reset request
    const { data: existingReq } = await supabase
      .from('platform_audit_requests')
      .select('id')
      .eq('user_id', user.id)
      .eq('request_type', 'password_reset')
      .eq('status', 'pending')
      .maybeSingle();

    if (existingReq) {
      // Update existing request with new password
      await supabase
        .from('platform_audit_requests')
        .update({ new_value: hashPassword(new_password) })
        .eq('id', existingReq.id);
    } else {
      // Create new audit request
      await supabase.from('platform_audit_requests').insert({
        user_id: user.id,
        request_type: 'password_reset',
        status: 'pending',
        new_value: hashPassword(new_password),
      });
    }

    return NextResponse.json({
      code: 0,
      message: '密码重置申请已提交，请等待管理员审核',
    });
  } catch {
    return NextResponse.json({ code: 1, message: '提交失败' });
  }
}
