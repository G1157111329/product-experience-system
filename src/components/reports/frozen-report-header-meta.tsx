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
    <h1 className="break-words text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-3xl">{title || '报告详情'}</h1>
    {tags.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-2">
      {tags.map(([label, value]) => <Badge key={label} variant="outline" className="rounded-full border-border/80 bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground">{label}：{value}</Badge>)}
    </div>}
  </div>;
}
