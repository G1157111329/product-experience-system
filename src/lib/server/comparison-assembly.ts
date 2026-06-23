import type { ClientLike } from './auth';

/**
 * V2.3 对比组装服务层
 * 详见 docs/product_experience_platform_technical_plan_v2_3_fused_comparison_group.md §3.1
 *
 * 职责：
 * 1. 创建底层组装对象（comparison_assemblies）
 * 2. 绑定来源任务/报告
 * 3. 初始化对象、节点和单元格
 * 4. 支持事后聚合与型号自动归集
 */

export type AssemblyType =
  | 'task_comparison'      // 多对象对比任务
  | 'post_report_assembly' // 事后报告聚合
  | 'model_auto_group'     // 型号自动归集
  | 'custom_merge';        // 自定义合并

export type AssemblySourceType =
  | 'manual'                  // 手动创建
  | 'excel_import'            // Excel 导入
  | 'report_center_selection' // 报告中心多选
  | 'model_auto_detection';   // 型号自动检测

export type LayoutType = 'image_matrix' | 'metric_table' | 'mixed';

export type AssemblyStatus = 'draft' | 'ready' | 'published' | 'archived';

export interface CreateAssemblyInput {
  name: string;
  assemblyType: AssemblyType;
  sourceType: AssemblySourceType;
  productCategory?: string;
  product?: string;
  comparisonIntent?: string;
  layoutType?: LayoutType;
  createdBy: string;
  sourceTaskIds?: string[];
  sourceReportIds?: string[];
}

export interface AssemblyDTO {
  id: string;
  name: string;
  assemblyType: AssemblyType;
  sourceType: AssemblySourceType;
  productCategory: string | null;
  product: string | null;
  comparisonIntent: string | null;
  layoutType: LayoutType;
  status: AssemblyStatus;
  createdBy: string;
  sourceTaskIds: string[];
  sourceReportIds: string[];
  createdAt: string;
  updatedAt: string;
}

const MAX_INLINE_MEDIA = 5;

type Row = Record<string, unknown>;
type SnapshotQuery = PromiseLike<{ data: Row[] | null; error?: { message?: string } | null }> & {
  eq: (field: string, value: unknown) => SnapshotQuery;
  order: (field: string, options?: { ascending?: boolean }) => SnapshotQuery;
};
type SnapshotSingleQuery = SnapshotQuery & {
  maybeSingle: () => Promise<{ data: Row | null; error?: { message?: string } | null }>;
};
type SnapshotClient = {
  from: (table: string) => {
    select: (fields?: string) => SnapshotSingleQuery;
  };
};

function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item || '')).filter(Boolean)
    : [];
}

function rowId(row: Row) {
  return String(row.id || '');
}

function mediaBuckets(materials: Row[]) {
  const ordered = [...materials].sort((a, b) =>
    Number(a.media_display_order || 0) - Number(b.media_display_order || 0)
  );
  return {
    inline_media: ordered.filter((material, index) => material.media_role !== 'appendix' && index < MAX_INLINE_MEDIA),
    appendix_media: ordered.filter((material, index) => material.media_role === 'appendix' || index >= MAX_INLINE_MEDIA),
  };
}

function groupRows(rows: Row[], field: string) {
  const grouped = new Map<string, Row[]>();
  for (const row of rows) {
    const key = String(row[field] || '');
    if (!key) continue;
    const list = grouped.get(key) || [];
    list.push(row);
    grouped.set(key, list);
  }
  return grouped;
}

