export type ReadinessSeverity = 'critical' | 'warning' | 'info';
export type ReadinessStatus = 'ok' | 'missing' | 'attention';

export interface ReportReadinessMaterial {
  id: string;
  material_type?: string | null;
  file_name?: string | null;
  file_url?: string | null;
  file_size?: number | null;
}

export interface ReportReadinessRecord {
  id: string;
  check_item?: string | null;
  evaluation_result?: string | null;
  problem_description?: string | null;
  materials?: ReportReadinessMaterial[];
}

export interface ReportReadinessRecipeStep {
  id: string;
  step_number?: number | null;
  operation?: string | null;
  problem_point?: string | null;
  problem_points?: Array<{ text?: string; material_ids?: string[] }>;
  materials?: ReportReadinessMaterial[];
}

export interface ReportReadinessRecipe {
  id: string;
  name?: string | null;
  effect_description?: string | null;
  effect_score?: string | null;
  effect_problem_point?: string | null;
  effect_problem_points?: Array<{ text?: string; material_ids?: string[] }>;
  effect_materials?: ReportReadinessMaterial[];
  recipe_steps?: ReportReadinessRecipeStep[];
}

export interface ReportReadinessTask {
  task_name?: string | null;
  product_category?: string | null;
  product_model?: string | null;
  project_type?: string | null;
}

export interface ReportReadinessAiSummary {
  tag?: string | null;
  satisfaction_score?: number | null;
  summary?: string | null;
  strengths?: string[];
  risks?: string[];
  historical_position?: string | null;
  suggestions?: string[];
}

export interface ReportReadinessInput {
  task: ReportReadinessTask;
  records: ReportReadinessRecord[];
  recipes: ReportReadinessRecipe[];
  aiSummary: ReportReadinessAiSummary | null;
}

export interface ReportReadinessItem {
  id: string;
  label: string;
  description: string;
  status: ReadinessStatus;
  severity: ReadinessSeverity;
  count?: number;
}

export interface ReportReadinessResult {
  score: number;
  status: 'ready' | 'attention' | 'blocked';
  items: ReportReadinessItem[];
  stats: {
    records: number;
    failedRecords: number;
    recipes: number;
    steps: number;
    media: number;
  };
}

function hasText(value: string | null | undefined) {
  return Boolean(value && value.trim().length > 0);
}

function hasMaterials(materials: ReportReadinessMaterial[] | null | undefined) {
  return Array.isArray(materials) && materials.length > 0;
}

function isFailingResult(value: string | null | undefined) {
  const text = value?.trim() || '';
  if (!text) return false;
  if (/(不合格|失败|异常|问题|NG|fail)/i.test(text)) return true;
  if (/(合格|通过|OK|pass)/i.test(text)) return false;
  return false;
}

function looksLikeRawJsonProblemText(value: string | null | undefined) {
  const text = value?.trim() || '';
  if (!text) return false;
  return (text.startsWith('[') || text.startsWith('{')) && /"text"|"material_ids"/.test(text);
}

function addItem(
  items: ReportReadinessItem[],
  item: Omit<ReportReadinessItem, 'status'> & { missing: boolean; warningOnly?: boolean },
) {
  items.push({
    id: item.id,
    label: item.label,
    description: item.description,
    severity: item.severity,
    count: item.count,
    status: item.missing ? (item.warningOnly ? 'attention' : 'missing') : 'ok',
  });
}

