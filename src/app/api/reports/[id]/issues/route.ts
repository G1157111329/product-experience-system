import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canReadReport, forbidden, isAuthResponse, requireUser } from '@/lib/server/auth';
import {
  getIssueHistoryCount,
  getIssueOccurrenceTimeline,
  getRectificationHistory,
} from '@/lib/server/issue-lifecycle';

type Row = Record<string, unknown>;

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function parseProblemPoints(value: unknown): Array<{ text: string; material_ids?: string[] }> {
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => {
          if (typeof item === 'string') return { text: item.trim() };
          if (!item || typeof item !== 'object') return null;
          const record = item as Row;
          const ids = Array.isArray(record.material_ids)
            ? record.material_ids.filter((id): id is string => typeof id === 'string')
            : undefined;
          return { text: text(record.text), material_ids: ids };
        })
        .filter((item): item is { text: string; material_ids?: string[] } => Boolean(item?.text));
    }
    if (typeof parsed === 'string' && parsed.trim()) return [{ text: parsed.trim() }];
  } catch {
    const raw = String(value).trim();
    if (raw) return raw.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => ({ text: line }));
  }
  return [];
}

function addUniqueMaterials(target: Row[], seen: Set<string>, materials: Row[] | undefined) {
  for (const material of materials || []) {
    const id = text(material.id);
    const key = id || JSON.stringify(material);
    if (seen.has(key)) continue;
    seen.add(key);
    target.push(material);
  }
}

function groupBy(rows: Row[], field: string) {
  const grouped = new Map<string, Row[]>();
  for (const row of rows) {
    const key = text(row[field]);
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)?.push(row);
  }
  return grouped;
}

function materialsByIds(ids: string[] | undefined, materialById: Map<string, Row>) {
  return (ids || [])
    .map((id) => materialById.get(id))
    .filter((item): item is Row => Boolean(item));
}

function mergeRecipeMaterials(
  primary: Row[] | undefined,
  fallback: Row[] | undefined,
  ids: string[] | undefined,
  materialById: Map<string, Row>,
) {
  const materials: Row[] = [];
  const seen = new Set<string>();
  addUniqueMaterials(materials, seen, primary);
  addUniqueMaterials(materials, seen, fallback);
  addUniqueMaterials(materials, seen, materialsByIds(ids, materialById));
  return materials;
}

