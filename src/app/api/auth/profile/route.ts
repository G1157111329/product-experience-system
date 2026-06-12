import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient as createClient } from '@/storage/database/supabase-client';
import { getCurrentUser, unauthorized } from '@/lib/server/auth';
import { hashPassword, validatePasswordStrength } from '@/lib/server/password';

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const currentUser = await getCurrentUser(request, supabase);
    if (!currentUser) return unauthorized();

    const requestedUserId = request.nextUrl.searchParams.get('user_id');
    const userId = currentUser.role === 'admin' && requestedUserId ? requestedUserId : currentUser.id;

    const { data: user, error } = await supabase
      .from('platform_users')
      .select('id, account, name, role, status')
      .eq('id', userId)
      .maybeSingle();

    if (error || !user) {
      return NextResponse.json({ code: 1, message: '用户不存在' }, { status: 404 });
    }

    return NextResponse.json({ code: 0, data: user });
  } catch {
    return NextResponse.json({ code: 1, message: '获取用户信息失败' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { field, value } = body;

    if (!field || !value) {
      return NextResponse.json({ code: 1, message: '参数不完整' }, { status: 400 });
    }

    const supabase = createClient();
    const currentUser = await getCurrentUser(request, supabase);
    if (!currentUser) return unauthorized();
    const userId = currentUser.id;

    const { data: user } = await supabase
      .from('platform_users')
      .select('id, name, role')
      .eq('id', userId)
      .maybeSingle();

    if (!user) {
      return NextResponse.json({ code: 1, message: '用户不存在' }, { status: 404 });
    }

    if (field === 'name') {
      const { data: existingReq } = await supabase
        .from('platform_audit_requests')
        .select('id')
        .eq('user_id', userId)
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
          user_id: userId,
          request_type: 'name_change',
          status: 'pending',
          old_value: user.name,
          new_value: value,
        });
      }

      return NextResponse.json({ code: 0, message: '名称修改申请已提交，请等待管理员审核' });
    }

    if (field === 'password') {
      const passwordError = validatePasswordStrength(String(value));
      if (passwordError) {
        return NextResponse.json({ code: 1, message: passwordError }, { status: 400 });
      }

      const { data: existingReq } = await supabase
        .from('platform_audit_requests')
        .select('id')
        .eq('user_id', userId)
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
          user_id: userId,
          request_type: 'password_change',
          status: 'pending',
          new_value: hashPassword(value),
        });
      }

      return NextResponse.json({ code: 0, message: '密码修改申请已提交，请等待管理员审核' });
    }

    return NextResponse.json({ code: 1, message: '不支持的字段' }, { status: 400 });
  } catch {
    return NextResponse.json({ code: 1, message: '修改失败' }, { status: 500 });
  }
}