export function buildReportReadiness(input: ReportReadinessInput): ReportReadinessResult {
  const records = input.records || [];
  const recipes = input.recipes || [];
  const steps = recipes.flatMap((recipe) => recipe.recipe_steps || []);
  const failedRecords = records.filter((record) => isFailingResult(record.evaluation_result));
  const mediaCount =
    records.reduce((sum, record) => sum + (record.materials?.length || 0), 0) +
    recipes.reduce((sum, recipe) => sum + (recipe.effect_materials?.length || 0), 0) +
    steps.reduce((sum, step) => sum + (step.materials?.length || 0), 0);

  const failedRecordsMissingDescription = failedRecords.filter((record) => !hasText(record.problem_description));
  const failedRecordsMissingEvidence = failedRecords.filter((record) => !hasMaterials(record.materials));
  const stepsWithProblemMissingEvidence = steps.filter((step) => {
    const hasProblemText = hasText(step.problem_point) || Boolean(step.problem_points?.some((point) => hasText(point.text)));
    return hasProblemText && !hasMaterials(step.materials);
  });
  const recipesMissingEffectDescription = recipes.filter((recipe) => !hasText(recipe.effect_description));
  const rawJsonProblemTexts =
    recipes.filter((recipe) => looksLikeRawJsonProblemText(recipe.effect_problem_point)).length +
    steps.filter((step) => looksLikeRawJsonProblemText(step.problem_point)).length;

  const items: ReportReadinessItem[] = [];
  const task = input.task;
  const selfDevelopedTypes = ['自研', '改型降本优化', '改型/降本/优化'];
  const productModelRequired = selfDevelopedTypes.includes(task.project_type || '');

  addItem(items, {
    id: 'basic-info',
    label: '基础信息完整',
    description: productModelRequired ? '任务名称、品类和产品型号已填写' : '任务名称和品类已填写',
    severity: 'critical',
    missing: !hasText(task.task_name) || !hasText(task.product_category) || (productModelRequired && !hasText(task.product_model)),
  });
  addItem(items, {
    id: 'records',
    label: '五感体验记录',
    description: records.length > 0 ? `已录入 ${records.length} 条检查记录` : '至少需要录入一条检查记录',
    severity: 'critical',
    missing: records.length === 0,
    count: records.length,
  });
  addItem(items, {
    id: 'record-problem-description',
    label: '不合格记录有问题描述',
    description: failedRecordsMissingDescription.length > 0 ? `${failedRecordsMissingDescription.length} 条不合格记录缺少问题描述` : '不合格记录均有问题描述',
    severity: 'critical',
    missing: failedRecordsMissingDescription.length > 0,
    count: failedRecordsMissingDescription.length,
  });
  addItem(items, {
    id: 'record-evidence',
    label: '不合格记录绑定证据',
    description: failedRecordsMissingEvidence.length > 0 ? `${failedRecordsMissingEvidence.length} 条不合格记录缺少图片/视频证据` : '不合格记录均已绑定证据',
    severity: 'critical',
    missing: failedRecordsMissingEvidence.length > 0,
    count: failedRecordsMissingEvidence.length,
  });
  addItem(items, {
    id: 'recipes',
    label: '功能/食谱内容',
    description: recipes.length > 0 ? `已录入 ${recipes.length} 个功能/食谱` : '未录入功能/食谱，若本次无需评估可忽略',
    severity: 'info',
    missing: false,
    count: recipes.length,
  });
  addItem(items, {
    id: 'recipe-effect-description',
    label: '效果评价描述',
    description: recipesMissingEffectDescription.length > 0 ? `${recipesMissingEffectDescription.length} 个功能/食谱缺少效果描述` : '效果评价描述完整',
    severity: 'warning',
    missing: recipesMissingEffectDescription.length > 0,
    warningOnly: true,
    count: recipesMissingEffectDescription.length,
  });
  addItem(items, {
    id: 'recipe-step-evidence',
    label: '步骤问题绑定证据',
    description: stepsWithProblemMissingEvidence.length > 0 ? `${stepsWithProblemMissingEvidence.length} 个步骤问题缺少图片/视频证据` : '步骤问题均已绑定证据',
    severity: 'warning',
    missing: stepsWithProblemMissingEvidence.length > 0,
    warningOnly: true,
    count: stepsWithProblemMissingEvidence.length,
  });
  addItem(items, {
    id: 'raw-json-problem-points',
    label: '问题点展示格式',
    description: rawJsonProblemTexts > 0 ? `${rawJsonProblemTexts} 处问题点疑似仍是原始 JSON，需要结构化展示` : '问题点文本格式正常',
    severity: 'warning',
    missing: rawJsonProblemTexts > 0,
    warningOnly: true,
    count: rawJsonProblemTexts,
  });
  addItem(items, {
    id: 'ai-summary',
    label: 'AI任务总结',
    description: hasText(input.aiSummary?.summary) ? 'AI总结已生成，可进入报告' : '建议生成 AI总结后再生成报告',
    severity: 'critical',
    missing: !hasText(input.aiSummary?.summary),
  });

  const criticalMissing = items.filter((item) => item.status === 'missing' && item.severity === 'critical').length;
  const warnings = items.filter((item) => item.status !== 'ok' && item.severity === 'warning').length;
  const score = Math.max(0, Math.min(100, 100 - criticalMissing * 16 - warnings * 2));

  return {
    score,
    status: criticalMissing > 0 ? 'blocked' : warnings > 0 ? 'attention' : 'ready',
    items,
    stats: {
      records: records.length,
      failedRecords: failedRecords.length,
      recipes: recipes.length,
      steps: steps.length,
      media: mediaCount,
    },
  };
}
