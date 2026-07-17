import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { isAuthResponse, requireAdmin } from '@/lib/server/auth';
import { shouldShowInitialAdminSecurityReminder } from '@/lib/server/startup-security';

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const admin = await requireAdmin(request, client);
  if (isAuthResponse(admin)) return admin;

  const initialAdminConfigured = Boolean(
    process.env.INITIAL_ADMIN_ACCOUNT?.trim() && process.env.INITIAL_ADMIN_PASSWORD,
  );
  let hasAdmin = false;
  if (initialAdminConfigured) {
    const { data, error } = await client
      .from('platform_users')
      .select('id')
      .eq('role', 'admin')
      .limit(1);
    if (error) return NextResponse.json({ code: 1, message: '无法检查管理员安全提醒' }, { status: 500 });
    hasAdmin = Array.isArray(data) && data.length > 0;
  }

  return NextResponse.json({
    code: 0,
    message: 'success',
    data: {
      initial_admin_bootstrap_cleanup_required: shouldShowInitialAdminSecurityReminder({ initialAdminConfigured, hasAdmin }),
    },
  });
}
