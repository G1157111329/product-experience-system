import { getSupabaseClient } from '@/storage/database/supabase-client';
import {
  buildFrozenReportViewModel,
  type FrozenMedia,
  type FrozenReportViewModel,
} from '@/lib/report-frozen-view';
import { buildReportDetailModel, type ReportDetailModel } from '@/lib/server/report-detail';
import { loadAnchoredReportSnapshot } from '@/lib/server/report-snapshots';
import { sortMaterialsByBinding } from '@/lib/stable-display-order';
import { manageableIssueIdsForActor, type AuthUser } from '@/lib/server/auth';

type Row = Record<string, unknown>;
type Client = ReturnType<typeof getSupabaseClient>;

async function selectRows(
  query: PromiseLike<{ data: Row[] | null; error?: { message?: string } | null }>,
  message: string,
) {
  const { data, error } = await query;
  if (error) throw new Error(error.message || message);
  return Array.isArray(data) ? data : [];
}

function text(value: unknown) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function toFrozenMedia(materials: Row[]): FrozenMedia[] {
  const seen = new Set<string>();
  return materials.flatMap((material) => {
    const id = text(material.id) || text(material.file_path) || text(material.file_url);
    const url = text(material.file_url) || text(material.file_path) || text(material.url);
    if (!id || !url || seen.has(id)) return [];
    seen.add(id);
    return [{
      id,
      name: text(material.file_name) || text(material.name) || id,
      type: text(material.material_type) || text(material.media_type) || 'material',
      url,
    }];
  });
}

export function linkedMaterialsForTarget(
  materials: Row[], materialLinks: Row[], targetType: string, targetId: string,
) {
  const materialById = new Map(materials.map((material) => [text(material.id), material]));
  return sortMaterialsByBinding(materialLinks
    .filter((link) => text(link.target_type ?? link.targetType) === targetType && text(link.target_id ?? link.targetId) === targetId)
    .map((link, index) => ({
      link,
      id: text(link.material_id ?? link.materialId) || text(link.id) || `link:${index}`,
      bindingOrder: Number(link.binding_order ?? link.bindingOrder),
      linkedAt: text(link.bound_at ?? link.boundAt ?? link.created_at ?? link.createdAt) || null,
    })))
    .flatMap(({ link }) => {
      const material = materialById.get(text(link.material_id ?? link.materialId));
      return material ? [material] : [];
    });
}

async function attachReEvaluations(client: Client, issues: Row[]): Promise<Row[]> {
  const issueIds = issues.map((issue) => text(issue.id)).filter(Boolean);
  if (issueIds.length === 0) return issues;
  const reEvaluations = await selectRows(
    client.from('issue_re_evaluations').select('*').in('issue_id', issueIds).order('created_at', { ascending: false }) as unknown as PromiseLike<{ data: Row[] | null; error?: { message?: string } | null }>,
    'Failed to load issue re-evaluations',
  );
  const reEvaluationIds = reEvaluations.map((item) => text(item.id)).filter(Boolean);
  const reEvaluationMaterials = reEvaluationIds.length
    ? await selectRows(
      client.from('materials').select('*').in('re_evaluation_id', reEvaluationIds) as unknown as PromiseLike<{ data: Row[] | null; error?: { message?: string } | null }>,
      'Failed to load issue re-evaluation materials',
    )
    : [];
  const reEvaluationLinks = reEvaluationIds.length
    ? await selectRows(
      client.from('material_links').select('id, material_id, target_id, binding_order, bound_at, created_at').eq('target_type', 're_evaluation').in('target_id', reEvaluationIds) as unknown as PromiseLike<{ data: Row[] | null; error?: { message?: string } | null }> ,
      'Failed to load issue re-evaluation material links',
    )
    : [];
  const linkedMaterialIds = [...new Set(reEvaluationLinks.map((link) => text(link.material_id)).filter(Boolean))];
  const linkedReEvaluationMaterials = linkedMaterialIds.length
    ? await selectRows(
      client.from('materials').select('*').in('id', linkedMaterialIds) as unknown as PromiseLike<{ data: Row[] | null; error?: { message?: string } | null }> ,
      'Failed to load linked issue re-evaluation materials',
    )
    : [];
  const materialsByReEvaluation = new Map<string, Row[]>();
  for (const material of reEvaluationMaterials) {
    const key = text(material.re_evaluation_id);
    materialsByReEvaluation.set(key, [...(materialsByReEvaluation.get(key) ?? []), material]);
  }
  const creatorIds = [...new Set(reEvaluations.map((item) => text(item.created_by)).filter(Boolean))];
  const creatorNames = creatorIds.length
    ? await selectRows(
      client.from('platform_users').select('id, name, account').in('id', creatorIds) as unknown as PromiseLike<{ data: Row[] | null; error?: { message?: string } | null }>,
      'Failed to load re-evaluation creators',
    )
    : [];
  const creatorNameById = new Map(creatorNames.map((creator) => [text(creator.id), firstCreatorName(creator)]));
  const byIssue = new Map<string, Row[]>();
  for (const item of reEvaluations) {
    const key = text(item.issue_id);
    byIssue.set(key, [...(byIssue.get(key) ?? []), {
      ...item,
      created_by_name: creatorNameById.get(text(item.created_by)) || null,
      materials: [
        ...(materialsByReEvaluation.get(text(item.id)) ?? []),
        ...linkedMaterialsForTarget(linkedReEvaluationMaterials, reEvaluationLinks, 're_evaluation', text(item.id)),
      ],
    }]);
  }
  return issues.map((issue): Row => ({ ...issue, _reEvaluations: byIssue.get(text(issue.id)) ?? [] }));
}

