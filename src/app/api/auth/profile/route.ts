import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient as createClient } from '@/storage/database/supabase-client';
import crypto from 'crypto';

const HASH_SALT = 'xp_experience_platform';

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(HASH_SALT + password).digest('hex');
}

// GET: fetch current user profile
export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('user_id');
    if (!userId) {
      return NextResponse.json({ code: 1, message: '缺少用户ID' });
    }

    const supabase = createClient();
    const { data: user, error } = await supabase
      .from('platform_users')
      .select('id, account, name, role, status')
      .eq('id', userId)
      .maybeSingle();

    if (error || !user) {
      return NextResponse.json({ code: 1, message: '用户不存在' });
    }

    return NextResponse.json({ code: 0, data: user });
  } catch {
    return NextResponse.json({ code: 1, message: '获取用户信息失败' });
  }
}

// PUT: update user profile (name/password changes require admin approval)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id, field, value } = body;

    if (!user_id || !field || !value) {
      return NextResponse.json({ code: 1, message: '参数不完整' });
    }

    const supabase = createClient();

    // Verify user exists
    const { data: user } = await supabase
      .from('platform_users')
      .select('id, name, role')
      .eq('id', user_id)
      .maybeSingle();

    if (!user) {
      return NextResponse.json({ code: 1, message: '用户不存在' });
    }

    if (field === 'name') {
      // Check if there's already a pending name change request
      const { data: existingReq } = await supabase
        .from('platform_audit_requests')
        .select('id')
        .eq('user_id', user_id)
        .eq('request_type', 'name_change')
        .eq('status', 'pending')
        .maybeSingle();

      if (existingReq) {
        await supabase
          .from('platform_audit_requests')
          .update({ old_value: user.name, new_value: value })
          .eq('id', existingReq.id);
      } else {
        await supabase.from('platform_audit_requests').insert({
          user_id,
          request_type: 'name_change',
          status: 'pending',
          old_value: user.name,
          new_value: value,
        });
      }

      return NextResponse.json({ code: 0, message: '名称修改申请已提交，请等待管理员审核' });
    }

    if (field === 'password') {
      // Check if there's already a pending password change request
      const { data: existingReq } = await supabase
        .from('platform_audit_requests')
        .select('id')
        .eq('user_id', user_id)
        .eq('request_type', 'password_change')
        .eq('status', 'pending')
        .maybeSingle();

      if (existingReq) {
        await supabase
          .from('platform_audit_requests')
          .update({ new_value: hashPassword(value) })
          .eq('id', existingReq.id);
      } else {
        await supabase.from('platform_audit_requests').insert({
          user_id,
          request_type: 'password_change',
          status: 'pending',
          new_value: hashPassword(value),
        });
      }

      return NextResponse.json({ code: 0, message: '密码修改申请已提交，请等待管理员审核' });
    }

    return NextResponse.json({ code: 1, message: '不支持的字段' });
  } catch {
    return NextResponse.json({ code: 1, message: '修改失败' });
  }
}