function rowToDTO(row: Record<string, unknown>): AssemblyDTO {
  return {
    id: String(row.id),
    name: String(row.name),
    assemblyType: row.assembly_type as AssemblyType,
    sourceType: row.source_type as AssemblySourceType,
    productCategory: (row.product_category as string | null) ?? null,
    product: (row.product as string | null) ?? null,
    comparisonIntent: (row.comparison_intent as string | null) ?? null,
    layoutType: (row.layout_type as LayoutType) ?? 'image_matrix',
    status: (row.status as AssemblyStatus) ?? 'draft',
    createdBy: String(row.created_by ?? ''),
    sourceTaskIds: Array.isArray(row.source_task_ids) ? (row.source_task_ids as string[]) : [],
    sourceReportIds: Array.isArray(row.source_report_ids) ? (row.source_report_ids as string[]) : [],
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

export async function buildComparisonReportSnapshot(
  client: ClientLike,
  assemblyId: string,
  options?: { snapshotStatus?: 'draft' | 'published' }
) {
  const db = client as unknown as SnapshotClient;

  const assemblyResult = await db.from('comparison_assemblies').select('*').eq('id', assemblyId) as { data: Row[] | null };
  const assembly = asRows(assemblyResult.data)[0] || null;
  if (!assembly) {
    throw new Error(`Assembly not found: ${assemblyId}`);
  }

  const [
    objectsResult,
    nodesResult,
    cellsResult,
    materialsResult,
    aiResultsResult,
  ] = await Promise.all([
    db.from('comparison_objects').select('*').eq('assembly_id', assemblyId).order('sort_order', { ascending: true }) as PromiseLike<{ data: Row[] | null }>,
    db.from('comparison_item_nodes').select('*').eq('assembly_id', assemblyId).order('sort_order', { ascending: true }) as PromiseLike<{ data: Row[] | null }>,
    db.from('comparison_matrix_cells').select('*').eq('assembly_id', assemblyId) as PromiseLike<{ data: Row[] | null }>,
    db.from('materials').select('*').eq('comparison_assembly_id', assemblyId).order('media_display_order', { ascending: true }) as PromiseLike<{ data: Row[] | null }>,
    db.from('comparison_ai_results').select('*').eq('assembly_id', assemblyId).eq('status', 'confirmed') as PromiseLike<{ data: Row[] | null }>,
  ]);

  const objects = asRows(objectsResult.data);
  const itemNodes = asRows(nodesResult.data);
  const materials = asRows(materialsResult.data);
  const materialsByCell = groupRows(materials, 'comparison_cell_id');
  const cells = asRows(cellsResult.data).map((cell) => {
    const buckets = mediaBuckets(materialsByCell.get(rowId(cell)) || []);
    return {
      ...cell,
      ...buckets,
    };
  });

  const sourceTaskIds = stringArray(assembly.source_task_ids);
  const objectTaskIds = objects.map((object) => String(object.task_id || '')).filter(Boolean);
  const sourceReportIds = stringArray(assembly.source_report_ids);
  const primaryTaskId = sourceTaskIds[0] || objectTaskIds[0] || '';

  return {
    report_type: 'comparison_report',
    snapshot_status: options?.snapshotStatus || 'draft',
    layout_profile: 'comparison_image_matrix_a3_landscape',
    generated_at: new Date().toISOString(),
    primary_task_id: primaryTaskId,
    source_task_ids: Array.from(new Set([...sourceTaskIds, ...objectTaskIds])),
    source_report_ids: sourceReportIds,
    media_contract: {
      max_inline_media: MAX_INLINE_MEDIA,
      inline_roles: ['cell_primary', 'cell_secondary'],
      appendix_role: 'appendix',
    },
    assembly,
    objects,
    item_nodes: itemNodes,
    cells,
    confirmed_ai_results: asRows(aiResultsResult.data),
  };
}

/**
 * Find the newest assembly already associated with a task.
 *
 * The primary association is comparison_assemblies.source_task_ids. The
 * comparison_objects fallback keeps older/ad-hoc assemblies discoverable when
 * the task was added as an object instead of the assembly source.
 */
export async function findAssemblyForTask(
  client: ClientLike,
  taskId: string
): Promise<AssemblyDTO | null> {
  const { data: assemblies } = await client
    .from('comparison_assemblies')
    .select('*')
    .order('created_at', { ascending: false });

  const assemblyFromSource = Array.isArray(assemblies)
    ? assemblies.find((assembly: Record<string, unknown>) =>
      Array.isArray(assembly.source_task_ids) && assembly.source_task_ids.includes(taskId)
    )
    : null;
  if (assemblyFromSource) return rowToDTO(assemblyFromSource);

  const { data: objectRow } = await client
    .from('comparison_objects')
    .select('assembly_id')
    .eq('task_id', taskId)
    .maybeSingle();
  if (!objectRow?.assembly_id) return null;

  return getAssembly(client, String(objectRow.assembly_id));
}

/**
 * 创建对比组装（通用入口）
 */
export async function createAssembly(
  client: ClientLike,
  input: CreateAssemblyInput
): Promise<AssemblyDTO> {
  const insertRow = {
    name: input.name,
    assembly_type: input.assemblyType,
    source_type: input.sourceType,
    product_category: input.productCategory ?? null,
    product: input.product ?? null,
    comparison_intent: input.comparisonIntent ?? null,
    layout_type: input.layoutType ?? 'image_matrix',
    status: 'draft',
    source_task_ids: input.sourceTaskIds ?? [],
    source_report_ids: input.sourceReportIds ?? [],
    created_by: input.createdBy,
  };
  const { data, error } = await client
    .from('comparison_assemblies')
    .insert(insertRow)
    .select()
    .single();
  if (error || !data) {
    throw new Error(`Failed to create assembly: ${error?.message ?? 'unknown'}`);
  }
  return rowToDTO(data as Record<string, unknown>);
}

/**
 * 从多对象对比任务初始化 assembly（预先规划式）
 * 任务创建时 task_mode = comparison 后调用
 */
export async function createAssemblyFromComparisonTask(
  client: ClientLike,
  taskId: string,
  options?: { name?: string; layoutType?: LayoutType; comparisonIntent?: string }
): Promise<AssemblyDTO> {
  const { data: task } = await client
    .from('experience_tasks')
    .select('id, task_name, product_category, product, created_by, comparison_intent, comparison_layout_type')
    .eq('id', taskId)
    .maybeSingle();
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }
  const layoutType = options?.layoutType ?? (task.comparison_layout_type as LayoutType | null) ?? 'image_matrix';
  const name = options?.name ?? `${task.task_name} - 对比组装`;
  const comparisonIntent = options?.comparisonIntent ?? (task.comparison_intent as string | null) ?? null;
  return createAssembly(client, {
    name,
    assemblyType: 'task_comparison',
    sourceType: 'manual',
    productCategory: typeof task.product_category === 'string' ? task.product_category : undefined,
    product: typeof task.product === 'string' ? task.product : undefined,
    comparisonIntent: comparisonIntent ?? undefined,
    layoutType,
    createdBy: String(task.created_by),
    sourceTaskIds: [taskId],
  });
}

/**
 * 从报告中心多选生成 assembly（事后聚合式 / 自定义合并）
 */
export async function createAssemblyFromReports(
  client: ClientLike,
  reportIds: string[],
  options: {
    name: string;
    createdBy: string;
    assemblyType?: AssemblyType;
    layoutType?: LayoutType;
    comparisonIntent?: string;
  }
): Promise<AssemblyDTO> {
  if (reportIds.length < 2) {
    throw new Error('At least 2 reports required for assembly');
  }
  return createAssembly(client, {
    name: options.name,
    assemblyType: options.assemblyType ?? 'custom_merge',
    sourceType: 'report_center_selection',
    comparisonIntent: options.comparisonIntent,
    layoutType: options.layoutType ?? 'image_matrix',
    createdBy: options.createdBy,
    sourceReportIds: reportIds,
  });
}

/**
 * 从型号报告组生成 assembly（型号自动归集）
 */
export async function createAssemblyFromModelGroup(
  client: ClientLike,
  productModel: string,
  options: { createdBy: string; name?: string }
): Promise<AssemblyDTO> {
  const { data: reports } = await client
    .from('reports')
    .select('id, task_id, product_model')
    .eq('product_model', productModel)
    .order('created_at', { ascending: true });
  const reportIds = (reports ?? []).map((r: Record<string, unknown>) => String(r.id)).filter(Boolean);
  if (reportIds.length < 2) {
    throw new Error(`Model ${productModel} has fewer than 2 reports`);
  }
  return createAssembly(client, {
    name: options.name ?? `${productModel} - 型号合并组装`,
    assemblyType: 'model_auto_group',
    sourceType: 'model_auto_detection',
    layoutType: 'image_matrix',
    createdBy: options.createdBy,
    sourceReportIds: reportIds,
  });
}

/**
 * 更新 assembly 状态
 */
export async function updateAssemblyStatus(
  client: ClientLike,
  id: string,
  status: AssemblyStatus
): Promise<void> {
  await client
    .from('comparison_assemblies')
    .update({ status, updated_at: new Date().toISOString() } as never)
    .eq('id', id);
}

/**
 * 获取 assembly 详情
 */
export async function getAssembly(client: ClientLike, id: string): Promise<AssemblyDTO | null> {
  const { data } = await client
    .from('comparison_assemblies')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  return data ? rowToDTO(data) : null;
}

/**
 * 删除 assembly（仅 draft 状态可删）
 */
export async function deleteAssembly(client: ClientLike, id: string): Promise<void> {
  const { data: assembly } = await client
    .from('comparison_assemblies')
    .select('id, status')
    .eq('id', id)
    .maybeSingle();
  if (!assembly) return;
  if (assembly.status !== 'draft') {
    throw new Error('Only draft assemblies can be deleted');
  }
  await client.from('comparison_assemblies').delete().eq('id', id);
}
