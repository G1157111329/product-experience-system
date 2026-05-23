import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient as createClient } from '@/storage/database/supabase-client';

// GET: list pending audit requests
// - admin_user_id: admin sees all pending requests
// - user_id: non-admin sees their own pending requests
export async function GET(request: NextRequest) {
  try {
    const adminUserId = request.nextUrl.searchParams.get('admin_user_id');
    const userId = request.nextUrl.searchParams.get('user_id');

    if (!adminUserId && !userId) {
      return NextResponse.json({ code: 1, message: '缺少用户ID' });
    }

    const supabase = createClient();

    let query = supabase
      .from('platform_audit_requests')
      .select(`
        id, user_id, request_type, status, old_value, new_value,
        target_user_id, reviewed_by, reviewed_at, created_at
      `);

    if (adminUserId) {
      // Admin mode: verify admin, show all pending
      const { data: admin } = await supabase
        .from('platform_users')
        .select('role')
        .eq('id', adminUserId)
        .maybeSingle();

      if (!admin || admin.role !== 'admin') {
        return NextResponse.json({ code: 1, message: '无权限' });
      }

      query = query.eq('status', 'pending').order('created_at', { ascending: true });
    } else {
      // Non-admin mode: show own requests (all statuses for context)
      query = query.eq('user_id', userId!).order('created_at', { ascending: false });
    }

    const { data: requests, error } = await query;

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

// PUT: approve, reject, or cancel a request
// - admin: approve/reject
// - user: cancel own pending request
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { request_id, admin_user_id, user_id, action } = body; // action: 'approve' | 'reject' | 'cancel'

    if (!request_id || !action) {
      return NextResponse.json({ code: 1, message: '参数不完整' });
    }

    if (!admin_user_id && !user_id) {
      return NextResponse.json({ code: 1, message: '缺少用户标识' });
    }

    const supabase = createClient();

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

    // Cancel action: user cancels own request
    if (action === 'cancel') {
      if (!user_id || auditReq.user_id !== user_id) {
        return NextResponse.json({ code: 1, message: '只能取消自己的申请' });
      }

      await supabase
        .from('platform_audit_requests')
        .update({ status: 'cancelled' })
        .eq('id', request_id);

      return NextResponse.json({ code: 0, message: '已取消申请' });
    }

    // Admin actions: approve/reject
    if (!admin_user_id) {
      return NextResponse.json({ code: 1, message: '需要管理员ID' });
    }

    const { data: admin } = await supabase
      .from('platform_users')
      .select('role')
      .eq('id', admin_user_id)
      .maybeSingle();

    if (!admin || admin.role !== 'admin') {
      return NextResponse.json({ code: 1, message: '无权限' });
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
          await supabase.from('platform_users').update({ status: 'approved' }).eq('id', auditReq.user_id);
          break;

        case 'password_reset':
        case 'password_change':
          await supabase.from('platform_users').update({ password_hash: auditReq.new_value }).eq('id', auditReq.user_id);
          break;

        case 'name_change':
          await supabase.from('platform_users').update({ name: auditReq.new_value }).eq('id', auditReq.user_id);
          break;

        case 'role_upgrade':
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
