import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canReadReport, forbidden, isAuthResponse, requireUser } from '@/lib/server/auth';
import { loadLatestReportSnapshot } from '@/lib/server/report-snapshots';

type Row = Record<string, unknown>;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;
  if (!(await canReadReport(client, user, id))) return forbidden();

  const { data: report, error } = await client
    .from('reports')
    .select('id, task_id, content, report_type')
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
      const snapshot = await loadLatestReportSnapshot(client, id);
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
    } catch {
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
        materials: stepMatsByRecipe.get(String(step.id ?? '')) || [],
      }));
      return {
        ...recipe,
        recipe_steps: stepsWithMats,
        effect_materials: effectMatsByRecipe.get(String(recipe.id ?? '')) || [],
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
