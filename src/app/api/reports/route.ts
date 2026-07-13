import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getDb } from '@/storage/database/pg-db';
import { canAccessTask, isAuthResponse, requireUser } from '@/lib/server/auth';
import { createApiTimer } from '@/lib/server/api-performance';
import {
  experienceTasks,
  issues as issuesTable,
  recipeLibrary,
  recipeLibrarySteps,
  reportSnapshots,
  reports as reportsTable,
} from '@/storage/database/shared/schema';
import { preserveReviewOverrides, type ReportContentWithReview } from '@/lib/report-review-overrides';
import { buildComparisonReportSnapshot, findAssemblyForTask } from '@/lib/server/comparison-assembly';
import { buildMatrixReadProjection, type MatrixReadProjection } from '@/lib/matrix/projection';
import { getMatrixReadProjection } from '@/lib/matrix/projection-v2';
import { adaptTaskMatrixProjectionForReport } from '@/lib/matrix/report-projection-adapter';
import { getV3MatrixProjection } from '@/lib/matrix/projection-v3';
import {
  hasMeaningfulComparisonCell,
  hasMeaningfulV2Projection,
  hasMeaningfulV3Projection,
} from '@/lib/matrix/meaningful-content';
import {
  freezeV3MatrixForReport,
  isFrozenV3MatrixProjection,
  type ReportV3MatrixProjection,
} from '@/lib/matrix/report-projection-v3-adapter';
import { persistAnchoredReportSnapshot } from '@/lib/server/report-snapshots';

/** Frozen report payload: V2 groups projection or V3 excel-like freeze. */
type ReportDataMatrixProjection = MatrixReadProjection | (ReportV3MatrixProjection & { projectionVersion?: 'v3' });

type LoadedDataMatrix =
  | { kind: 'v3'; matrixId: string; projection: ReportV3MatrixProjection & { projectionVersion: 'v3' } }
  | { kind: 'v2'; matrixId?: string; assemblyId?: string; projection: MatrixReadProjection };

/**
 * Find a data_matrix assembly linked to a task.
 *
 * data-matrix instances link to a task via `source_task_ids` JSONB containing
 * the taskId, with `matrix_role='data_matrix'`. `findAssemblyForTask` does not
 * filter by role, so we explicitly select data_matrix assemblies and JS-filter
 * by source_task_ids.
 */
async function findDataMatrixAssemblyId(client: ReturnType<typeof getSupabaseClient>, taskId: string): Promise<string | null> {
  const { data: assemblies } = await client
    .from('comparison_assemblies')
    .select('id, source_task_ids')
    .eq('matrix_role', 'data_matrix');
  const rows = (assemblies || []) as Array<{ id: string; source_task_ids: unknown }>;
  const match = rows.find((assembly) => Array.isArray(assembly.source_task_ids) && assembly.source_task_ids.includes(taskId));
  return match?.id || null;
}

/**
 * Load task matrix for report freeze. Prefer V3 when current_view_definition_id
 * is set; otherwise keep the existing V2 adapt path.
 */
async function loadTaskMatrixForReport(
  client: ReturnType<typeof getSupabaseClient>,
  taskId: string,
): Promise<LoadedDataMatrix | null> {
  // current_view_definition_id was added outside the generated Supabase
  // schema. Read it through the same native PostgreSQL path used by V3
  // projection APIs so report generation cannot silently fall back to V2.
  const db = await getDb();
  const matrixRows = await db.execute(sql`
    SELECT id, current_view_definition_id
    FROM task_matrices
    WHERE task_id = ${taskId}
      AND status <> 'archived'
    ORDER BY updated_at DESC
  `);
  const candidates = matrixRows.rows as Array<{ id?: string; current_view_definition_id?: string | null }>;
  for (const row of candidates) {
    const matrixId = row.id ? String(row.id) : '';
    if (!matrixId) continue;
    const viewDefinitionId = row.current_view_definition_id ? String(row.current_view_definition_id) : '';

    if (viewDefinitionId) {
      const v3 = await getV3MatrixProjection(matrixId);
      if (!v3) continue;
      const frozen = { projectionVersion: 'v3' as const, ...freezeV3MatrixForReport(v3) };
      if (!hasMeaningfulV3Projection(frozen)) continue;
      return { kind: 'v3', matrixId, projection: frozen };
    }

    const v2Projection = await getMatrixReadProjection(matrixId);
    if (!v2Projection) continue;
    const projection = adaptTaskMatrixProjectionForReport(v2Projection);
    if (!hasMeaningfulV2Projection(projection)) continue;
    return { kind: 'v2', matrixId, projection };
  }
  return null;
}

async function loadDataMatrixProjection(
  client: ReturnType<typeof getSupabaseClient>,
  taskId: string,
): Promise<LoadedDataMatrix | null> {
  try {
    const taskMatrix = await loadTaskMatrixForReport(client, taskId);
    if (taskMatrix) return taskMatrix;
  } catch {
    // fall back to legacy assembly model below
  }

  let assemblyId: string | null = null;
  try {
    assemblyId = await findDataMatrixAssemblyId(client, taskId);
  } catch {
    return null;
  }
  if (!assemblyId) return null;
  try {
    const projection = await buildMatrixReadProjection(client, assemblyId);
    return { kind: 'v2', assemblyId, projection };
  } catch {
    // matrix-load failure must NOT block report generation; logged upstream via null
    return null;
  }
}

