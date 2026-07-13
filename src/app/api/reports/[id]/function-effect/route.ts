import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canReadReport, forbidden, isAuthResponse, requireUser } from '@/lib/server/auth';
import { loadAnchoredReportSnapshot } from '@/lib/server/report-snapshots';

type Row = Record<string, unknown>;

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function parseProblemPoints(value: unknown): Array<{ text: string; material_ids?: string[] }> {
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (typeof item === 'string') return { text: item.trim() };
        if (!item || typeof item !== 'object') return null;
        const record = item as Row;
        const ids = Array.isArray(record.material_ids)
          ? record.material_ids.filter((id): id is string => typeof id === 'string' && id.trim() !== '')
          : undefined;
        return { text: text(record.text), material_ids: ids };
      })
      .filter((item): item is { text: string; material_ids?: string[] } => Boolean(item?.text));
  } catch {
    return String(value)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => ({ text: line }));
  }
}

function addUniqueMaterial(target: Row[], seen: Set<string>, material: Row | undefined) {
  if (!material) return;
  const key = text(material.id) || text(material.file_path) || text(material.file_url);
  if (!key || seen.has(key)) return;
  seen.add(key);
  target.push(material);
}

function mergeMaterials(...groups: Array<Array<Row | undefined> | undefined>) {
  const seen = new Set<string>();
  const result: Row[] = [];
  for (const group of groups) {
    for (const material of group || []) addUniqueMaterial(result, seen, material);
  }
  return result;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  if (!(await canReadReport(client, user, id))) return forbidden();

  const { data: report, error } = await client
    .from('reports')
    .select('id, task_id, content, report_type, snapshot_id')
    .eq('id', id)
    .single();
  if (error || !report) {
    return NextResponse.json({ code: 1, message: '报告不存在' }, { status: 404 });
  }

  const reportType = String(report.report_type ?? '');
  const content = (report.content ?? null) as Record<string, unknown> | null;
  const recipesFromContent = (content?.recipes ?? []) as Row[];

  // 对比报告 content 可能为 null，需从快照提取食谱
  let recipes = recipesFromContent;
  if (recipes.length === 0 && report.task_id) {
    try {
      const { snapshot } = await loadAnchoredReportSnapshot(client, report);
      const snapshotJson = snapshot?.snapshot_json as Row | undefined;
      if (snapshotJson) {
        // 快照中的 shared_recipe 或 item_nodes 里可能含食谱结构
        const itemNodes = (snapshotJson.item_nodes ?? []) as Row[];
        const cells = (snapshotJson.cells ?? []) as Row[];
        // 从 item_nodes 的 shared_recipe 提取（若有）
        const shared = itemNodes
          .map((n) => n.shared_recipe)
          .filter(Boolean) as Row[];
        if (shared.length > 0) {
          recipes = shared;
        } else if (cells.length > 0) {
          // 无显式食谱，标记为对比矩阵来源（前端展示矩阵评估）
          recipes = [];
        }
      }
    } catch (snapshotError) {
      if (report.snapshot_id) throw snapshotError;
      // 快照加载失败，忽略
    }
  }

  // 普通报告：补充素材关联（effect_materials + 步骤 materials）
  if (report.task_id && recipes.length > 0) {
    const { data: materials } = await client
      .from('materials')
      .select('*')
      .eq('task_id', String(report.task_id));
    const mats = (materials || []) as Row[];
    const materialById = new Map(mats.map((material) => [text(material.id), material]));

    // 按 recipe_id 分组（效果素材）
    const effectMatsByRecipe = new Map<string, Row[]>();
    // 按 recipe_step_id 分组（步骤素材）
    const stepMatsByRecipe = new Map<string, Row[]>();
    for (const mat of mats) {
      const rid = String(mat.recipe_id || '');
      const sid = String(mat.recipe_step_id || '');
      if (rid) {
        if (!effectMatsByRecipe.has(rid)) effectMatsByRecipe.set(rid, []);
        effectMatsByRecipe.get(rid)?.push(mat);
      }
      if (sid) {
        if (!stepMatsByRecipe.has(sid)) stepMatsByRecipe.set(sid, []);
        stepMatsByRecipe.get(sid)?.push(mat);
      }
    }

    recipes = recipes.map((recipe) => {
      const steps = (recipe.recipe_steps ?? []) as Row[];
      const stepsWithMats = steps.map((step) => ({
        ...step,
        materials: mergeMaterials(
          (step.materials ?? []) as Row[],
          stepMatsByRecipe.get(String(step.id ?? '')),
          parseProblemPoints(step.problem_points)
            .flatMap((point) => point.material_ids || [])
            .map((materialId) => materialById.get(materialId)),
        ),
      }));
      const effectPointMaterialIds = parseProblemPoints(recipe.effect_problem_point)
        .flatMap((point) => point.material_ids || []);
      return {
        ...recipe,
        recipe_steps: stepsWithMats,
        effect_materials: mergeMaterials(
          (recipe.effect_materials ?? []) as Row[],
          effectMatsByRecipe.get(String(recipe.id ?? '')),
          effectPointMaterialIds.map((materialId) => materialById.get(materialId)),
        ),
      };
    });
  }

  return NextResponse.json({
    code: 0,
    message: 'success',
    data: {
      recipes,
      reportType,
    },
  });
}