function firstCreatorName(creator: Row) {
  return text(creator.name) || text(creator.account);
}

/**
 * Mutable overlay media is deliberately narrower than original issue evidence:
 * only material rows attached to this live issue qualify, and retest material is
 * supplied by attachReEvaluations as a separate typed record.
 */
export function buildLiveIssueOverlayEvidence(issues: Row[], materials: Row[], materialLinks: Row[] = []) {
  return Object.fromEntries(issues.map((issue) => {
    const issueId = text(issue.id);
    const ownedRectificationMedia = materials.filter((material) => (
      issueId !== ''
      && text(material.issue_id) === issueId
      && text(material.re_evaluation_id) === ''
    ));
    const linkedRectificationMedia = linkedMaterialsForTarget(materials, materialLinks, 'issue', issueId);
    return [issueId, toFrozenMedia([...ownedRectificationMedia, ...linkedRectificationMedia])];
  }));
}

export async function buildFrozenReportResponse(
  client: Client,
  report: Row,
  options: { audience: 'internal' | 'share'; actor?: AuthUser },
): Promise<{
  model: FrozenReportViewModel;
  detailModel: ReportDetailModel;
  snapshot: Row | null;
  issues: Row[];
}> {
  const reportId = text(report.id);
  const taskId = text(report.task_id);
  const [snapshotResult, sourceIssues, taskIssues, materials, pdfJobs, taskInfo] = await Promise.all([
    loadAnchoredReportSnapshot(client, report),
    selectRows(
      client.from('issues').select('*').eq('source_report_id', reportId) as unknown as PromiseLike<{ data: Row[] | null; error?: { message?: string } | null }>,
      'Failed to load report issues',
    ),
    taskId
      ? selectRows(
        client.from('issues').select('*').eq('task_id', taskId) as unknown as PromiseLike<{ data: Row[] | null; error?: { message?: string } | null }>,
        'Failed to load task issues',
      )
      : Promise.resolve([]),
    taskId
      ? selectRows(
        client.from('materials').select('*').eq('task_id', taskId).order('media_display_order', { ascending: true }) as unknown as PromiseLike<{ data: Row[] | null; error?: { message?: string } | null }>,
        'Failed to load report materials',
      )
      : Promise.resolve([]),
    selectRows(
      client.from('pdf_generation_jobs').select('*').eq('report_id', reportId).order('created_at', { ascending: false }) as unknown as PromiseLike<{ data: Row[] | null; error?: { message?: string } | null }>,
      'Failed to load PDF jobs',
    ),
    taskId
      ? (async () => {
        const { data, error } = await client.from('experience_tasks').select('*').eq('id', taskId).maybeSingle();
        if (error) throw new Error(error.message || 'Failed to load report task');
        return data as Row | null;
      })()
      : Promise.resolve(null),
  ]);
  const issueMap = new Map([...sourceIssues, ...taskIssues].map((issue) => [text(issue.id), issue]));
  const issues = await attachReEvaluations(client, Array.from(issueMap.values()));
  const issueIds = issues.map((issue) => text(issue.id)).filter(Boolean);
  const issueMaterialLinks = issueIds.length
    ? await selectRows(
      client.from('material_links').select('id, material_id, target_id, binding_order, bound_at, created_at').eq('target_type', 'issue').in('target_id', issueIds) as unknown as PromiseLike<{ data: Row[] | null; error?: { message?: string } | null }> ,
      'Failed to load issue material links',
    )
    : [];
  const linkedIssueMaterialIds = [...new Set(issueMaterialLinks.map((link) => text(link.material_id)).filter(Boolean))];
  const issueLinkedMaterials = linkedIssueMaterialIds.length
    ? await selectRows(
      client.from('materials').select('*').in('id', linkedIssueMaterialIds) as unknown as PromiseLike<{ data: Row[] | null; error?: { message?: string } | null }> ,
      'Failed to load linked issue materials',
    )
    : [];
  const allMaterials = [...materials, ...issueLinkedMaterials.filter((linked) => !materials.some((material) => text(material.id) === text(linked.id)))];
  const snapshot = snapshotResult.snapshot;
  const detailModel = buildReportDetailModel({ report, snapshot, issues, materials: allMaterials, pdfJobs });
  const manageableIssueIds = options.actor
    ? await manageableIssueIdsForActor(client, options.actor, issues)
    : new Set<string>();
  const model = buildFrozenReportViewModel({
    report,
    taskInfo,
    snapshot,
    snapshotResolution: snapshotResult.resolution,
    issues,
    issueEvidence: buildLiveIssueOverlayEvidence(issues, allMaterials, issueMaterialLinks),
  }, { audience: options.audience, manageableIssueIds });
  return { model, detailModel, snapshot, issues };
}
