import type { ClientLike } from './auth';

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

export async function attachLatestSnapshotForComparisonReport<T extends Record<string, unknown>>(
  client: ClientLike,
  report: T,
) {
  if (report.report_type !== 'comparison_report') return report;
  const snapshot = await loadLatestReportSnapshot(client, String(report.id || ''));
  return { ...report, snapshot };
}
