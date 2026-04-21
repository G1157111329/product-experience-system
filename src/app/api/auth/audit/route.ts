import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient as createClient } from '@/storage/database/supabase-client';
import crypto from 'crypto';

const HASH_SALT = 'xp_experience_platform';

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(HASH_SALT + password).digest('hex');
}

// GET: list pending audit requests (admin only)
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

    // Fetch all pending requests with user info
    const { data: requests, error } = await supabase
      .from('platform_audit_requests')
      .select(`
        id, user_id, request_type, status, old_value, new_value,
        target_user_id, reviewed_by, reviewed_at, created_at
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ code: 1, message: '查询失败' });
    }

    // Enrich with user account/name info
    const enriched = await Promise.all((requests || []).map(async (req: Record<string, unknown>) => {
      const { data: userInfo } = await supabase
        .from('platform_users')
        .select('account, name, role')
        .eq('id', req.user_id as string)
        .maybeSingle();

      let targetUserInfo = null;
      if (req.target_user_id) {
        const { data: target } = await supabase
          .from('platform_users')
          .select('account, name, role')
          .eq('id', req.target_user_id as string)
          .maybeSingle();
        targetUserInfo = target;
      }

      return {
        ...req,
        user_account: userInfo?.account,
        user_name: userInfo?.name,
        user_role: userInfo?.role,
        target_user_account: targetUserInfo?.account,
        target_user_name: targetUserInfo?.name,
      };
    }));

    return NextResponse.json({ code: 0, data: enriched });
  } catch {
    return NextResponse.json({ code: 1, message: '查询失败' });
  }
}

// PUT: approve or reject a request (admin only)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { request_id, admin_user_id, action } = body; // action: 'approve' | 'reject'

    if (!request_id || !admin_user_id || !action) {
      return NextResponse.json({ code: 1, message: '参数不完整' });
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

    // Get the request
    const { data: auditReq } = await supabase
      .from('platform_audit_requests')
      .select('*')
      .eq('id', request_id)
      .maybeSingle();

    if (!auditReq) {
      return NextResponse.json({ code: 1, message: '审核请求不存在' });
    }

    if (auditReq.status !== 'pending') {
      return NextResponse.json({ code: 1, message: '该请求已处理' });
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    // Update audit request
    await supabase
      .from('platform_audit_requests')
      .update({
        status: newStatus,
        reviewed_by: admin_user_id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', request_id);

    // If approved, apply the change
    if (action === 'approve') {
      switch (auditReq.request_type) {
        case 'register':
          // Approve user registration
          await supabase.from('platform_users').update({ status: 'approved' }).eq('id', auditReq.user_id);
          break;

        case 'password_reset':
        case 'password_change':
          // Update password
          await supabase.from('platform_users').update({ password_hash: auditReq.new_value }).eq('id', auditReq.user_id);
          break;

        case 'name_change':
          // Update name
          await supabase.from('platform_users').update({ name: auditReq.new_value }).eq('id', auditReq.user_id);
          break;

        case 'role_upgrade':
          // Upgrade target user to admin
          if (auditReq.target_user_id) {
            await supabase.from('platform_users').update({ role: 'admin' }).eq('id', auditReq.target_user_id);
          }
          break;
      }
    } else {
      // If register rejected, update user status
      if (auditReq.request_type === 'register') {
        await supabase.from('platform_users').update({ status: 'rejected' }).eq('id', auditReq.user_id);
      }
    }

    return NextResponse.json({
      code: 0,
      message: action === 'approve' ? '已通过' : '已拒绝',
    });
  } catch {
    return NextResponse.json({ code: 1, message: '操作失败' });
  }
}
