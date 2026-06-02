import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getDb } from '@/storage/database/pg-db';
import {
  issues as issuesTable,
  recipeLibrary,
  recipeLibrarySteps,
  reports as reportsTable,
} from '@/storage/database/shared/schema';
import { preserveReviewOverrides, type ReportContentWithReview } from '@/lib/report-review-overrides';

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const task_id = searchParams.get('task_id');
  const created_by = searchParams.get('created_by'); // filter by user's tasks
  const keyword = searchParams.get('keyword')?.trim();

  // Step 1: If created_by filter, get user's task IDs first
  let userTaskIds: string[] = [];
  if (created_by) {
    const { data: userTasks } = await client.from('experience_tasks').select('id').eq('created_by', created_by);
    userTaskIds = (userTasks || []).map((t: { id: string }) => t.id);
  }

  let query = client.from('reports').select('*');
  if (task_id) query = query.eq('task_id', task_id);

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });

  let reports = data || [];

  // If created_by filter, filter reports by user's task IDs
  if (created_by && userTaskIds.length > 0) {
    reports = reports.filter((r: { task_id: string }) => userTaskIds.includes(r.task_id));
  } else if (created_by) {
    reports = []; // user has no tasks
  }

  // Enrich with task info for grouping
  const taskIds = [...new Set(reports.map((r: { task_id: string }) => r.task_id))];
  const { data: tasks } = await client.from('experience_tasks').select('id, task_name, product_category, product, project_type, project_phase, created_by').in('id', taskIds);
  const taskMap: Record<string, Record<string, unknown>> = Object.fromEntries((tasks || []).map((t: Record<string, unknown>) => [t.id as string, t]));

  const enriched = reports.map((r: Record<string, unknown>) => {
    const taskInfo = taskMap[r.task_id as string] || {};
    return {
      ...r,
      task_name: taskInfo.task_name || '',
      product_category: taskInfo.product_category || null,
      product: taskInfo.product || null,
      project_type: taskInfo.project_type || null,
      project_phase: taskInfo.project_phase || null,
      task_created_by: taskInfo.created_by || null,
    };
  });

  const filtered = keyword
    ? enriched.filter((r: Record<string, unknown>) => {
        const haystack = [
          r.title,
          r.product_model,
          r.task_name,
          r.product_category,
          r.product,
          r.project_type,
          ((r.content as Record<string, unknown> | null)?.task as Record<string, unknown> | undefined)?.product_category,
          ((r.content as Record<string, unknown> | null)?.task as Record<string, unknown> | undefined)?.product,
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(keyword.toLowerCase());
      })
    : enriched;

  return NextResponse.json({ code: 0, message: 'success', data: filtered });
}

export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const body = await request.json();
  const { data: previousReport } = await client
    .from('reports')
    .select('content')
    .eq('task_id', body.task_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // 自动生成报告 - 从任务和记录中填充内容
  const { data: task } = await client.from('experience_tasks').select('*').eq('id', body.task_id).single();
  const { data: rawRecords } = await client.from('check_records').select('*').eq('task_id', body.task_id);
  const { data: materials } = await client.from('materials').select('*').eq('task_id', body.task_id);
  const { data: aiSummaryData } = await client
    .from('platform_settings')
    .select('value')
    .eq('key', `ai_sum_${body.task_id}`)
    .maybeSingle();

  // Enrich records with their associated materials
  const recordsWithMaterials = await Promise.all(
    (rawRecords || []).map(async (record: Record<string, unknown>) => {
      const { data: recordMaterials } = await client.from('materials').select('*').eq('record_id', record.id);
      return { ...record, materials: recordMaterials || [] };
    })
  );

  // 查询食谱/功能及其步骤
  const { data: recipes } = await client.from('recipes').select('*').eq('task_id', body.task_id);
  const recipesWithSteps = await Promise.all(
    (recipes || []).map(async (recipe: Record<string, unknown>) => {
      const { data: steps } = await client.from('recipe_steps').select('*').eq('recipe_id', recipe.id).order('step_number', { ascending: true });
      const stepsWithMaterials = await Promise.all(
        (steps || []).map(async (step: Record<string, unknown>) => {
          const { data: stepMaterials } = await client.from('materials').select('*').eq('recipe_step_id', step.id);
          return { ...step, materials: stepMaterials || [] };
        })
      );
      // Fetch effect materials (linked via recipe_id)
      const { data: effectMaterials } = await client.from('materials').select('*').eq('recipe_id', recipe.id);
      return { ...recipe, recipe_steps: stepsWithMaterials, effect_materials: effectMaterials || [] };
    })
  );

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

  const reportContent = {
    task: task,
    ai_summary: aiSummaryData?.value || null,
    records: recordsWithMaterials || [],
    recipes: recipesWithCount || [],
    materials: materials || [],
    generatedAt: new Date().toISOString(),
  };
  const finalReportContent = preserveReviewOverrides(
    previousReport?.content as ReportContentWithReview | null | undefined,
    reportContent,
    { preserve: body.preserve_review_overrides !== false },
  );

  const db = getDb();
  const savedReport = await db.transaction(async (tx) => {
    await tx.delete(reportsTable).where(eq(reportsTable.taskId, body.task_id));
    await tx.delete(issuesTable).where(eq(issuesTable.taskId, body.task_id));

    const [report] = await tx.insert(reportsTable).values({
      taskId: body.task_id,
      templateId: body.template_id || null,
      title: body.title || `${task?.task_name || '体验'}报告`,
      productModel: task?.product_model || null,
      content: finalReportContent,
      status: '已完成',
    }).returning();

    if (!report) {
      throw new Error('报告创建失败');
    }

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
        status: '待整改',
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
            status: '待整改',
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
            status: '待整改',
          });
          createdKeys.add(issueKey);
        }
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
