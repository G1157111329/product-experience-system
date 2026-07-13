import type { ClientLike } from './auth';

type ReportSnapshotAnchor = {
  id?: unknown;
  snapshot_id?: unknown;
};

type ReportSnapshotResolution = {
  snapshot: Record<string, unknown> | null;
  resolution: 'anchored' | 'legacy_latest' | 'none';
};

export async function loadLatestReportSnapshot(client: ClientLike, reportId: string) {
  const query = client
    .from('report_snapshots')
    .select('*')
    .eq('report_id', reportId)
    .order('version', { ascending: false }) as unknown as {
      limit: (count: number) => Promise<{ data: Record<string, unknown>[] | null; error?: { message?: string } | null }>;
    };
  const { data, error } = await query.limit(1);

  if (error) throw new Error(error.message || 'Failed to load report snapshot');
  return Array.isArray(data) ? data[0] || null : null;
}

export async function loadAnchoredReportSnapshot(
  client: ClientLike,
  report: ReportSnapshotAnchor,
): Promise<ReportSnapshotResolution> {
  const reportId = String(report.id || '');
  const snapshotId = String(report.snapshot_id || '');
  if (!snapshotId) {
    const snapshot = await loadLatestReportSnapshot(client, reportId);
    return { snapshot, resolution: snapshot ? 'legacy_latest' : 'none' };
  }

  const query = client
    .from('report_snapshots')
    .select('*')
    .eq('id', snapshotId) as unknown as {
      eq: (field: string, value: unknown) => {
        maybeSingle: () => Promise<{
          data: Record<string, unknown> | null;
          error?: { message?: string } | null;
        }>;
      };
    };
  const { data, error } = await query.eq('report_id', reportId).maybeSingle();
  if (error) throw new Error(error.message || 'Failed to load anchored report snapshot');
  if (!data) {
    throw new Error(
      `Report snapshot integrity error: report ${reportId} references missing or foreign snapshot ${snapshotId}`,
    );
  }
  return { snapshot: data, resolution: 'anchored' };
}

export async function persistAnchoredReportSnapshot(
  client: ClientLike,
  reportId: string,
  snapshotRow: Record<string, unknown>,
) {
  const cleanupReport = async () => {
    await (client.from('reports').delete().eq('id', reportId) as PromiseLike<unknown>);
  };

  const { data: snapshot, error: snapshotError } = await client
    .from('report_snapshots')
    .insert(snapshotRow)
    .select()
    .single();
  if (snapshotError || !snapshot?.id) {
    await cleanupReport();
    throw new Error(snapshotError?.message || 'Report snapshot creation failed');
  }

  const anchorResult = await (client
    .from('reports')
    .update({ snapshot_id: snapshot.id, updated_at: new Date().toISOString() })
    .eq('id', reportId) as PromiseLike<{ error?: { message?: string } | null }>);
  if (anchorResult?.error) {
    await cleanupReport();
    throw new Error(anchorResult.error.message || 'Report snapshot anchor update failed');
  }
  return snapshot;
}

export async function attachLatestSnapshotForComparisonReport<T extends Record<string, unknown>>(
  client: ClientLike,
  report: T,
) {
  if (report.report_type !== 'comparison_report') return report;
  const { snapshot } = await loadAnchoredReportSnapshot(client, report);
  return { ...report, snapshot };
}
