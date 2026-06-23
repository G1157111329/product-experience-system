import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canReadReport, isAuthResponse, requireUser } from '@/lib/server/auth';
import { createAssemblyFromReports } from '@/lib/server/comparison-assembly';

/**
 * POST /api/comparison-assemblies/from-reports
 * 报告中心多选报告生成组装（事后聚合 / 自定义合并）
 * body: {
 *   report_ids: string[],
 *   name: string,
 *   assembly_type?: 'post_report_assembly' | 'custom_merge',
 *   layout_type?: 'image_matrix' | 'metric_table' | 'mixed',
 *   comparison_intent?: string
 * }
 */
export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const body = await request.json();
  const reportIds: string[] = Array.isArray(body.report_ids) ? body.report_ids : [];
  if (reportIds.length < 2) {
    return NextResponse.json({ code: 1, message: '至少选择 2 份报告' }, { status: 400 });
  }
  if (typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ code: 1, message: '请填写组装名称' }, { status: 400 });
  }

  // 校验用户对每份报告的读权限
  for (const reportId of reportIds) {
    const canRead = await canReadReport(client, user, reportId);
    if (!canRead) {
      return NextResponse.json({ code: 1, message: `无权访问报告 ${reportId}` }, { status: 403 });
    }
  }

  try {
    const assembly = await createAssemblyFromReports(client, reportIds, {
      name: body.name,
      createdBy: user.id,
      assemblyType: body.assembly_type,
      layoutType: body.layout_type,
      comparisonIntent: body.comparison_intent,
    });
    return NextResponse.json({ code: 0, message: '创建成功', data: assembly });
  } catch (err) {
    return NextResponse.json(
      { code: 1, message: err instanceof Error ? err.message : '创建失败' },
      { status: 500 }
    );
  }
}