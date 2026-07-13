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

export async function loadNextReportSnapshotVersion(
  client: ClientLike,
  reportId: string,
  options: { deleteReportOnFailure?: boolean } = {},
) {
  try {
    const query = client
      .from('report_snapshots')
      .select('version')
      .eq('report_id', reportId)
      .order('version', { ascending: false }) as unknown as {
        limit: (count: number) => Promise<{
          data: Record<string, unknown>[] | null;
          error?: { message?: string } | null;
        }>;
      };
    const { data, error } = await query.limit(1);
    if (error) throw new Error(error.message || 'Failed to resolve report snapshot version');
    return Number(data?.[0]?.version || 0) + 1;
  } catch (error) {
    if (options.deleteReportOnFailure) {
      try {
        const cleanupResult = await (client
          .from('reports')
          .delete()
          .eq('id', reportId) as PromiseLike<{ error?: { message?: string } | null }>);
        if (cleanupResult?.error) throw new Error(cleanupResult.error.message || 'cleanup delete failed');
      } catch (cleanupError) {
        const primaryMessage = error instanceof Error ? error.message : String(error);
        const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
        throw new Error(`${primaryMessage}; cleanup failed: ${cleanupMessage}`);
      }
    }
    throw error instanceof Error ? error : new Error(String(error));
  }
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

export async function loadReportSnapshotWithLegacyErrorFallback(
  client: ClientLike,
  report: ReportSnapshotAnchor,
): Promise<ReportSnapshotResolution> {
  try {
    return await loadAnchoredReportSnapshot(client, report);
  } catch (error) {
    if (report.snapshot_id) throw error;
    return { snapshot: null, resolution: 'none' };
  }
}

export async function persistAnchoredReportSnapshot(
  client: ClientLike,
  reportId: string,
  snapshotRow: Record<string, unknown>,
  options: {
    deleteReportOnFailure?: boolean;
    reportUpdate?: Record<string, unknown>;
  } = {},
) {
  const deleteReportOnFailure = options.deleteReportOnFailure !== false;
  let snapshot: Record<string, unknown> | null = null;
  try {
    const insertResult = await client
      .from('report_snapshots')
      .insert(snapshotRow)
      .select()
      .single();
    snapshot = insertResult.data;
    if (insertResult.error || !snapshot?.id) {
      throw new Error(insertResult.error?.message || 'Report snapshot creation failed');
    }

    const anchorResult = await ((client
      .from('reports')
      .update({
        ...options.reportUpdate,
        snapshot_id: snapshot.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', reportId) as unknown as {
        select: () => {
          single: () => Promise<{
            data: Record<string, unknown> | null;
            error?: { message?: string } | null;
          }>;
        };
      }).select().single());
    if (anchorResult?.error || !anchorResult?.data) {
      throw new Error(
        anchorResult?.error?.message
          || (!anchorResult?.data ? 'Report snapshot anchor update returned no report' : 'Report snapshot anchor update failed'),
      );
    }
    return { snapshot, report: anchorResult.data };
  } catch (error) {
    const primaryMessage = error instanceof Error ? error.message : String(error);
    if (!deleteReportOnFailure) {
      throw error instanceof Error ? error : new Error(primaryMessage);
    }
    try {
      const cleanupResult = await (client
        .from('reports')
        .delete()
        .eq('id', reportId) as PromiseLike<{ error?: { message?: string } | null }>);
      if (cleanupResult?.error) {
        throw new Error(cleanupResult.error.message || 'cleanup delete failed');
      }
    } catch (cleanupError) {
      const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
      throw new Error(`${primaryMessage}; cleanup failed: ${cleanupMessage}`);
    }
    throw error instanceof Error ? error : new Error(primaryMessage);
  }
}

export async function attachLatestSnapshotForComparisonReport<T extends Record<string, unknown>>(
  client: ClientLike,
  report: T,
) {
  if (report.report_type !== 'comparison_report') return report;
  const { snapshot } = await loadAnchoredReportSnapshot(client, report);
  return { ...report, snapshot };
}
