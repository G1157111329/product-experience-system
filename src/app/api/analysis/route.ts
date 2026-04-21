import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);

  // Filters
  const created_by = searchParams.get('created_by'); // user isolation
  const is_admin = searchParams.get('is_admin') === 'true';
  const product_category = searchParams.get('product_category');
  const project_type = searchParams.get('project_type');
  const organizer = searchParams.get('organizer');
  const issue_source_type = searchParams.get('issue_source_type'); // record_fail/recipe_problem
  const date_from = searchParams.get('date_from'); // YYYY-MM-DD
  const date_to = searchParams.get('date_to'); // YYYY-MM-DD

  // 1. Fetch tasks with filters
  let taskQuery = client.from('experience_tasks').select('id, task_name, product_category, product_model, project_type, project_phase, organizer, status, created_by, created_at');
  if (!is_admin && created_by) taskQuery = taskQuery.eq('created_by', created_by);
  if (product_category) taskQuery = taskQuery.eq('product_category', product_category);
  if (project_type) taskQuery = taskQuery.eq('project_type', project_type);
  if (organizer) taskQuery = taskQuery.eq('organizer', organizer);
  if (date_from) taskQuery = taskQuery.gte('created_at', date_from);
  if (date_to) taskQuery = taskQuery.lte('created_at', date_to + 'T23:59:59');

  const { data: tasks } = await taskQuery;
  const taskList = tasks || [];
  const taskIds = taskList.map(t => t.id);

  // 2. Fetch issues for these tasks
  let issueList: Array<Record<string, unknown>> = [];
  if (taskIds.length > 0) {
    let issueQuery = client.from('issues').select('id, title, level, status, source_type, task_id, product_model, created_at');
    issueQuery = issueQuery.in('task_id', taskIds);
    if (issue_source_type) issueQuery = issueQuery.eq('source_type', issue_source_type);

    const { data: issues } = await issueQuery;
    issueList = (issues || []) as Array<Record<string, unknown>>;
  }

  // 3. Core metrics
  const totalTasks = taskList.length;
  const completedTasks = taskList.filter(t => t.status === '已完成').length;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const totalIssues = issueList.length;
  const rectifiedIssues = issueList.filter(i => (i.status as string) === '已验证').length;
  const rectificationRate = totalIssues > 0 ? Math.round((rectifiedIssues / totalIssues) * 100) : 0;

  // 4. Task status distribution
  const taskStatusDist: Record<string, number> = {};
  for (const t of taskList) {
    taskStatusDist[t.status] = (taskStatusDist[t.status] || 0) + 1;
  }

  // 5. Issue level distribution (一类/二类/三类)
  const issueLevelDist: Record<string, number> = { '一类': 0, '二类': 0, '三类': 0 };
  for (const i of issueList) {
    const level = (i.level as string) || '二类';
    if (issueLevelDist[level] !== undefined) {
      issueLevelDist[level]++;
    } else {
      issueLevelDist[level] = 1;
    }
  }

  // 6. Issue rectification progress: by status × level
  const issueRectificationGrid: Record<string, Record<string, number>> = {};
  const statusOrder = ['待整改', '整改中', '已验证', '不整改'];
  const levelOrder = ['一类', '二类', '三类'];
  for (const s of statusOrder) {
    issueRectificationGrid[s] = {};
    for (const l of levelOrder) {
      issueRectificationGrid[s][l] = 0;
    }
  }
  for (const i of issueList) {
    const status = (i.status as string) || '待整改';
    const level = (i.level as string) || '二类';
    if (!issueRectificationGrid[status]) issueRectificationGrid[status] = {};
    issueRectificationGrid[status][level] = (issueRectificationGrid[status][level] || 0) + 1;
  }

  // 7. By product_category breakdown
  const byCategory: Record<string, { tasks: number; completedTasks: number; issues: number; rectifiedIssues: number }> = {};
  for (const t of taskList) {
    const cat = t.product_category || '未分类';
    if (!byCategory[cat]) byCategory[cat] = { tasks: 0, completedTasks: 0, issues: 0, rectifiedIssues: 0 };
    byCategory[cat].tasks++;
    if (t.status === '已完成') byCategory[cat].completedTasks++;
  }
  // Count issues by task's category
  const taskCategoryMap: Record<string, string> = {};
  for (const t of taskList) taskCategoryMap[t.id] = t.product_category || '未分类';
  for (const i of issueList) {
    const cat = taskCategoryMap[i.task_id as string] || '未分类';
    if (!byCategory[cat]) byCategory[cat] = { tasks: 0, completedTasks: 0, issues: 0, rectifiedIssues: 0 };
    byCategory[cat].issues++;
    if ((i.status as string) === '已验证') byCategory[cat].rectifiedIssues++;
  }

  // 8. By project_type breakdown
  const byProjectType: Record<string, { tasks: number; completedTasks: number; issues: number; rectifiedIssues: number }> = {};
  for (const t of taskList) {
    const pt = t.project_type || '未分类';
    if (!byProjectType[pt]) byProjectType[pt] = { tasks: 0, completedTasks: 0, issues: 0, rectifiedIssues: 0 };
    byProjectType[pt].tasks++;
    if (t.status === '已完成') byProjectType[pt].completedTasks++;
  }
  const taskProjectTypeMap: Record<string, string> = {};
  for (const t of taskList) taskProjectTypeMap[t.id] = t.project_type || '未分类';
  for (const i of issueList) {
    const pt = taskProjectTypeMap[i.task_id as string] || '未分类';
    if (!byProjectType[pt]) byProjectType[pt] = { tasks: 0, completedTasks: 0, issues: 0, rectifiedIssues: 0 };
    byProjectType[pt].issues++;
    if ((i.status as string) === '已验证') byProjectType[pt].rectifiedIssues++;
  }

  // 9. By organizer breakdown
  const byOrganizer: Record<string, { tasks: number; completedTasks: number; issues: number; rectifiedIssues: number }> = {};
  for (const t of taskList) {
    const org = t.organizer || '未指定';
    if (!byOrganizer[org]) byOrganizer[org] = { tasks: 0, completedTasks: 0, issues: 0, rectifiedIssues: 0 };
    byOrganizer[org].tasks++;
    if (t.status === '已完成') byOrganizer[org].completedTasks++;
  }
  const taskOrganizerMap: Record<string, string> = {};
  for (const t of taskList) taskOrganizerMap[t.id] = t.organizer || '未指定';
  for (const i of issueList) {
    const org = taskOrganizerMap[i.task_id as string] || '未指定';
    if (!byOrganizer[org]) byOrganizer[org] = { tasks: 0, completedTasks: 0, issues: 0, rectifiedIssues: 0 };
    byOrganizer[org].issues++;
    if ((i.status as string) === '已验证') byOrganizer[org].rectifiedIssues++;
  }

  // 10. By issue source_type breakdown
  const byIssueType: Record<string, number> = { record_fail: 0, recipe_problem: 0 };
  for (const i of issueList) {
    const st = (i.source_type as string) || 'record_fail';
    byIssueType[st] = (byIssueType[st] || 0) + 1;
  }

  // 11. By month trend (tasks + issues)
  const monthTrend: Record<string, { tasks: number; completedTasks: number; issues: number; rectifiedIssues: number }> = {};
  for (const t of taskList) {
    const month = (t.created_at as string).substring(0, 7); // YYYY-MM
    if (!monthTrend[month]) monthTrend[month] = { tasks: 0, completedTasks: 0, issues: 0, rectifiedIssues: 0 };
    monthTrend[month].tasks++;
    if (t.status === '已完成') monthTrend[month].completedTasks++;
  }
  const taskMonthMap: Record<string, string> = {};
  for (const t of taskList) taskMonthMap[t.id] = (t.created_at as string).substring(0, 7);
  for (const i of issueList) {
    const month = taskMonthMap[i.task_id as string] || 'unknown';
    if (!monthTrend[month]) monthTrend[month] = { tasks: 0, completedTasks: 0, issues: 0, rectifiedIssues: 0 };
    monthTrend[month].issues++;
    if ((i.status as string) === '已验证') monthTrend[month].rectifiedIssues++;
  }

  // 12. Available filter options (for dropdowns)
  const { data: allTasks } = await client.from('experience_tasks').select('product_category, project_type, organizer');
  const categories = [...new Set((allTasks || []).map(t => t.product_category).filter(Boolean))];
  const projectTypes = [...new Set((allTasks || []).map(t => t.project_type).filter(Boolean))];
  const organizers = [...new Set((allTasks || []).map(t => t.organizer).filter(Boolean))];

  return NextResponse.json({
    code: 0,
    message: 'success',
    data: {
      coreMetrics: { totalTasks, completedTasks, completionRate, totalIssues, rectifiedIssues, rectificationRate },
      taskStatusDist,
      issueLevelDist,
      issueRectificationGrid,
      byCategory,
      byProjectType,
      byOrganizer,
      byIssueType,
      monthTrend,
      filterOptions: { categories, projectTypes, organizers },
    },
  });
}

