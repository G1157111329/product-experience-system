import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient as createClient } from '@/storage/database/supabase-client';
import { getCurrentUser, unauthorized } from '@/lib/server/auth';
import { writeSecurityAudit } from '@/lib/server/security-audit';

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const currentUser = await getCurrentUser(request, supabase);
    if (!currentUser) return unauthorized();

    let query = supabase
      .from('platform_audit_requests')
      .select('id, user_id, request_type, status, old_value, new_value, target_user_id, reviewed_by, reviewed_at, created_at');

    if (currentUser.role === 'admin') {
      query = query.eq('status', 'pending').order('created_at', { ascending: true });
    } else {
      query = query.eq('user_id', currentUser.id).order('created_at', { ascending: false });
    }

    const { data: requests, error } = await query;
    if (error) return NextResponse.json({ code: 1, message: '查询失败' }, { status: 500 });

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
    return NextResponse.json({ code: 1, message: '查询失败' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = createClient();
    const currentUser = await getCurrentUser(request, supabase);
    if (!currentUser) return unauthorized();

    const body = await request.json();
    const { request_id, action } = body as { request_id?: string; action?: 'approve' | 'reject' | 'cancel' };

    if (!request_id || !action) {
      return NextResponse.json({ code: 1, message: '参数不完整' }, { status: 400 });
    }

    const { data: auditReq } = await supabase
      .from('platform_audit_requests')
      .select('*')
      .eq('id', request_id)
      .maybeSingle();

    if (!auditReq) {
      return NextResponse.json({ code: 1, message: '审核请求不存在' }, { status: 404 });
    }

    if (auditReq.status !== 'pending') {
      return NextResponse.json({ code: 1, message: '该请求已处理' }, { status: 400 });
    }

    if (action === 'cancel') {
      if (auditReq.user_id !== currentUser.id) {
        return NextResponse.json({ code: 1, message: '只能取消自己的申请' }, { status: 403 });
      }

      await supabase
        .from('platform_audit_requests')
        .update({ status: 'cancelled' })
        .eq('id', request_id);

      await writeSecurityAudit(supabase, {
        request,
        actor: currentUser,
        action: 'audit_request.cancel',
        outcome: 'success',
        targetType: 'platform_audit_request',
        targetId: request_id,
        metadata: { requestType: auditReq.request_type },
      });

      return NextResponse.json({ code: 0, message: '已取消申请' });
    }

    if (currentUser.role !== 'admin') {
      return NextResponse.json({ code: 1, message: '无权限' }, { status: 403 });
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    await supabase
      .from('platform_audit_requests')
      .update({
        status: newStatus,
        reviewed_by: currentUser.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', request_id);

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
    } else if (auditReq.request_type === 'register') {
      await supabase.from('platform_users').update({ status: 'rejected' }).eq('id', auditReq.user_id);
    }

    await writeSecurityAudit(supabase, {
      request,
      actor: currentUser,
      action: `audit_request.${action}`,
      outcome: 'success',
      targetType: 'platform_audit_request',
      targetId: request_id,
      metadata: {
        requestType: auditReq.request_type,
        targetUserId: auditReq.target_user_id || auditReq.user_id,
      },
    });

    return NextResponse.json({
      code: 0,
      message: action === 'approve' ? '已通过' : '已拒绝',
    });
  } catch {
    return NextResponse.json({ code: 1, message: '操作失败' }, { status: 500 });
  }
}
