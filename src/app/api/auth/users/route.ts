import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient as createClient } from '@/storage/database/supabase-client';
import { requireAdmin, isAuthResponse } from '@/lib/server/auth';
import { writeSecurityAudit } from '@/lib/server/security-audit';

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const admin = await requireAdmin(request, supabase);
    if (isAuthResponse(admin)) return admin;

    const { data: platformUsers, error } = await supabase
      .from('platform_users')
      .select('id, account, name, role, status, created_at')
      .eq('status', 'approved')
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ code: 1, message: '查询失败' }, { status: 500 });
    }

    return NextResponse.json({ code: 0, data: platformUsers });
  } catch {
    return NextResponse.json({ code: 1, message: '查询失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const admin = await requireAdmin(request, supabase);
    if (isAuthResponse(admin)) return admin;

    const body = await request.json();
    const { target_user_id, action } = body as {
      target_user_id?: string;
      action?: 'upgrade' | 'downgrade' | 'delete';
    };

    if (!target_user_id || !action) {
      return NextResponse.json({ code: 1, message: '参数不完整' }, { status: 400 });
    }

    if (admin.id === target_user_id) {
      return NextResponse.json({ code: 1, message: '不能操作自己的账号' }, { status: 400 });
    }

    if (action === 'upgrade') {
      await supabase.from('platform_users').update({ role: 'admin' }).eq('id', target_user_id);
      await writeSecurityAudit(supabase, {
        request,
        actor: admin,
        action: 'user.role.upgrade',
        outcome: 'success',
        targetType: 'platform_user',
        targetId: target_user_id,
      });
      return NextResponse.json({ code: 0, message: '已升级为管理账号' });
    }

    if (action === 'downgrade') {
      const { data: admins } = await supabase
        .from('platform_users')
        .select('id')
        .eq('role', 'admin')
        .eq('status', 'approved');

      if (!admins || admins.length <= 1) {
        return NextResponse.json({ code: 1, message: '至少保留一个管理账号' }, { status: 400 });
      }
      await supabase.from('platform_users').update({ role: 'user' }).eq('id', target_user_id);
      await writeSecurityAudit(supabase, {
        request,
        actor: admin,
        action: 'user.role.downgrade',
        outcome: 'success',
        targetType: 'platform_user',
        targetId: target_user_id,
      });
      return NextResponse.json({ code: 0, message: '已降级为普通账号' });
    }

    if (action === 'delete') {
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
          return NextResponse.json({ code: 1, message: '至少保留一个管理账号' }, { status: 400 });
        }
      }

      await supabase.from('report_shares').update({ created_by: null }).eq('created_by', target_user_id);
      await supabase.from('platform_audit_requests').delete().eq('user_id', target_user_id);
      await supabase.from('platform_audit_requests').delete().eq('reviewed_by', target_user_id);

      const { error: deleteError } = await supabase.from('platform_users').delete().eq('id', target_user_id);
      if (!deleteError) {
        await writeSecurityAudit(supabase, {
          request,
          actor: admin,
          action: 'user.delete',
          outcome: 'success',
          targetType: 'platform_user',
          targetId: target_user_id,
        });
      }
      if (deleteError) {
        return NextResponse.json({ code: 1, message: '删除失败' }, { status: 500 });
      }
      return NextResponse.json({ code: 0, message: '账号已删除' });
    }

    return NextResponse.json({ code: 1, message: '不支持的操作' }, { status: 400 });
  } catch {
    return NextResponse.json({ code: 1, message: '操作失败' }, { status: 500 });
  }
}
