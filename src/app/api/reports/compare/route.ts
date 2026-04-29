import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { extractJsonObject, invokeConfiguredAI } from '@/lib/server/ai';

interface CompareResult {
  winner_report_id: string | null;
  satisfaction_a: number;
  satisfaction_b: number;
  headline: string;
  summary: string;
  report_a_advantages: string[];
  report_b_advantages: string[];
  key_differences: string[];
  risks: string[];
  recommendation: string;
}

const emptyResult = (): CompareResult => ({
  winner_report_id: null,
  satisfaction_a: 0,
  satisfaction_b: 0,
  headline: '',
  summary: '',
  report_a_advantages: [],
  report_b_advantages: [],
  key_differences: [],
  risks: [],
  recommendation: '',
});

export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  try {
    const body = await request.json();
    const reportIds = Array.isArray(body.report_ids) ? body.report_ids.slice(0, 2) : [];
    if (reportIds.length !== 2) {
      return NextResponse.json({ code: 1, message: '请选择两份报告进行对比' }, { status: 400 });
    }

    const { data: reports, error } = await client
      .from('reports')
      .select('*')
      .in('id', reportIds);

    if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
    if (!reports || reports.length !== 2) {
      return NextResponse.json({ code: 1, message: '报告不存在或数量不足' }, { status: 404 });
    }

    const orderedReports = reportIds.map((id: string) => reports.find((r: { id: string }) => r.id === id));
    const [reportA, reportB] = orderedReports as Array<Record<string, unknown>>;

    const { data: issuesA } = await client.from('issues').select('*').eq('source_report_id', reportA.id);
    const { data: issuesB } = await client.from('issues').select('*').eq('source_report_id', reportB.id);

    const systemPrompt = `你是产品体验评审专家。请对两份不同体验报告做AI汇总对比，核心指标是产品满意度。

要求：
1. 以产品满意度为核心，分别给A/B报告0-10分。
2. 输出VS总结形式，指出谁更优或是否接近。
3. 对比维度包括任务信息、AI总结、问题点、五感体验、功能效果、整改风险。
4. 仅输出JSON，不要添加解释文字。

JSON格式：
{
  "winner_report_id": "胜出报告id，接近则为null",
  "satisfaction_a": 0-10数字,
  "satisfaction_b": 0-10数字,
  "headline": "一句话VS结论",
  "summary": "2-4句话总体对比",
  "report_a_advantages": ["A优势1", "A优势2"],
  "report_b_advantages": ["B优势1", "B优势2"],
  "key_differences": ["关键差异1", "关键差异2"],
  "risks": ["共同或主要风险1", "风险2"],
  "recommendation": "下一步建议"
}`;

    const rawContent = await invokeConfiguredAI({
      request,
      client,
      defaultModel: 'doubao-seed-2-0-lite',
      defaultTemperature: 0.35,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: `报告A：\n${compactReport(reportA, issuesA || [])}` },
            { type: 'text', text: `报告B：\n${compactReport(reportB, issuesB || [])}` },
          ],
        },
      ],
    });

    const parsed = extractJsonObject<CompareResult>(rawContent, emptyResult());
    const result: CompareResult = {
      winner_report_id: parsed.winner_report_id === reportA.id || parsed.winner_report_id === reportB.id ? parsed.winner_report_id : null,
      satisfaction_a: clampScore(parsed.satisfaction_a),
      satisfaction_b: clampScore(parsed.satisfaction_b),
      headline: String(parsed.headline || ''),
      summary: String(parsed.summary || ''),
      report_a_advantages: normalizeList(parsed.report_a_advantages),
      report_b_advantages: normalizeList(parsed.report_b_advantages),
      key_differences: normalizeList(parsed.key_differences),
      risks: normalizeList(parsed.risks),
      recommendation: String(parsed.recommendation || ''),
    };

    return NextResponse.json({
      code: 0,
      message: '报告对比完成',
      data: {
        result,
        reports: {
          a: pickReportMeta(reportA),
          b: pickReportMeta(reportB),
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '报告对比失败';
    return NextResponse.json({ code: 1, message }, { status: 500 });
  }
}

function compactReport(report: Record<string, unknown>, issues: Array<Record<string, unknown>>) {
  const content = (report.content || {}) as Record<string, unknown>;
  const task = (content.task || {}) as Record<string, unknown>;
  const records = (content.records || []) as Array<Record<string, unknown>>;
  const recipes = (content.recipes || []) as Array<Record<string, unknown>>;
  const summary = (content.ai_summary || {}) as Record<string, unknown>;
  const failed = records.filter((r) => r.evaluation_result === '不合格');
  const recipeProblems = recipes.reduce((sum, recipe) => sum + Number(recipe.problem_count || 0), 0);

  const issueLines = issues.slice(0, 20).map((issue, idx) => `${idx + 1}. ${issue.level || '二类'} ${issue.title || ''} (${issue.status || '待整改'})`).join('\n');
  const recordLines = records.slice(0, 30).map((record, idx) => `${idx + 1}. ${record.check_item || '-'}；${record.evaluation_result || '-'}；${record.problem_description || ''}`).join('\n');
  const recipeLines = recipes.slice(0, 20).map((recipe, idx) => `${idx + 1}. ${recipe.recipe_type || '食谱'}:${recipe.name || '-'}；问题${recipe.problem_count || 0}；效果评分:${recipe.effect_score || '-'}；效果:${recipe.effect_ai_result ? (recipe.effect_ai_result as { summary?: string }).summary : recipe.effect_description || '-'}`).join('\n');

  return [
    `报告ID:${report.id}`,
    `标题:${report.title || '-'}`,
    `型号:${report.product_model || task.product_model || '-'}`,
    `品类/产品:${task.product_category || '-'} / ${task.product || '-'}`,
    `项目:${task.project_type || '-'} ${task.project_phase || ''}`,
    `AI总结:${summary.summary || '-'}；Tag:${summary.tag || '-'}；满意度:${summary.satisfaction_score || '-'}`,
    `五感体验: ${records.length}项，不合格${failed.length}项`,
    recordLines,
    `功能效果: ${recipes.length}项，问题${recipeProblems}项`,
    recipeLines,
    `问题点汇总: ${issues.length}项`,
    issueLines,
  ].filter(Boolean).join('\n');
}

function pickReportMeta(report: Record<string, unknown>) {
  const content = (report.content || {}) as Record<string, unknown>;
  const task = (content.task || {}) as Record<string, unknown>;
  return {
    id: report.id,
    title: report.title,
    product_model: report.product_model || task.product_model || null,
    product_category: task.product_category || null,
    product: task.product || null,
  };
}

function clampScore(score: unknown) {
  const num = typeof score === 'number' ? score : Number(score);
  if (Number.isNaN(num)) return 0;
  return Math.min(10, Math.max(0, Math.round(num * 10) / 10));
}

function normalizeList(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean).slice(0, 6);
  if (typeof value === 'string' && value.trim()) return value.split(/[；;\n]/).map((item) => item.trim()).filter(Boolean).slice(0, 6);
  return [];
}