/**
 * Read assembly-level fields needed for the frozen snapshot (§11.3 no-drift)
 * that are NOT part of the MatrixReadProjection DTO — specifically
 * `comparability_status` and the schema version id. Returns null on failure.
 */
async function loadDataMatrixAssemblyMeta(client: ReturnType<typeof getSupabaseClient>, assemblyId: string): Promise<{ comparabilityStatus?: string; matrixSchemaVersionId?: string } | null> {
  try {
    const { data: assembly } = await client
      .from('comparison_assemblies')
      .select('comparability_status, matrix_schema_version_id')
      .eq('id', assemblyId)
      .maybeSingle();
    if (!assembly) return null;
    const row = assembly as { comparability_status?: string; matrix_schema_version_id?: string };
    return {
      comparabilityStatus: row.comparability_status ?? undefined,
      matrixSchemaVersionId: row.matrix_schema_version_id ?? undefined,
    };
  } catch {
    return null;
  }
}

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.min(Math.floor(num), max);
}

function countEffectProblemPoints(value: unknown) {
  const text = String(value || '').trim();
  if (!text) return 0;
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return 1;
    return parsed.filter((item: unknown) => {
      if (!item || typeof item !== 'object') return false;
      const point = String((item as Record<string, unknown>).text || '').trim();
      return Boolean(point);
    }).length;
  } catch {
    return 1;
  }
}

function isFailedEvaluationValue(value: unknown) {
  return String(value || '').includes('\u4e0d\u5408\u683c');
}

function groupRowsByField(rows: Array<Record<string, unknown>>, field: string) {
  const grouped = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const key = String(row[field] || '');
    if (!key) continue;
    const bucket = grouped.get(key) || [];
    bucket.push(row);
    grouped.set(key, bucket);
  }
  return grouped;
}

function collectProblemPointMaterialIds(value: unknown): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const materialIds = (item as Record<string, unknown>).material_ids;
      return Array.isArray(materialIds)
        ? materialIds.filter((id): id is string => typeof id === 'string' && id.trim() !== '')
        : [];
    });
  } catch {
    return [];
  }
}

function mergeMaterialsById(
  primary: Array<Record<string, unknown>>,
  materialById: Map<string, Record<string, unknown>>,
  ids: string[],
) {
  const merged = new Map<string, Record<string, unknown>>();
  for (const material of primary) {
    const id = String(material.id || '');
    if (id) merged.set(id, material);
  }
  for (const id of ids) {
    const material = materialById.get(id);
    if (material) merged.set(id, material);
  }
  return Array.from(merged.values());
}

const COMPARISON_MATRIX_NODE_TYPES = ['item', 'condition', 'process_node', 'metric', 'issue_group'];

async function loadTaskComparisonReportSource(client: ReturnType<typeof getSupabaseClient>, taskId: string) {
  const assembly = await findAssemblyForTask(client, taskId);
  if (!assembly?.id) return null;

  const [objectsResult, nodesResult, cellsResult, materialsResult] = await Promise.all([
    client.from('comparison_objects').select('id').eq('assembly_id', assembly.id).limit(1),
    client.from('comparison_item_nodes').select('id,node_type').eq('assembly_id', assembly.id).in('node_type', COMPARISON_MATRIX_NODE_TYPES).limit(1),
    client.from('comparison_matrix_cells').select('*').eq('assembly_id', assembly.id),
    client.from('materials').select('id').eq('comparison_assembly_id', assembly.id).limit(1),
  ]);

  const hasObject = (objectsResult.data || []).length > 0;
  const hasNode = (nodesResult.data || []).length > 0;
  const cells = (cellsResult.data || []) as Array<Record<string, unknown>>;
  const hasCellContent = cells.some(hasMeaningfulComparisonCell);
  const hasCellMedia = (materialsResult.data || []).length > 0;
  if (!hasObject || !hasNode || (!hasCellContent && !hasCellMedia)) return null;

  return { assemblyId: assembly.id };
}