// Export data as CSV (admin only)
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { is_admin, format } = body;
  if (!is_admin) {
    return NextResponse.json({ code: 1, message: '仅管理员可导出数据' }, { status: 403 });
  }

  // Reuse GET logic but return raw data for export
  const client = getSupabaseClient();
  const { data: tasks } = await client.from('experience_tasks').select('*');
  const { data: issues } = await client.from('issues').select('*');

  if (format === 'csv') {
    // Generate CSV for tasks
    const taskHeaders = '任务名称,品类,型号,项目类型,项目阶段,组织者,状态,创建时间\n';
    const taskRows = (tasks || []).map(t =>
      `"${t.task_name}","${t.product_category}","${t.product_model}","${t.project_type || ''}","${t.project_phase || ''}","${t.organizer || ''}","${t.status}","${t.created_at}"`
    ).join('\n');

    const issueHeaders = '问题标题,等级,状态,来源类型,产品型号,整改方案,责任人,创建时间\n';
    const issueRows = (issues || []).map(i =>
      `"${i.title}","${i.level || ''}","${i.status}","${i.source_type || ''}","${i.product_model || ''}","${(i.improve_plan || '').replace(/"/g, '""')}","${i.responsible_person || ''}","${i.created_at}"`
    ).join('\n');

    return NextResponse.json({
      code: 0,
      data: {
        tasksCsv: taskHeaders + taskRows,
        issuesCsv: issueHeaders + issueRows,
      },
    });
  }

  return NextResponse.json({ code: 0, data: { tasks, issues } });
}
