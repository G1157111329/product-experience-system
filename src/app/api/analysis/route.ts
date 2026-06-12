import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { isAuthResponse, requireAdmin, requireUser } from '@/lib/server/auth';
import { writeSecurityAudit } from '@/lib/server/security-audit';

type DataRow = Record<string, string | null | undefined> & {
  id: string;
  status: string;
  created_at: string;
};

function csvEscape(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const { searchParams } = new URL(request.url);
  const created_by = searchParams.get('created_by');
  const product_category = searchParams.get('product_category');
  const product = searchParams.get('product');
  const project_type = searchParams.get('project_type');
  const organizer = searchParams.get('organizer');
  const issue_level = searchParams.get('issue_level');
  const date_from = searchParams.get('date_from');
  const date_to = searchParams.get('date_to');

  let taskQuery = client.from('experience_tasks').select('id, task_name, product_category, product, product_model, project_number, project_type, project_phase, organizer, status, created_by, created_at');
  if (user.role !== 'admin') taskQuery = taskQuery.eq('created_by', user.id);
  if (user.role === 'admin' && created_by) taskQuery = taskQuery.eq('created_by', created_by);
  if (product_category) taskQuery = taskQuery.eq('product_category', product_category);
  if (product) taskQuery = taskQuery.eq('product', product);
  if (project_type) taskQuery = taskQuery.eq('project_type', project_type);
  if (organizer) taskQuery = taskQuery.eq('organizer', organizer);
  if (date_from) taskQuery = taskQuery.gte('created_at', date_from);
  if (date_to) taskQuery = taskQuery.lte('created_at', date_to + 'T23:59:59');

  const { data: tasks } = await taskQuery;
  const taskList = (tasks || []) as DataRow[];
  const taskIds = taskList.map((t) => t.id).filter(Boolean);

  let issueList: Array<Record<string, unknown>> = [];
  if (taskIds.length > 0) {
    let issueQuery = client.from('issues').select('id, title, level, status, source_type, task_id, product_model, created_at');
    issueQuery = issueQuery.in('task_id', taskIds);
    if (issue_level) issueQuery = issueQuery.eq('level', issue_level);
    const { data: issues } = await issueQuery;
    issueList = (issues || []) as Array<Record<string, unknown>>;
  }

  const totalTasks = taskList.length;
  const completedTasks = taskList.filter((t) => t.status === '已完成').length;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const totalIssues = issueList.length;
  const rectifiedIssues = issueList.filter(i => (i.status as string) === '已验证').length;
  const rectificationRate = totalIssues > 0 ? Math.round((rectifiedIssues / totalIssues) * 100) : 0;

  const taskStatusDist: Record<string, number> = {};
  for (const t of taskList) taskStatusDist[t.status] = (taskStatusDist[t.status] || 0) + 1;

  const issueLevelDist: Record<string, number> = {};
  for (const i of issueList) {
    const level = String(i.level || '未分类');
    issueLevelDist[level] = (issueLevelDist[level] || 0) + 1;
  }

  const issueRectificationGrid: Record<string, Record<string, number>> = {};
  for (const i of issueList) {
    const status = String(i.status || '未分类');
    const level = String(i.level || '未分类');
    if (!issueRectificationGrid[status]) issueRectificationGrid[status] = {};
    issueRectificationGrid[status][level] = (issueRectificationGrid[status][level] || 0) + 1;
  }

  const byProjectType: Record<string, { tasks: number; completedTasks: number; issues: number; rectifiedIssues: number }> = {};
  const byOrganizer: Record<string, { tasks: number; completedTasks: number; issues: number; rectifiedIssues: number }> = {};
  const byCategoryProduct: Record<string, { tasks: number; completedTasks: number; issues: number; rectifiedIssues: number }> = {};
  const monthTrend: Record<string, { tasks: number; completedTasks: number; issues: number; rectifiedIssues: number }> = {};

  const taskInfo = new Map(taskList.map((task) => [task.id, task]));
  for (const t of taskList) {
    const projectKey = t.project_type || '未分类';
    const organizerKey = t.organizer || '未指定';
    const categoryKey = t.product_category ? `${t.product_category}${t.product ? ' - ' + t.product : ''}` : '未分类';
    const monthKey = String(t.created_at || '').slice(0, 7) || 'unknown';
    for (const [map, key] of [[byProjectType, projectKey], [byOrganizer, organizerKey], [byCategoryProduct, categoryKey], [monthTrend, monthKey]] as const) {
      if (!map[key]) map[key] = { tasks: 0, completedTasks: 0, issues: 0, rectifiedIssues: 0 };
      map[key].tasks += 1;
      if (t.status === '已完成') map[key].completedTasks += 1;
    }
  }

  for (const i of issueList) {
    const task = taskInfo.get(String(i.task_id || ''));
    const keys = [
      [byProjectType, task?.project_type || '未分类'],
      [byOrganizer, task?.organizer || '未指定'],
      [byCategoryProduct, task?.product_category ? `${task.product_category}${task.product ? ' - ' + task.product : ''}` : '未分类'],
      [monthTrend, String(task?.created_at || '').slice(0, 7) || 'unknown'],
    ] as const;
    for (const [map, key] of keys) {
      if (!map[key]) map[key] = { tasks: 0, completedTasks: 0, issues: 0, rectifiedIssues: 0 };
      map[key].issues += 1;
      if (i.status === '已验证') map[key].rectifiedIssues += 1;
    }
  }

  const { data: catData } = await client.from('platform_categories').select('id, name, sort_order').order('sort_order');
  const { data: prodData } = await client.from('platform_products').select('id, name, category_id, sort_order').order('sort_order');
  const categories = ((catData || []) as DataRow[]).map((c) => ({
    ...c,
    products: ((prodData || []) as DataRow[]).filter((p) => p.category_id === c.id),
  }));
  const projectTypes = ['ODM/OEM', '竞品研究', '自研', '前期研究', '改型/降本/优化', '海外产品'];
  const organizers = [...new Set(taskList.map((t) => t.organizer).filter(Boolean))];

  return NextResponse.json({
    code: 0,
    message: 'success',
    data: {
      coreMetrics: { totalTasks, completedTasks, completionRate, totalIssues, rectifiedIssues, rectificationRate },
      taskStatusDist,
      issueLevelDist,
      issueRectificationGrid,
      byCategoryProduct,
      byProjectType,
      byOrganizer,
      byIssueLevel: issueLevelDist,
      monthTrend,
      filterOptions: { categories, projectTypes, organizers },
    },
  });
}

