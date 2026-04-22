import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient as createClient } from '@/storage/database/supabase-client';

// GET: list all platform_users (admin only, for role management)
export async function GET(request: NextRequest) {
  try {
    const adminUserId = request.nextUrl.searchParams.get('admin_user_id');
    if (!adminUserId) {
      return NextResponse.json({ code: 1, message: '缺少管理员ID' });
    }

    const supabase = createClient();

    // Verify admin
    const { data: admin } = await supabase
      .from('platform_users')
      .select('role')
      .eq('id', adminUserId)
      .maybeSingle();

    if (!admin || admin.role !== 'admin') {
      return NextResponse.json({ code: 1, message: '无权限' });
    }

    const { data: platform_users, error } = await supabase
      .from('platform_users')
      .select('id, account, name, role, status, created_at')
      .eq('status', 'approved')
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ code: 1, message: '查询失败' });
    }

    return NextResponse.json({ code: 0, data: platform_users });
  } catch {
    return NextResponse.json({ code: 1, message: '查询失败' });
  }
}

// POST: request role upgrade for another user (admin only)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { admin_user_id, target_user_id, action } = body; // action: 'upgrade' | 'downgrade' | 'delete'

    if (!admin_user_id || !target_user_id || !action) {
      return NextResponse.json({ code: 1, message: '参数不完整' });
    }

    // Prevent self-deletion and self-role-change
    if (admin_user_id === target_user_id) {
      return NextResponse.json({ code: 1, message: '不能操作自己的账号' });
    }

    const supabase = createClient();

    // Verify admin
    const { data: admin } = await supabase
      .from('platform_users')
      .select('role')
      .eq('id', admin_user_id)
      .maybeSingle();

    if (!admin || admin.role !== 'admin') {
      return NextResponse.json({ code: 1, message: '无权限' });
    }

    if (action === 'upgrade') {
      // Directly upgrade - admin initiated, no audit needed
      await supabase.from('platform_users').update({ role: 'admin' }).eq('id', target_user_id);
      return NextResponse.json({ code: 0, message: '已升级为管理账号' });
    }

    if (action === 'downgrade') {
      // Prevent downgrading the last admin
      const { data: admins } = await supabase
        .from('platform_users')
        .select('id')
        .eq('role', 'admin')
        .eq('status', 'approved');

      if (!admins || admins.length <= 1) {
        return NextResponse.json({ code: 1, message: '至少保留一个管理账号' });
      }
      await supabase.from('platform_users').update({ role: 'user' }).eq('id', target_user_id);
      return NextResponse.json({ code: 0, message: '已降级为普通账号' });
    }

    if (action === 'delete') {
      // Prevent deleting the last admin
      const { data: targetUser } = await supabase
        .from('platform_users')
        .select('role')
        .eq('id', target_user_id)
        .maybeSingle();

      if (targetUser?.role === 'admin') {
        const { data: admins } = await supabase
          .from('platform_users')
          .select('id')
          .eq('role', 'admin')
          .eq('status', 'approved');

        if (!admins || admins.length <= 1) {
          return NextResponse.json({ code: 1, message: '至少保留一个管理账号' });
        }
      }

      // Clean up references before deleting
      // 1. Nullify report_shares.created_by (preserves share links)
      await supabase.from('report_shares').update({ created_by: null }).eq('created_by', target_user_id);
      // 2. Delete audit requests from/to this user
      await supabase.from('platform_audit_requests').delete().eq('user_id', target_user_id);
      await supabase.from('platform_audit_requests').delete().eq('admin_user_id', target_user_id);

      // 3. Delete the user (reports/tasks preserve organizer as name string, not FK)
      const { error: deleteError } = await supabase.from('platform_users').delete().eq('id', target_user_id);
      if (deleteError) {
        return NextResponse.json({ code: 1, message: '删除失败: ' + deleteError.message });
      }
      return NextResponse.json({ code: 0, message: '账号已删除' });
    }

    return NextResponse.json({ code: 1, message: '不支持的操作' });
  } catch {
    return NextResponse.json({ code: 1, message: '操作失败' });
  }
}