export async function GET(request: NextRequest) {
  const finishTimer = createApiTimer('reports.GET');
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const { searchParams } = new URL(request.url);
  const task_id = searchParams.get('task_id');
  const created_by = searchParams.get('created_by'); // filter by user's tasks
  const scope = searchParams.get('scope') === 'mine' ? 'mine' : 'all';
  const keyword = searchParams.get('keyword')?.trim();
  const includeArchived = searchParams.get('include_archived') === '1';
  const limit = parsePositiveInt(searchParams.get('limit'), 50, 200);
  const offset = Math.max(0, Number(searchParams.get('offset') || '0') || 0);

  // Step 1: If created_by filter, get user's task IDs first
  let userTaskIds: string[] = [];
  const ownerFilter = user.role === 'admin'
    ? created_by || (scope === 'mine' ? user.id : null)
    : scope === 'mine' ? user.id : null;
  if (ownerFilter) {
    const { data: userTasks } = await client.from('experience_tasks').select('id').eq('created_by', ownerFilter);
    userTaskIds = (userTasks || []).map((t: { id: string }) => t.id);
  }

  let keywordTaskIds: string[] = [];
  if (keyword) {
    let taskSearch = client
      .from('experience_tasks')
      .select('id')
      .or(`task_name.ilike.%${keyword}%,product_category.ilike.%${keyword}%,product.ilike.%${keyword}%,project_type.ilike.%${keyword}%`)
      .limit(500);
    if (ownerFilter && userTaskIds.length > 0) taskSearch = taskSearch.in('id', userTaskIds);
    const { data: matchedTasks } = await taskSearch;
    keywordTaskIds = (matchedTasks || []).map((task: { id: string }) => task.id);
  }

  let query = client
    .from('reports')
    .select('id, task_id, template_id, title, status, version, product_model, created_at, updated_at', { count: 'exact' });
  if (!includeArchived) query = query.neq('status', 'archived');
  if (task_id) query = query.eq('task_id', task_id);
  if (ownerFilter && userTaskIds.length > 0) query = query.in('task_id', userTaskIds);
  if (ownerFilter && userTaskIds.length === 0) {
    return NextResponse.json({ code: 0, message: 'success', data: [], meta: { limit, offset, total: 0 } });
  }
  if (keyword) {
    const orParts = [`title.ilike.%${keyword}%`, `product_model.ilike.%${keyword}%`];
    if (keywordTaskIds.length > 0) orParts.push(`task_id.in.(${keywordTaskIds.join(',')})`);
    query = query.or(orParts.join(','));
  }
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query.order('created_at', { ascending: false });
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });

  const reports = data || [];

  // Enrich with task info for grouping
  const taskIds = [...new Set<string>(reports.map((r: Record<string, unknown>) => String(r.task_id || '')).filter(Boolean))];
  const { data: tasks } = taskIds.length > 0
    ? await client.from('experience_tasks').select('id, task_name, product_category, product, product_model, project_type, project_phase, created_by').in('id', taskIds)
    : { data: [] };
  const taskMap: Record<string, Record<string, unknown>> = Object.fromEntries((tasks || []).map((t: Record<string, unknown>) => [t.id as string, t]));

  const { data: records } = taskIds.length > 0
    ? await client.from('check_records').select('id, task_id, evaluation_result').in('task_id', taskIds)
    : { data: [] };
  const { data: recipes } = taskIds.length > 0
    ? await client.from('recipes').select('id, task_id, problem_count, effect_problem_point').in('task_id', taskIds)
    : { data: [] };
  const { data: materials } = taskIds.length > 0
    ? await client.from('materials').select('id, task_id').in('task_id', taskIds)
    : { data: [] };

  const statsByTask = new Map<string, { records: number; failedRecords: number; recipes: number; recipeProblems: number; media: number }>();
  for (const id of taskIds) {
    statsByTask.set(id, { records: 0, failedRecords: 0, recipes: 0, recipeProblems: 0, media: 0 });
  }
  for (const record of records || []) {
    const taskId = String((record as Record<string, unknown>).task_id || '');
    const stats = statsByTask.get(taskId);
    if (!stats) continue;
    stats.records += 1;
    if (isFailedEvaluationValue((record as Record<string, unknown>).evaluation_result)) stats.failedRecords += 1;
  }
  for (const recipe of recipes || []) {
    const row = recipe as Record<string, unknown>;
    const stats = statsByTask.get(String(row.task_id || ''));
    if (!stats) continue;
    stats.recipes += 1;
    stats.recipeProblems += Number(row.problem_count || 0) + countEffectProblemPoints(row.effect_problem_point);
  }
  for (const material of materials || []) {
    const taskId = String((material as Record<string, unknown>).task_id || '');
    const stats = statsByTask.get(taskId);
    if (stats) stats.media += 1;
  }

  const enriched = reports.map((r: Record<string, unknown>) => {
    const taskInfo = taskMap[r.task_id as string] || {};
    return {
      ...r,
      product_model: r.product_model || taskInfo.product_model || null,
      content: null,
      summary_stats: statsByTask.get(String(r.task_id || '')) || { records: 0, failedRecords: 0, recipes: 0, recipeProblems: 0, media: 0 },
      task_name: taskInfo.task_name || '',
      product_category: taskInfo.product_category || null,
      product: taskInfo.product || null,
      project_type: taskInfo.project_type || null,
      project_phase: taskInfo.project_phase || null,
      task_created_by: taskInfo.created_by || null,
    };
  });

  finishTimer({ rows: enriched.length, total: count, limit, offset, keyword: Boolean(keyword), includeArchived });
  return NextResponse.json({
    code: 0,
    message: 'success',
    data: enriched,
    meta: { limit, offset, total: count || 0, has_more: offset + enriched.length < (count || 0) },
  });
}

