import type { FrozenReportViewModel } from './report-frozen-view';

export type RefreshedFrozenReportProjection = {
  frozenViewModel: FrozenReportViewModel;
  siblingReports: Array<{ id: string }>;
  siblingFrozenViewModels: Record<string, FrozenReportViewModel>;
  mergedReportOrder: string[];
};

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function fetchFrozenReportProjection(
  reportId: string,
  fetcher: Fetcher = fetch,
): Promise<RefreshedFrozenReportProjection> {
  const response = await fetcher(`/api/reports/${encodeURIComponent(reportId)}/detail`);
  const payload = await response.json() as {
    code?: number;
    message?: string;
    data?: Partial<RefreshedFrozenReportProjection>;
  };
  if (!response.ok || payload.code !== 0 || !payload.data?.frozenViewModel) {
    throw new Error(payload.message || '报告问题状态刷新失败');
  }
  return {
    frozenViewModel: payload.data.frozenViewModel,
    siblingReports: payload.data.siblingReports ?? [],
    siblingFrozenViewModels: payload.data.siblingFrozenViewModels ?? {},
    mergedReportOrder: payload.data.mergedReportOrder ?? [],
  };
}