export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const admin = await requireAdmin(request, client);
  if (isAuthResponse(admin)) return admin;

  const body = await request.json();
  const { format } = body;
  const { data: tasks } = await client.from('experience_tasks').select('*');
  const { data: issues } = await client.from('issues').select('*');

  if (format === 'csv') {
    const taskHeaders = '任务名称,项目单号,品类,产品,型号,项目类型,项目阶段,组织者,状态,创建时间\n';
    const taskRows = ((tasks || []) as DataRow[]).map((t) => [
      t.task_name,
      t.project_number,
      t.product_category,
      t.product,
      t.product_model,
      t.project_type,
      t.project_phase,
      t.organizer,
      t.status,
      t.created_at,
    ].map(csvEscape).join(',')).join('\n');

    const issueHeaders = '问题标题,等级,状态,来源类型,产品型号,整改方案,责任人,创建时间\n';
    const issueRows = ((issues || []) as DataRow[]).map((i) => [
      i.title,
      i.level,
      i.status,
      i.source_type,
      i.product_model,
      i.improve_plan,
      i.responsible_person,
      i.created_at,
    ].map(csvEscape).join(',')).join('\n');

    await writeSecurityAudit(client, {
      request,
      actor: admin,
      action: 'analysis.export_csv',
      outcome: 'success',
      targetType: 'analysis',
      metadata: {
        taskCount: (tasks || []).length,
        issueCount: (issues || []).length,
      },
    });

    return NextResponse.json({
      code: 0,
      data: { tasksCsv: taskHeaders + taskRows, issuesCsv: issueHeaders + issueRows },
    });
  }

  return NextResponse.json({ code: 0, data: { tasks, issues } });
}
