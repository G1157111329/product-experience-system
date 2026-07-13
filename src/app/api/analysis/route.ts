import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { isAuthResponse, requireAdmin, requireUser } from '@/lib/server/auth';
import { writeSecurityAudit } from '@/lib/server/security-audit';
import { getPool } from '@/storage/database/pg-db';
import { createApiTimer } from '@/lib/server/api-performance';

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
  const finishTimer = createApiTimer('analysis.GET');
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
  const issueConditions = [`COALESCE(i.source_type, '') NOT LIKE '%_old'`];
  if (issue_level) issueConditions.push(`i.level = ${addParam(issue_level)}`);

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
      WHERE ${issueConditions.join(' AND ')}
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
      (SELECT count(*) FROM filtered_issues WHERE status IN ('verified_closed', '已验证', '已验证关闭', '已整改', '整改完成'))::text AS rectified_issues
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
    SELECT CASE
      WHEN status IN ('open', '待整改', '待分派', '已分派', '已指派') THEN '待整改'
      WHEN status IN ('rectifying', 'pending_verification', 'reopened', '整改中', '待验证', '已重开') THEN '整改中'
      WHEN status IN ('verified_closed', '已验证', '已验证关闭', '已整改', '整改完成') THEN '整改完成'
      WHEN status IN ('waived', '不整改') THEN '不整改'
      ELSE '待整改'
    END AS status, COALESCE(level, '未分类') AS level, count(*)::text AS count
    FROM filtered_issues
    GROUP BY 1, level
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
        count(*) FILTER (WHERE status IN ('verified_closed', '已验证', '已验证关闭', '已整改', '整改完成'))::text AS rectified_issues
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

  finishTimer({ totalTasks, totalIssues });
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
  const finishTimer = createApiTimer('analysis.POST');
  const client = getSupabaseClient();
  const admin = await requireAdmin(request, client);
  if (isAuthResponse(admin)) return admin;

  const body = await request.json();
  const { format } = body;
  const pool = getPool();

  if (format === 'csv') {
    const { rows: countRows } = await pool.query<{ task_count: string; issue_count: string }>(`
      SELECT
        (SELECT count(*) FROM experience_tasks)::text AS task_count,
        (SELECT count(*) FROM issues WHERE COALESCE(source_type, '') NOT LIKE '%_old')::text AS issue_count
    `);
    const taskCount = Number(countRows[0]?.task_count || 0);
    const issueCount = Number(countRows[0]?.issue_count || 0);
    const taskHeaders = '任务名称,项目单号,品类,产品,型号,项目类型,项目阶段,组织者,状态,创建时间\n';
    const issueHeaders = '问题标题,等级,状态,来源类型,产品型号,整改方案,责任人,创建时间\n';
    await writeSecurityAudit(client, {
      request,
      actor: admin,
      action: 'analysis.export_csv',
      outcome: 'success',
      targetType: 'analysis',
      metadata: {
        taskCount,
        issueCount,
        streamed: true,
      },
    });

    const encoder = new TextEncoder();
    const batchSize = 500;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const write = (value: string) => controller.enqueue(encoder.encode(value));
        try {
          write('\uFEFF# tasks\n');
          write(taskHeaders);
          for (let offset = 0; ; offset += batchSize) {
            const { rows } = await pool.query<DataRow>(`
              SELECT task_name, project_number, product_category, product, product_model, project_type, project_phase, organizer, status, created_at
              FROM experience_tasks
              ORDER BY created_at DESC
              LIMIT $1 OFFSET $2
            `, [batchSize, offset]);
            if (rows.length === 0) break;
            for (const t of rows) {
              write([
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
              ].map(csvEscape).join(',') + '\n');
            }
          }

          write('\n# issues\n');
          write(issueHeaders);
          for (let offset = 0; ; offset += batchSize) {
            const { rows } = await pool.query<DataRow>(`
              SELECT title, level,
                CASE
                  WHEN status IN ('open', '待整改', '待分派', '已分派', '已指派') THEN '待整改'
                  WHEN status IN ('rectifying', 'pending_verification', 'reopened', '整改中', '待验证', '已重开') THEN '整改中'
                  WHEN status IN ('verified_closed', '已验证', '已验证关闭', '已整改', '整改完成') THEN '整改完成'
                  WHEN status IN ('waived', '不整改') THEN '不整改'
                  ELSE '待整改'
                END AS status,
                source_type, product_model, improve_plan, responsible_person, created_at
              FROM issues
              WHERE COALESCE(source_type, '') NOT LIKE '%_old'
              ORDER BY created_at DESC
              LIMIT $1 OFFSET $2
            `, [batchSize, offset]);
            if (rows.length === 0) break;
            for (const i of rows) {
              write([
                i.title,
                i.level,
                i.status,
                i.source_type,
                i.product_model,
                i.improve_plan,
                i.responsible_person,
                i.created_at,
              ].map(csvEscape).join(',') + '\n');
            }
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    finishTimer({ format, taskCount, issueCount });
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="analysis-export.csv"',
        'Cache-Control': 'no-store',
      },
    });
  }

  return NextResponse.json({ code: 1, message: 'Unsupported export format' }, { status: 400 });
}