async function attachMaterials(client: ReturnType<typeof getSupabaseClient>, issues: Row[], taskId: string | null, reportContent: Row | null) {
  if (issues.length === 0) return issues;
  const issueIds = issues.map((i) => String(i.id)).filter(Boolean);
  const [{ data: issueMaterials }, taskMaterialsResult, recordsResult] = await Promise.all([
    client
    .from('materials')
    .select('*')
    .in('issue_id', issueIds)
    .order('media_display_order', { ascending: true }),
    taskId
      ? client.from('materials').select('*').eq('task_id', taskId).order('media_display_order', { ascending: true })
      : Promise.resolve({ data: [] }),
    taskId
      ? client.from('check_records').select('*').eq('task_id', taskId)
      : Promise.resolve({ data: [] }),
  ]);

  const allTaskMaterials = (taskMaterialsResult.data || []) as Row[];
  const byIssueId = groupBy((issueMaterials || []) as Row[], 'issue_id');
  const byRecordId = groupBy(allTaskMaterials, 'record_id');
  const byComparisonCellId = groupBy(allTaskMaterials, 'comparison_cell_id');
  const byRecipeStepId = groupBy(allTaskMaterials, 'recipe_step_id');
  const byRecipeId = groupBy(allTaskMaterials, 'recipe_id');
  const materialById = new Map<string, Row>();
  for (const material of allTaskMaterials) {
    const id = text(material.id);
    if (id) materialById.set(id, material);
  }
  const recordRows = (recordsResult.data || []) as Row[];
  const recordsById = new Map(recordRows.map((record) => [text(record.id), record]));
  const recordsByTitle = new Map(recordRows.map((record) => [text(record.check_item), record]));
  const recipes = ((reportContent?.recipes ?? []) as Row[]) || [];

  return issues.map((issue) => {
    const materials: Row[] = [];
    const seen = new Set<string>();
    let recipeContext: Row | null = null;
    addUniqueMaterials(materials, seen, byIssueId.get(text(issue.id)));

    const recordId = text(issue.record_id) || text(recordsByTitle.get(text(issue.title))?.id);
    if (recordId) addUniqueMaterials(materials, seen, byRecordId.get(recordId));
    const recordContext = recordId ? recordsById.get(recordId) || null : null;

    const sourceCellId = text(issue.source_cell_id);
    if (sourceCellId) addUniqueMaterials(materials, seen, byComparisonCellId.get(sourceCellId));

    if (text(issue.source_type) === 'matrix_problem') {
      const projection = reportContent?.data_matrix_projection as Row | undefined;
      const points = Array.isArray(projection?.issuePoints) ? projection.issuePoints as Row[] : [];
      const matchingPoint = points.find((point) => text(point.issueText) === text(issue.title));
      const ids = Array.isArray(matchingPoint?.materialIds)
        ? matchingPoint.materialIds.filter((id): id is string => typeof id === 'string')
        : [];
      addUniqueMaterials(materials, seen, materialsByIds(ids, materialById));
      if (ids.length > 0 && projection?.cellMedia && typeof projection.cellMedia === 'object') {
        const frozenMedia = Object.values(projection.cellMedia as Row)
          .flatMap((value) => Array.isArray(value) ? value : [])
          .filter((material) => material && typeof material === 'object' && ids.includes(text((material as Row).materialId)))
          .map((material) => {
            const frozen = material as Row;
            return {
              id: frozen.materialId,
              material_type: frozen.materialType,
              file_name: frozen.fileName,
              file_url: frozen.fileUrl,
            };
          });
        addUniqueMaterials(materials, seen, frozenMedia);
      }
    }

    if (text(issue.source_type) === 'recipe_problem' && !sourceCellId) {
      const issueTitle = text(issue.title);
      for (const recipe of recipes) {
        const recipeId = text(recipe.id);
        const recipeName = text(recipe.name);
        const source = text(issue.source);
        if (recipeName && source && !source.includes(recipeName)) continue;

        const steps = ((recipe.recipe_steps ?? []) as Row[]) || [];
        const stepsWithMaterials: Row[] = steps.map((step): Row => {
          const points = parseProblemPoints(step.problem_points).length > 0
            ? parseProblemPoints(step.problem_points)
            : parseProblemPoints(step.problem_point);
          const pointMaterialIds = points.flatMap((point) => point.material_ids || []);
          return {
            ...step,
            materials: mergeRecipeMaterials(
              (step.materials ?? []) as Row[],
              byRecipeStepId.get(text(step.id)),
              pointMaterialIds,
              materialById,
            ),
          };
        });
        const effectPoints = parseProblemPoints(recipe.effect_problem_point);
        const recipeForIssue = {
          ...recipe,
          recipe_steps: stepsWithMaterials,
          effect_materials: mergeRecipeMaterials(
            (recipe.effect_materials ?? []) as Row[],
            byRecipeId.get(recipeId),
            effectPoints.flatMap((point) => point.material_ids || []),
            materialById,
          ),
        };

        for (const step of stepsWithMaterials) {
          const points = parseProblemPoints(step.problem_points).length > 0
            ? parseProblemPoints(step.problem_points)
            : parseProblemPoints(step.problem_point);
          for (const point of points) {
            if (point.text !== issueTitle) continue;
            addUniqueMaterials(materials, seen, (step.materials ?? []) as Row[]);
            addUniqueMaterials(materials, seen, point.material_ids?.map((id) => materialById.get(id)).filter((item): item is Row => Boolean(item)));
            recipeContext = recipeForIssue;
          }
        }

        for (const point of effectPoints) {
          if (point.text !== issueTitle) continue;
          addUniqueMaterials(materials, seen, (recipeForIssue.effect_materials ?? []) as Row[]);
          addUniqueMaterials(materials, seen, point.material_ids?.map((id) => materialById.get(id)).filter((item): item is Row => Boolean(item)));
          recipeContext = recipeForIssue;
        }
      }
    }

    return {
      ...issue,
      materials,
      recordContext: recordContext ? { ...recordContext, materials: byRecordId.get(recordId) || [] } : null,
      recipeContext,
    };
  });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  if (!(await canReadReport(client, user, id))) return forbidden();

  const { data: report, error } = await client.from('reports').select('id, task_id, content').eq('id', id).single();
  if (error || !report) {
    return NextResponse.json({ code: 1, message: '报告不存在' }, { status: 404 });
  }

  const taskId = report.task_id ? String(report.task_id) : null;
  const sourceIssuesQuery = client.from('issues').select('*').eq('source_report_id', id);
  const taskIssuesQuery = taskId ? client.from('issues').select('*').eq('task_id', taskId) : null;

  const [{ data: sourceIssues }, taskIssuesResult] = await Promise.all([
    sourceIssuesQuery,
    taskIssuesQuery ? taskIssuesQuery : Promise.resolve({ data: [] }),
  ]);

  const issueMap = new Map<string, Row>();
  for (const issue of [...(sourceIssues || []), ...(taskIssuesResult?.data || [])]) {
    const key = String(issue.id);
    if (!issueMap.has(key)) issueMap.set(key, issue);
  }
  let issues = Array.from(issueMap.values());
  issues = await attachMaterials(client, issues, taskId, (report.content ?? null) as Row | null);

  const enriched = await Promise.all(
    issues.map(async (issue) => {
      const issueId = String(issue.id);
      const title = String(issue.title || '');
      const productModel = String(issue.product_model || '');
      const [timeline, history, historyCount, reEvals] = await Promise.all([
        getIssueOccurrenceTimeline(client, issueId),
        getRectificationHistory(client, issueId),
        productModel ? getIssueHistoryCount(client, title, productModel, issueId) : Promise.resolve(0),
        // 复测记录（按时间倒序，最新在前）
        client.from('issue_re_evaluations').select('*').eq('issue_id', issueId).order('created_at', { ascending: false }),
      ]);
      const reEvalRows = ((reEvals as { data?: unknown[] }).data || []) as Array<Record<string, unknown>>;
      const reEvalIds = reEvalRows.map((row) => text(row.id)).filter(Boolean);
      const { data: reEvalMaterials } = reEvalIds.length > 0
        ? await client.from('materials').select('*').in('re_evaluation_id', reEvalIds).order('media_display_order', { ascending: true })
        : { data: [] };
      const materialsByReEvalId = groupBy((reEvalMaterials || []) as Row[], 're_evaluation_id');
      const reEvalRowsWithMaterials = reEvalRows.map((row) => ({
        ...row,
        materials: materialsByReEvalId.get(text(row.id)) || [],
      }));
      return {
        ...issue,
        occurrenceCount: timeline.length,
        occurrenceTimeline: timeline,
        rectificationHistory: history,
        historyCount,
        reEvaluationCount: reEvalRowsWithMaterials.length,
        latestReEvaluation: reEvalRowsWithMaterials[0] || null,
      };
    }),
  );

  return NextResponse.json({ code: 0, message: 'success', data: enriched });
}
