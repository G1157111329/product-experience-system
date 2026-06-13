import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { isAuthResponse, requireAdmin, requireUser } from '@/lib/server/auth';
import { writeSecurityAudit } from '@/lib/server/security-audit';
import { getPool } from '@/storage/database/pg-db';

type DataRow = Record<string, string | null | undefined> & {
  id: string;
  status: string;
  created_at: string;
};

function csvEscape(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function objectFromRows(rows: Array<{ key: string; count: string | number }>) {
  return Object.fromEntries(rows.map((row) => [row.key, Number(row.count)]));
}

function mergeTaskIssueAgg(
  taskRows: Array<{ key: string; tasks: string | number; completed_tasks: string | number }>,
  issueRows: Array<{ key: string; issues: string | number; rectified_issues: string | number }>,
) {
  const result: Record<string, { tasks: number; completedTasks: number; issues: number; rectifiedIssues: number }> = {};
  for (const row of taskRows) {
    result[row.key] = {
      tasks: Number(row.tasks),
      completedTasks: Number(row.completed_tasks),
      issues: 0,
      rectifiedIssues: 0,
    };
  }
  for (const row of issueRows) {
    if (!result[row.key]) result[row.key] = { tasks: 0, completedTasks: 0, issues: 0, rectifiedIssues: 0 };
    result[row.key].issues = Number(row.issues);
    result[row.key].rectifiedIssues = Number(row.rectified_issues);
  }
  return result;
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

  const pool = getPool();
  const params: unknown[] = [];
  const taskConditions: string[] = [];
  const addParam = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (user.role !== 'admin') taskConditions.push(`t.created_by = ${addParam(user.id)}`);
  if (user.role === 'admin' && created_by) taskConditions.push(`t.created_by = ${addParam(created_by)}`);
  if (product_category) taskConditions.push(`t.product_category = ${addParam(product_category)}`);
  if (product) taskConditions.push(`t.product = ${addParam(product)}`);
  if (project_type) taskConditions.push(`t.project_type = ${addParam(project_type)}`);
  if (organizer) taskConditions.push(`t.organizer = ${addParam(organizer)}`);
  if (date_from) taskConditions.push(`t.created_at >= ${addParam(date_from)}`);
  if (date_to) taskConditions.push(`t.created_at <= ${addParam(`${date_to}T23:59:59`)}`);
  const issueLevelSql = issue_level ? `WHERE i.level = ${addParam(issue_level)}` : '';

  const filteredCte = `
    WITH filtered_tasks AS (
      SELECT id, task_name, product_category, product, product_model, project_number, project_type, project_phase, organizer, status, created_by, created_at
      FROM experience_tasks t
      ${taskConditions.length > 0 ? `WHERE ${taskConditions.join(' AND ')}` : ''}
    ),
    filtered_issues AS (
      SELECT i.*, ft.product_category AS task_product_category, ft.product AS task_product, ft.project_type AS task_project_type,
        ft.organizer AS task_organizer, ft.created_at AS task_created_at
      FROM issues i
      JOIN filtered_tasks ft ON ft.id = i.task_id
      ${issueLevelSql}
    )
  `;

  const { rows: metricRows } = await pool.query<{
    total_tasks: string;
    completed_tasks: string;
    total_issues: string;
    rectified_issues: string;
  }>(
    `${filteredCte}
    SELECT
      (SELECT count(*) FROM filtered_tasks)::text AS total_tasks,
      (SELECT count(*) FROM filtered_tasks WHERE status = '已完成')::text AS completed_tasks,
      (SELECT count(*) FROM filtered_issues)::text AS total_issues,
      (SELECT count(*) FROM filtered_issues WHERE status = '已验证')::text AS rectified_issues
    `,
    params,
  );

  const metrics = metricRows[0] || { total_tasks: '0', completed_tasks: '0', total_issues: '0', rectified_issues: '0' };
  const totalTasks = Number(metrics.total_tasks);
  const completedTasks = Number(metrics.completed_tasks);
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const totalIssues = Number(metrics.total_issues);
  const rectifiedIssues = Number(metrics.rectified_issues);
  const rectificationRate = totalIssues > 0 ? Math.round((rectifiedIssues / totalIssues) * 100) : 0;

  const { rows: taskStatusRows } = await pool.query<{ key: string; count: string }>(
    `${filteredCte}
    SELECT COALESCE(status, '未分类') AS key, count(*)::text AS count
    FROM filtered_tasks
    GROUP BY key
    `,
    params,
  );
  const taskStatusDist = objectFromRows(taskStatusRows);

  const { rows: issueLevelRows } = await pool.query<{ key: string; count: string }>(
    `${filteredCte}
    SELECT COALESCE(level, '未分类') AS key, count(*)::text AS count
    FROM filtered_issues
    GROUP BY key
    `,
    params,
  );
  const issueLevelDist = objectFromRows(issueLevelRows);

  const { rows: issueRectRows } = await pool.query<{ status: string; level: string; count: string }>(
    `${filteredCte}
    SELECT COALESCE(status, '未分类') AS status, COALESCE(level, '未分类') AS level, count(*)::text AS count
    FROM filtered_issues
    GROUP BY status, level
    `,
    params,
  );
  const issueRectificationGrid: Record<string, Record<string, number>> = {};
  for (const row of issueRectRows) {
    if (!issueRectificationGrid[row.status]) issueRectificationGrid[row.status] = {};
    issueRectificationGrid[row.status][row.level] = Number(row.count);
  }

  async function groupedMetrics(taskKeySql: string, issueKeySql: string) {
    const { rows: taskRows } = await pool.query<{ key: string; tasks: string; completed_tasks: string }>(
      `${filteredCte}
      SELECT ${taskKeySql} AS key,
        count(*)::text AS tasks,
        count(*) FILTER (WHERE status = '已完成')::text AS completed_tasks
      FROM filtered_tasks
      GROUP BY key
      `,
      params,
    );
    const { rows: issueRows } = await pool.query<{ key: string; issues: string; rectified_issues: string }>(
      `${filteredCte}
      SELECT ${issueKeySql} AS key,
        count(*)::text AS issues,
        count(*) FILTER (WHERE status = '已验证')::text AS rectified_issues
      FROM filtered_issues
      GROUP BY key
      `,
      params,
    );
    return mergeTaskIssueAgg(taskRows, issueRows);
  }

  const [byProjectType, byOrganizer, byCategoryProduct, monthTrend] = await Promise.all([
    groupedMetrics("COALESCE(project_type, '未分类')", "COALESCE(task_project_type, '未分类')"),
    groupedMetrics("COALESCE(organizer, '未指定')", "COALESCE(task_organizer, '未指定')"),
    groupedMetrics(
      "CASE WHEN product_category IS NULL OR product_category = '' THEN '未分类' ELSE product_category || CASE WHEN product IS NULL OR product = '' THEN '' ELSE ' - ' || product END END",
      "CASE WHEN task_product_category IS NULL OR task_product_category = '' THEN '未分类' ELSE task_product_category || CASE WHEN task_product IS NULL OR task_product = '' THEN '' ELSE ' - ' || task_product END END",
    ),
    groupedMetrics("COALESCE(to_char(created_at, 'YYYY-MM'), 'unknown')", "COALESCE(to_char(task_created_at, 'YYYY-MM'), 'unknown')"),
  ]);

  const { data: catData } = await client.from('platform_categories').select('id, name, sort_order').order('sort_order');
  const { data: prodData } = await client.from('platform_products').select('id, name, category_id, sort_order').order('sort_order');
  const categories = ((catData || []) as DataRow[]).map((c) => ({
    ...c,
    products: ((prodData || []) as DataRow[]).filter((p) => p.category_id === c.id),
  }));
  const projectTypes = ['ODM/OEM', '竞品研究', '自研', '前期研究', '改型/降本/优化', '海外产品'];
  const { rows: organizerRows } = await pool.query<{ organizer: string }>(
    `${filteredCte}
    SELECT DISTINCT organizer
    FROM filtered_tasks
    WHERE organizer IS NOT NULL AND organizer <> ''
    ORDER BY organizer
    `,
    params,
  );
  const organizers = organizerRows.map((row) => row.organizer);

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
