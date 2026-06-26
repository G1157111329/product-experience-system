import { NextRequest, NextResponse } from 'next/server';
import { isAuthResponse, requireAdmin } from '@/lib/server/auth';
import { writeSecurityAudit } from '@/lib/server/security-audit';
import { getSupabaseClient } from '@/storage/database/supabase-client';

const exportColumns = [
  'created_at',
  'action',
  'outcome',
  'actor_account',
  'actor_user_id',
  'target_type',
  'target_id',
  'request_method',
  'request_path',
  'ip_address',
  'user_agent',
  'metadata',
] as const;

function csvCell(value: unknown) {
  let text = value === null || value === undefined
    ? ''
    : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(rows: Array<Record<string, unknown>>) {
  const header = exportColumns.join(',');
  const body = rows.map((row) => exportColumns.map((column) => csvCell(row[column])).join(',')).join('\n');
  return `${header}\n${body}`;
}

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const admin = await requireAdmin(request, client);
  if (isAuthResponse(admin)) return admin;

  const { searchParams } = request.nextUrl;
  const action = searchParams.get('action');
  const actorUserId = searchParams.get('actor_user_id');
  const actorAccount = searchParams.get('actor_account');
  const targetType = searchParams.get('target_type');
  const targetId = searchParams.get('target_id');
  const outcome = searchParams.get('outcome');
  const requestPath = searchParams.get('request_path');
  const dateFrom = searchParams.get('date_from');
  const dateTo = searchParams.get('date_to');
  const keyword = searchParams.get('keyword')?.trim();
  const format = searchParams.get('format');
  const limit = Math.min(Math.max(Number(searchParams.get('limit') || 100), 1), 500);

  let query = client
    .from('security_audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (action) query = query.eq('action', action);
  if (actorUserId) query = query.eq('actor_user_id', actorUserId);
  if (actorAccount) query = query.ilike('actor_account', `%${actorAccount}%`);
  if (targetType) query = query.eq('target_type', targetType);
  if (targetId) query = query.ilike('target_id', `%${targetId}%`);
  if (outcome) query = query.eq('outcome', outcome);
  if (requestPath) query = query.ilike('request_path', `%${requestPath}%`);
  if (dateFrom) query = query.gte('created_at', dateFrom);
  if (dateTo) query = query.lte('created_at', dateTo);
  if (keyword) {
    const safeKeyword = keyword.replace(/[%_]/g, '\\$&').replace(/,/g, ' ');
    query = query.or([
      `action.ilike.%${safeKeyword}%`,
      `actor_account.ilike.%${safeKeyword}%`,
      `target_type.ilike.%${safeKeyword}%`,
      `target_id.ilike.%${safeKeyword}%`,
      `request_path.ilike.%${safeKeyword}%`,
    ].join(','));
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ code: 1, message: '审计日志查询失败' }, { status: 500 });

  if (format === 'csv') {
    await writeSecurityAudit(client, {
      action: 'security_audit.export',
      outcome: 'success',
      request,
      actor: admin,
      targetType: 'security_audit_logs',
      metadata: { format, limit, action, outcome, targetType, dateFrom, dateTo, keyword: keyword ? '[filtered]' : null },
    });
    return new NextResponse(toCsv((data || []) as Array<Record<string, unknown>>), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="security-audit-logs-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  if (format === 'json') {
    await writeSecurityAudit(client, {
      action: 'security_audit.export',
      outcome: 'success',
      request,
      actor: admin,
      targetType: 'security_audit_logs',
      metadata: { format, limit, action, outcome, targetType, dateFrom, dateTo, keyword: keyword ? '[filtered]' : null },
    });
    return new NextResponse(JSON.stringify(data || [], null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="security-audit-logs-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  }

  return NextResponse.json({ code: 0, message: 'success', data: data || [] });
}
