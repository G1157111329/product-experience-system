import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const task_id = searchParams.get('task_id');
  const created_by = searchParams.get('created_by'); // filter by user's tasks

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

  return NextResponse.json({ code: 0, message: 'success', data: enriched });
}

export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const body = await request.json();

  // 自动生成报告 - 从任务和记录中填充内容
  const { data: task } = await client.from('experience_tasks').select('*').eq('id', body.task_id).single();
  const { data: rawRecords } = await client.from('check_records').select('*').eq('task_id', body.task_id);
  const { data: materials } = await client.from('materials').select('*').eq('task_id', body.task_id);

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
    // Count effect problem point
    if (recipe.effect_problem_point && String(recipe.effect_problem_point).trim() !== '') {
      computedProblemCount += 1;
    }
    return { ...recipe, problem_count: computedProblemCount };
  });

  const reportContent = {
    task: task,
    records: recordsWithMaterials || [],
    recipes: recipesWithCount || [],
    materials: materials || [],
    generatedAt: new Date().toISOString(),
  };

  // Delete any older reports for the same task FIRST (before creating new one)
  await client.from('reports').delete().eq('task_id', body.task_id);
  // Also delete issues linked to the old reports for this task
  await client.from('issues').delete().eq('task_id', body.task_id);

  // Small delay to ensure deletes are committed before inserts (prevent race conditions)
  await new Promise(resolve => setTimeout(resolve, 200));

  const { data, error } = await client.from('reports').insert({
    task_id: body.task_id,
    template_id: body.template_id || null,
    title: body.title || `${task?.task_name || '体验'}报告`,
    product_model: task?.product_model || null,
    content: reportContent,
    status: '已完成',
  }).select().single();

  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });

    // Create issues from report content (server-side, no race conditions)
    // DB has UNIQUE(title, source_type, task_id) constraint to prevent duplicates
    if (data) {
      const reportId = data.id;
      const reportTitle = data.title || '报告';
      const records = (recordsWithMaterials || []) as Record<string, unknown>[];
      const recs = (recipesWithCount || []) as Record<string, unknown>[];

      // Track created issue keys to prevent duplicates within this creation session
      const createdKeys = new Set<string>();

      // Create issues from failed check records (one issue per unique problem, not per material)
      for (const record of records) {
        if (record.evaluation_result === '不合格') {
          const issueTitle = (record.check_item as string) || '不合格检查项';
          const issueKey = `record_fail::${issueTitle}`;
          if (createdKeys.has(issueKey)) continue;

          const { error: insertError } = await client.from('issues').insert({
            task_id: body.task_id,
            title: issueTitle,
            product_model: (task as Record<string, unknown>)?.product_model || null,
            level: '二类',
            source: `${reportTitle} - 不合格检查项`,
            source_report_id: reportId,
            source_type: 'record_fail',
            description: [record.check_requirement, record.check_standard, record.problem_description].filter(Boolean).join('\n'),
            status: '待整改',
          });
          // If insert fails due to unique constraint, it's a duplicate - skip silently
          if (!insertError) {
            createdKeys.add(issueKey);
          }
        }
      }

      // Create issues from recipe problem points (one issue per unique problem point text, not per material)
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

            const stepDesc = `步骤${step.step_number}: ${step.operation || ''}`;
            const { error: insertError } = await client.from('issues').insert({
              task_id: body.task_id,
              title: issueTitle,
              product_model: (task as Record<string, unknown>)?.product_model || null,
              level: '二类',
              source: `${reportTitle} - 食谱功能问题(${(recipe as Record<string, unknown>).name || ''})`,
              source_report_id: reportId,
              source_type: 'recipe_problem',
              description: stepDesc,
              status: '待整改',
            });
            // If insert fails due to unique constraint, it's a duplicate - skip silently
            if (!insertError) {
              createdKeys.add(issueKey);
            }
          }
        }

        // Create issues from recipe effect problem points
        if (recipe.effect_problem_point && String(recipe.effect_problem_point).trim()) {
          const effectPP = String(recipe.effect_problem_point).trim();
          const issueTitle = effectPP.substring(0, 200);
          const issueKey = `recipe_problem::${issueTitle}`;
          if (!createdKeys.has(issueKey)) {
            const { error: insertError } = await client.from('issues').insert({
              task_id: body.task_id,
              title: issueTitle,
              product_model: (task as Record<string, unknown>)?.product_model || null,
              level: '二类',
              source: `${reportTitle} - 食谱效果问题(${(recipe as Record<string, unknown>).name || ''})`,
              source_report_id: reportId,
              source_type: 'recipe_problem',
              description: '效果/出品效果评价问题',
              status: '待整改',
            });
            if (!insertError) {
              createdKeys.add(issueKey);
            }
          }
        }
      }

    // Save recipes to recipe_library (dedup by name only, regardless of category/product)
    const taskInfo = task as Record<string, unknown>;
    const taskProductCategory = taskInfo?.product_category as string || null;
    const taskProduct = taskInfo?.product as string || null;
    for (const recipe of recs) {
      const recipeName = (recipe as Record<string, unknown>).name as string;
      if (!recipeName) continue;

      // Check if recipe with same name already exists (name-only dedup for auto-save from reports)
      const { data: existingLib } = await client.from('recipe_library').select('id').eq('name', recipeName);

      if (existingLib && existingLib.length > 0) continue; // Skip if already exists

      // Insert into recipe_library
      const { data: libItem } = await client.from('recipe_library').insert({
        name: recipeName,
        product_category: taskProductCategory,
        product: taskProduct,
        ingredients: (recipe as Record<string, unknown>).ingredients as string || null,
        recipe_type: (recipe as Record<string, unknown>).recipe_type as string || '食谱',
      }).select().single();

      // Copy steps to library
      if (libItem) {
        const steps = ((recipe as Record<string, unknown>).recipe_steps || []) as Array<Record<string, unknown>>;
        for (let i = 0; i < steps.length; i++) {
          const s = steps[i];
          await client.from('recipe_library_steps').insert({
            recipe_library_id: libItem.id,
            step_number: i + 1,
            operation: s.operation as string || '',
            problem_point: s.problem_point as string || null,
            problem_points: s.problem_points || [],
          });
        }
      }
    }
  }

  return NextResponse.json({ code: 0, message: '报告生成成功', data });
}
