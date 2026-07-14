import { Badge } from '@/components/ui/badge';

type TaskInfo = Record<string, unknown> | null | undefined;

function text(value: unknown) {
  return value === null || value === undefined ? '' : String(value).trim();
}

export function FrozenReportHeaderMeta({
  title,
  productModel,
  taskInfo,
}: {
  title: string;
  productModel?: string | null;
  taskInfo?: TaskInfo;
}) {
  const task = taskInfo ?? {};
  const tags = [
    ['产品品类', text(task.product_category)],
    ['产品名', text(task.product)],
    ['型号', text(task.product_model) || text(productModel)],
    ['项目类型', text(task.project_type)],
    ['阶段', text(task.project_phase)],
  ].filter((item): item is [string, string] => Boolean(item[1]));

  return <div className="min-w-0 flex-1">
    <h1 className="truncate text-sm font-semibold sm:text-base">{title || '报告详情'}</h1>
    {tags.length > 0 && <div className="mt-1 flex flex-wrap items-center gap-1.5">
      {tags.map(([label, value]) => <Badge key={label} variant="outline" className="text-[10px] font-normal">{label}：{value}</Badge>)}
    </div>}
  </div>;
}