export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const body = await request.json();
  if (!body.task_id || !(await canAccessTask(client, user, body.task_id))) {
    return NextResponse.json({ code: 1, message: '无权限' }, { status: 403 });
  }

  const { data: previousReports } = await client
    .from('reports')
    .select('id, content, version')
    .eq('task_id', body.task_id)
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
    .limit(20);
  const previousReport = previousReports?.[0];
  const previousReportIds = (previousReports || []).map((report: { id: string }) => report.id).filter(Boolean);
  const nextVersion = Math.max(0, ...(previousReports || []).map((report: { version?: number | null }) => Number(report.version || 0))) + 1;

  // 自动生成报告 - 从任务和记录中填充内容
  const { data: task } = await client.from('experience_tasks').select('*').eq('id', body.task_id).single();
  const comparisonSource = await loadTaskComparisonReportSource(client, body.task_id);
  if (comparisonSource) {
    const snapshot = await buildComparisonReportSnapshot(client, comparisonSource.assemblyId, { snapshotStatus: 'published' }) as Record<string, unknown>;
    const reportTitle = body.title || `${task?.task_name || '体验'}报告`;

    const { data: report, error: reportError } = await client
      .from('reports')
      .insert({
        task_id: body.task_id,
        template_id: body.template_id || null,
        title: reportTitle,
        product_model: task?.product_model || null,
        content: null,
        version: nextVersion,
        status: '已完成',
        report_type: 'comparison_report',
        source_task_ids: snapshot.source_task_ids || [body.task_id],
        source_report_ids: snapshot.source_report_ids || [],
        assembly_id: comparisonSource.assemblyId,
        layout_profile: snapshot.layout_profile || 'comparison_image_matrix_a3_landscape',
        ai_confirmation_status: 'pending',
      })
      .select()
      .single();
    if (reportError || !report) {
      return NextResponse.json({ code: 1, message: reportError?.message || '对比报告创建失败' }, { status: 500 });
    }

    let savedSnapshot: Record<string, unknown>;
    try {
      const persisted = await persistAnchoredReportSnapshot(client, String(report.id), {
        report_id: report.id,
        report_type: 'comparison_report',
        version: 1,
        snapshot_json: snapshot,
        layout_profile: snapshot.layout_profile || 'comparison_image_matrix_a3_landscape',
        created_by: user.id,
      });
      savedSnapshot = persisted.snapshot;
    } catch (snapshotError) {
      return NextResponse.json({
        code: 1,
        message: snapshotError instanceof Error ? snapshotError.message : '对比报告快照创建失败',
      }, { status: 500 });
    }

    if (previousReportIds.length > 0) {
      await client.from('issues').delete().eq('task_id', body.task_id).in('source_report_id', previousReportIds);
    }
    await client
      .from('reports')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('task_id', body.task_id)
      .neq('id', report.id);

    await client
      .from('experience_tasks')
      .update({ status: '\u5df2\u5b8c\u6210', updated_at: new Date().toISOString() })
      .eq('id', body.task_id);

    // ── 对比矩阵问题点纳入问题管理 ──
    // 从 snapshot.cells 提取问题点，复用 recipe_problem 类型，按 conclusionTag 推导等级
    const snapshotCells = (snapshot.cells || []) as Array<Record<string, unknown>>;
    const snapshotNodes = (snapshot.item_nodes || []) as Array<Record<string, unknown>>;
    const snapshotObjects = (snapshot.objects || []) as Array<Record<string, unknown>>;
    const assemblyId = comparisonSource.assemblyId;
    const createdKeys = new Set<string>();
    const matrixIssueRows: Array<typeof issuesTable.$inferInsert> = [];

    const nodeLabel = (nodeId: string) => {
      const node = snapshotNodes.find((n) => String(n.id ?? '') === nodeId);
      return String(node?.node_label ?? node?.name ?? '');
    };
    const objectName = (objId: string) => {
      const obj = snapshotObjects.find((o) => String(o.id ?? '') === objId);
      return String(obj?.object_name ?? obj?.name ?? '');
    };
    // 按 conclusionTag 推导等级：risk→二类，retest/average→三类，其余不创建
    const levelFromTag = (tag: string): string | null => {
      if (tag === 'risk' || tag === 'failed') return '二类';
      if (tag === 'retest' || tag === 'average') return '三类';
      return null;
    };

    for (const cell of snapshotCells) {
      const cellId = String(cell.id ?? '');
      const itemNodeId = String(cell.item_node_id ?? cell.itemNodeId ?? '');
      const objectId = String(cell.object_id ?? cell.objectId ?? '');
      const conclusionTag = String(cell.conclusion_tag ?? '');
      const effectSummary = String(cell.effect_summary ?? '');
      const problemPoints = cell.problem_points;

      // 收集问题文本：problem_points 数组优先，否则用 conclusion_tag=risk 时的 effect_summary
      const problemTexts: string[] = [];
      if (Array.isArray(problemPoints)) {
        for (const pp of problemPoints) {
          const text = typeof pp === 'string' ? pp : String((pp as Record<string, unknown>)?.text ?? '');
          if (text.trim()) problemTexts.push(text.trim());
        }
      }
      // 无显式 problem_points 但标签为 risk/retest，用 effect_summary 作为问题描述
      if (problemTexts.length === 0 && (conclusionTag === 'risk' || conclusionTag === 'retest') && effectSummary.trim()) {
        problemTexts.push(effectSummary.trim());
      }

      const level = levelFromTag(conclusionTag);
      // 有显式 problem_points 的单元格即使标签非 risk 也创建（文本类问题），等级取 level 或默认三类
      const finalLevel = problemTexts.length > 0 ? (level || '三类') : level;
      if (!finalLevel || problemTexts.length === 0) continue;

      const nodeText = nodeLabel(itemNodeId);
      const objText = objectName(objectId);
      for (const ppText of problemTexts) {
        const issueTitle = `[对比]${objText} - ${nodeText}：${ppText}`.substring(0, 200);
        const issueKey = `recipe_problem::${issueTitle}`;
        if (createdKeys.has(issueKey)) continue;

        matrixIssueRows.push({
          taskId: body.task_id,
          title: issueTitle,
          productModel: (task as Record<string, unknown>)?.product_model as string || null,
          level: finalLevel,
          source: `${reportTitle} - 对比矩阵问题`.substring(0, 50),
          sourceReportId: report.id,
          sourceType: 'recipe_problem',
          description: `对象：${objText}\n项目：${nodeText}\n问题：${ppText}`,
          status: 'open',
          sourceAssemblyId: assemblyId,
          sourceCellId: cellId || null,
          sourceItemNodeId: itemNodeId || null,
          sourceObjectId: objectId || null,
        });
        createdKeys.add(issueKey);
      }
    }

    if (matrixIssueRows.length > 0) {
      try {
        const matrixDb = getDb();
        await matrixDb.insert(issuesTable).values(matrixIssueRows).onConflictDoNothing();
      } catch {
        // 矩阵问题点创建失败不应阻断报告生成；UNIQUE 约束冲突已被 onConflictDoNothing 吞掉
      }
    }

    // ── 五感体验不合格项也纳入问题管理（对比报告此前会遗漏 record_fail）──
    const { data: comparisonRecords } = await client.from('check_records').select('*').eq('task_id', body.task_id);
    const sensoryIssueRows: Array<typeof issuesTable.$inferInsert> = [];
    for (const record of (comparisonRecords || []) as Array<Record<string, unknown>>) {
      if (record.evaluation_result !== '不合格') continue;
      const issueTitle = String(record.check_item || '不合格检查项').substring(0, 200);
      const issueKey = `record_fail::${issueTitle}`;
      if (createdKeys.has(issueKey)) continue;
      sensoryIssueRows.push({
        taskId: body.task_id,
        title: issueTitle,
        productModel: (task as Record<string, unknown>)?.product_model as string || null,
        level: '二类',
        source: `${reportTitle} - 不合格检查项`.substring(0, 50),
        sourceReportId: report.id,
        sourceType: 'record_fail',
        description: [record.check_requirement, record.check_standard, record.problem_description].filter(Boolean).join('\n'),
        status: 'open',
        recordId: String(record.id || '') || null,
      });
      createdKeys.add(issueKey);
    }
    if (sensoryIssueRows.length > 0) {
      try {
        const sensoryDb = getDb();
        await sensoryDb.insert(issuesTable).values(sensoryIssueRows).onConflictDoNothing();
      } catch {
        // 同样不阻断报告生成
      }
    }

    const totalNewIssues = matrixIssueRows.length + sensoryIssueRows.length;
    return NextResponse.json({
      code: 0,
      message: totalNewIssues > 0 ? `对比矩阵报告生成成功，已创建 ${totalNewIssues} 个问题点` : '对比矩阵报告生成成功',
      data: { ...report, snapshot_id: savedSnapshot.id },
    });
  }
  const { data: rawRecords } = await client.from('check_records').select('*').eq('task_id', body.task_id);
  const { data: materials } = await client.from('materials').select('*').eq('task_id', body.task_id);
  const { data: aiSummaryData } = await client
    .from('platform_settings')
    .select('value')
    .eq('key', `ai_sum_${body.task_id}`)
    .maybeSingle();

  const allMaterials = (materials || []) as Array<Record<string, unknown>>;
  const materialsByRecordId = groupRowsByField(allMaterials, 'record_id');
  const materialsByRecipeStepId = groupRowsByField(allMaterials, 'recipe_step_id');
  const materialsByRecipeId = groupRowsByField(allMaterials, 'recipe_id');
  const materialById = new Map<string, Record<string, unknown>>();
  for (const material of allMaterials) {
    const id = String(material.id || '');
    if (id) materialById.set(id, material);
  }

  const recordsWithMaterials = ((rawRecords || []) as Array<Record<string, unknown>>).map((record) => ({
    ...record,
    materials: materialsByRecordId.get(String(record.id || '')) || [],
  }));

  // 查询食谱/功能及其步骤
  const { data: recipes } = await client.from('recipes').select('*').eq('task_id', body.task_id);
  const recipeRows = (recipes || []) as Array<Record<string, unknown>>;
  const recipeIds = recipeRows.map((recipe) => String(recipe.id || '')).filter(Boolean);
  const { data: allSteps } = recipeIds.length > 0
    ? await client.from('recipe_steps').select('*').in('recipe_id', recipeIds).order('step_number', { ascending: true })
    : { data: [] };
  const stepsByRecipeId = groupRowsByField((allSteps || []) as Array<Record<string, unknown>>, 'recipe_id');
  const recipesWithSteps = recipeRows.map((recipe) => {
    const steps = stepsByRecipeId.get(String(recipe.id || '')) || [];
    const stepsWithMaterials = steps.map((step) => ({
      ...step,
      materials: materialsByRecipeStepId.get(String(step.id || '')) || [],
    }));
    const effectMaterials = mergeMaterialsById(
      materialsByRecipeId.get(String(recipe.id || '')) || [],
      materialById,
      collectProblemPointMaterialIds(recipe.effect_problem_point),
    );
    return {
      ...recipe,
      recipe_steps: stepsWithMaterials,
      effect_materials: effectMaterials,
    };
  });

  const recipesWithCount = (recipesWithSteps || []).map((recipe: Record<string, unknown>) => {
    const steps = (recipe.recipe_steps || []) as Array<Record<string, unknown>>;
    let computedProblemCount = 0;
    for (const s of steps) {
      const pp = s.problem_points;
      if (Array.isArray(pp) && pp.length > 0) {
        computedProblemCount += pp.filter((p: { text: string }) => p.text && p.text.trim() !== '').length;
      } else if (s.problem_point && String(s.problem_point).trim() !== '') {
        computedProblemCount += 1;
      }
    }
    // Count effect problem points (structured format)
    if (recipe.effect_problem_point && String(recipe.effect_problem_point).trim() !== '') {
      try {
        const parsed = JSON.parse(String(recipe.effect_problem_point));
        if (Array.isArray(parsed)) {
          computedProblemCount += parsed.filter((p: unknown) => typeof p === 'object' && p !== null && typeof (p as Record<string, unknown>).text === 'string' && (p as { text: string }).text.trim()).length;
        } else {
          computedProblemCount += 1; // Old plain text format
        }
      } catch {
        computedProblemCount += 1; // Plain text format
      }
    }
    return { ...recipe, problem_count: computedProblemCount };
  });

  // Sort recipes: if user has manually reordered (sort_order values differ from default 0), use sort_order;
  // otherwise sort by AI effect_score descending
  const hasManualSort = recipesWithCount.some((r: Record<string, unknown>) => {
    const so = r.sort_order as number | null;
    return so !== null && so !== 0;
  });
  if (hasManualSort) {
    recipesWithCount.sort((a: Record<string, unknown>, b: Record<string, unknown>) => ((a.sort_order as number) || 0) - ((b.sort_order as number) || 0));
  } else {
    recipesWithCount.sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
      const scoreA = a.effect_score ? (parseFloat(String(a.effect_score)) || 0) : -1;
      const scoreB = b.effect_score ? (parseFloat(String(b.effect_score)) || 0) : -1;
      return scoreB - scoreA; // descending; unscored recipes (-1) go last
    });
  }

  const completedTaskSnapshot = task
    ? { ...(task as Record<string, unknown>), status: '\u5df2\u5b8c\u6210' }
    : task;

  // ── 数据矩阵投影：若任务关联 data_matrix 组装，读取投影并写入 content（Sub-task A）──
  // 失败不应阻断报告生成，统一降级为 null。V3（有 view definition）写入冻结形状。
  const dataMatrix = await loadDataMatrixProjection(client, body.task_id);
  const dataMatrixProjection: ReportDataMatrixProjection | null = dataMatrix && (
    dataMatrix.kind === 'v3'
      ? hasMeaningfulV3Projection(dataMatrix.projection)
      : hasMeaningfulV2Projection(dataMatrix.projection)
  ) ? dataMatrix.projection : null;

  const reportContent = {
    task: completedTaskSnapshot,
    ai_summary: aiSummaryData?.value || null,
    records: recordsWithMaterials || [],
    recipes: recipesWithCount || [],
    materials: materials || [],
    ...(dataMatrixProjection ? { data_matrix_projection: dataMatrixProjection } : {}),
    generatedAt: new Date().toISOString(),
  };
  const finalReportContent = preserveReviewOverrides(
    previousReport?.content as ReportContentWithReview | null | undefined,
    reportContent,
    { preserve: body.preserve_review_overrides !== false },
  );

  let frozenSnapshotJson: Record<string, unknown> | null = null;
  if (dataMatrixProjection) {
    try {
      let frozenProjection: ReportDataMatrixProjection = dataMatrixProjection;
      if (!(dataMatrix?.kind === 'v3' || isFrozenV3MatrixProjection(dataMatrixProjection))) {
        const fresh = dataMatrix?.kind === 'v2' && dataMatrix.assemblyId
          ? await loadDataMatrixProjection(client, body.task_id)
          : null;
        const freshProjection = (fresh?.kind === 'v2' ? fresh.projection : null) ?? dataMatrixProjection;
        const assemblyId = (fresh?.kind === 'v2' ? fresh.assemblyId : undefined)
          ?? (dataMatrix?.kind === 'v2' ? dataMatrix.assemblyId : undefined);
        const assemblyMeta = assemblyId
          ? await loadDataMatrixAssemblyMeta(client, String(assemblyId))
          : null;
        const freshProjectionMeta = freshProjection as unknown as Record<string, unknown>;
        frozenProjection = {
          ...(freshProjection as MatrixReadProjection),
          comparabilityStatus: assemblyMeta?.comparabilityStatus ?? freshProjectionMeta.comparabilityStatus,
          matrixSchemaVersionId: assemblyMeta?.matrixSchemaVersionId ?? freshProjectionMeta.matrixSchemaVersionId,
        } as MatrixReadProjection;
      }

      frozenSnapshotJson = {
        report_type: 'single_report',
        snapshot_status: 'published',
        generated_at: new Date().toISOString(),
        primary_task_id: body.task_id,
        source_task_ids: [body.task_id],
        matrix_projection: frozenProjection,
      };
    } catch (snapshotError) {
      return NextResponse.json({
        code: 1,
        message: snapshotError instanceof Error ? snapshotError.message : '报告快照创建失败',
      }, { status: 500 });
    }
  }

  const db = getDb();
  const savedReport = await db.transaction(async (tx) => {
    const [report] = await tx.insert(reportsTable).values({
      taskId: body.task_id,
      templateId: body.template_id || null,
      title: body.title || `${task?.task_name || '体验'}报告`,
      productModel: task?.product_model || null,
      content: finalReportContent,
      version: nextVersion,
      status: '已完成',
    }).returning();

    if (!report) {
      throw new Error('报告创建失败');
    }

    if (frozenSnapshotJson) {
      const [snapshot] = await tx.insert(reportSnapshots).values({
        reportId: report.id,
        reportType: 'single_report',
        version: 1,
        snapshotJson: frozenSnapshotJson,
        layoutProfile: 'single_a4_portrait',
        createdBy: user.id,
      }).returning({ id: reportSnapshots.id });
      if (!snapshot?.id) throw new Error('报告快照创建失败');
      await tx.update(reportsTable)
        .set({ snapshotId: snapshot.id, updatedAt: new Date().toISOString() })
        .where(eq(reportsTable.id, report.id));
    }

    await tx.update(reportsTable)
      .set({ status: 'archived', updatedAt: new Date().toISOString() })
      .where(and(
        eq(reportsTable.taskId, body.task_id),
        ne(reportsTable.id, report.id),
      ));

    if (previousReportIds.length > 0) {
      await tx.delete(issuesTable)
        .where(and(
          eq(issuesTable.taskId, body.task_id),
          inArray(issuesTable.sourceReportId, previousReportIds),
        ));
    }

    await tx.update(experienceTasks)
      .set({ status: '\u5df2\u5b8c\u6210', updatedAt: new Date().toISOString() })
      .where(eq(experienceTasks.id, body.task_id));

    const reportTitle = report.title || '报告';
    const records = (recordsWithMaterials || []) as Record<string, unknown>[];
    const recs = (recipesWithCount || []) as Record<string, unknown>[];
    const createdKeys = new Set<string>();
    const sourceText = (value: string) => value.substring(0, 50);
    const issueRows: Array<typeof issuesTable.$inferInsert> = [];

    for (const record of records) {
      if (record.evaluation_result !== '不合格') continue;

      const issueTitle = String(record.check_item || '不合格检查项').substring(0, 200);
      const issueKey = `record_fail::${issueTitle}`;
      if (createdKeys.has(issueKey)) continue;

      issueRows.push({
        taskId: body.task_id,
        title: issueTitle,
        productModel: (task as Record<string, unknown>)?.product_model as string || null,
        level: '二类',
        source: sourceText(`${reportTitle} - 不合格检查项`),
          sourceReportId: report.id,
          sourceType: 'record_fail',
          description: [record.check_requirement, record.check_standard, record.problem_description].filter(Boolean).join('\n'),
          status: 'open',
          recordId: String(record.id || '') || null,
        });
      createdKeys.add(issueKey);
    }

    for (const recipe of recs) {
      for (const step of ((recipe.recipe_steps || []) as Array<Record<string, unknown>>)) {
        const problemPoints: Array<{ text: string }> = [];
        const pp = step.problem_points;
        if (Array.isArray(pp) && pp.length > 0) {
          (pp as Array<{ text: string }>).forEach((p) => {
            if (p.text && p.text.trim()) problemPoints.push({ text: p.text });
          });
        } else if (step.problem_point && String(step.problem_point).trim()) {
          problemPoints.push({ text: String(step.problem_point) });
        }

        for (const ppItem of problemPoints) {
          const issueTitle = ppItem.text.substring(0, 200);
          const issueKey = `recipe_problem::${issueTitle}`;
          if (createdKeys.has(issueKey)) continue;

          issueRows.push({
            taskId: body.task_id,
            title: issueTitle,
            productModel: (task as Record<string, unknown>)?.product_model as string || null,
            level: '二类',
            source: sourceText(`${reportTitle} - 食谱功能问题(${(recipe as Record<string, unknown>).name || ''})`),
            sourceReportId: report.id,
            sourceType: 'recipe_problem',
            description: `步骤${step.step_number}: ${step.operation || ''}`,
            status: 'open',
          });
          createdKeys.add(issueKey);
        }
      }

      if (recipe.effect_problem_point && String(recipe.effect_problem_point).trim()) {
        const effectPPStr = String(recipe.effect_problem_point).trim();
        let effectPPs: string[] = [];
        try {
          const parsed = JSON.parse(effectPPStr);
          if (Array.isArray(parsed)) {
            effectPPs = parsed
              .filter((p: unknown) => typeof p === 'object' && p !== null && typeof (p as Record<string, unknown>).text === 'string')
              .map((p: { text: string }) => p.text.trim())
              .filter((t: string) => t);
          } else {
            effectPPs = [effectPPStr];
          }
        } catch {
          effectPPs = [effectPPStr];
        }

        for (const ppText of effectPPs) {
          const issueTitle = ppText.substring(0, 200);
          const issueKey = `recipe_problem::${issueTitle}`;
          if (createdKeys.has(issueKey)) continue;

          issueRows.push({
            taskId: body.task_id,
            title: issueTitle,
            productModel: (task as Record<string, unknown>)?.product_model as string || null,
            level: '二类',
            source: sourceText(`${reportTitle} - 食谱效果问题(${(recipe as Record<string, unknown>).name || ''})`),
            sourceReportId: report.id,
            sourceType: 'recipe_problem',
            description: '效果/出品效果评价问题',
            status: 'open',
          });
          createdKeys.add(issueKey);
        }
      }
    }

    if (dataMatrixProjection && isFrozenV3MatrixProjection(dataMatrixProjection)) {
      for (const point of dataMatrixProjection.issuePoints || []) {
        const issueTitle = String(point.issueText || '').trim().substring(0, 200);
        if (!issueTitle) continue;
        const issueKey = `matrix_problem::${issueTitle}`;
        if (createdKeys.has(issueKey)) continue;
        const row = dataMatrixProjection.rows.find((item) => item.id === point.leafRowId);
        const hierarchy = row
          ? [row.level1Label, row.level2Label, row.level3Label].filter(Boolean).join(' / ')
          : '';
        issueRows.push({
          taskId: body.task_id,
          title: issueTitle,
          productModel: (task as Record<string, unknown>)?.product_model as string || null,
          level: '二类',
          source: sourceText(`${reportTitle} - 数据矩阵问题`),
          sourceReportId: report.id,
          sourceType: 'matrix_problem',
          description: hierarchy ? `矩阵位置：${hierarchy}` : null,
          status: 'open',
          sourceCellId: point.id,
        });
        createdKeys.add(issueKey);
      }
    }

    if (issueRows.length > 0) {
      await tx.insert(issuesTable).values(issueRows).onConflictDoNothing();
    }

    const taskInfo = task as Record<string, unknown>;
    const taskProductCategory = taskInfo?.product_category as string || null;
    const taskProduct = taskInfo?.product as string || null;
    for (const recipe of recs) {
      const recipeName = (recipe as Record<string, unknown>).name as string;
      if (!recipeName) continue;

      const [libItem] = await tx.insert(recipeLibrary).values({
        name: recipeName,
        productCategory: taskProductCategory,
        product: taskProduct,
        ingredients: (recipe as Record<string, unknown>).ingredients as string || null,
        recipeType: (recipe as Record<string, unknown>).recipe_type as string || '食谱',
      }).onConflictDoNothing({ target: recipeLibrary.name }).returning({ id: recipeLibrary.id });

      if (!libItem) continue;

      const steps = ((recipe as Record<string, unknown>).recipe_steps || []) as Array<Record<string, unknown>>;
      if (steps.length === 0) continue;

      await tx.insert(recipeLibrarySteps).values(steps.map((s, index) => ({
        recipeLibraryId: libItem.id,
        stepNumber: index + 1,
        operation: s.operation as string || '',
        problemPoint: s.problem_point as string || null,
        problemPoints: s.problem_points || [],
      })));
    }

    return report;
  });

  const data = {
    ...savedReport,
    task_id: savedReport.taskId,
    template_id: savedReport.templateId,
    product_model: savedReport.productModel,
    created_at: savedReport.createdAt,
    updated_at: savedReport.updatedAt,
  };

  return NextResponse.json({ code: 0, message: '报告生成成功', data });
}
