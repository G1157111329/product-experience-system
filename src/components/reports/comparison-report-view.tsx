'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MediaGallery } from '@/components/app/media-gallery';
import { cn } from '@/lib/utils';

type Row = Record<string, unknown>;

type ComparisonCell = Row & {
  inline_media?: MaterialLike[];
  appendix_media?: MaterialLike[];
};

export interface ComparisonSnapshot {
  report_type?: string;
  snapshot_status?: string;
  layout_profile?: string;
  generated_at?: string;
  media_contract?: {
    max_inline_media?: number;
  };
  assembly?: Row | null;
  objects?: Row[];
  item_nodes?: Row[];
  cells?: ComparisonCell[];
  confirmed_ai_results?: Row[];
}

interface MaterialLike {
  id: string;
  file_url: string;
  file_path?: string;
  file_name: string;
  material_type: string;
}

interface ComparisonReportViewProps {
  snapshot: ComparisonSnapshot;
  title?: string;
  compact?: boolean;
  onPreview?: (url: string) => void;
}

function text(value: unknown, fallback = '-') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function list(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => typeof item === 'string' ? item : JSON.stringify(item)).filter(Boolean);
}

function objectById(rows: Row[] | undefined) {
  return new Map((rows || []).map((row) => [String(row.id || ''), row]));
}

function formatTime(value: unknown) {
  if (!value) return '-';
  try {
    return new Date(String(value)).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return String(value);
  }
}

function cellKey(itemNodeId: unknown, objectId: unknown) {
  return `${String(itemNodeId || '')}::${String(objectId || '')}`;
}

function isMatrixNode(node: Row) {
  return node.node_type !== 'section';
}

function scoreLabel(cell: Row) {
  const manual = text(cell.manual_score, '');
  const ai = text(cell.ai_score, '');
  if (manual) return `人工 ${manual}`;
  if (ai) return `AI ${ai}`;
  return '';
}

function materialArray(value: MaterialLike[] | undefined): MaterialLike[] {
  return Array.isArray(value) ? value : [];
}

function CellBody({
  cell,
  onPreview,
}: {
  cell?: ComparisonCell;
  onPreview?: (url: string) => void;
}) {
  if (!cell) {
    return <span className="text-xs text-muted-foreground">未录入</span>;
  }

  const problems = list(cell.problem_points);
  const processNotes = list(cell.process_notes);
  const inlineMedia = materialArray(cell.inline_media);
  const appendixMedia = materialArray(cell.appendix_media);
  const score = scoreLabel(cell);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {score && <Badge variant="secondary" className="text-[10px]">{score}</Badge>}
        {Boolean(cell.conclusion_tag) && <Badge variant="outline" className="text-[10px]">{text(cell.conclusion_tag)}</Badge>}
        {Boolean(cell.ai_status) && <span className="text-[10px] text-muted-foreground">AI: {text(cell.ai_status)}</span>}
      </div>
      {Boolean(cell.effect_summary) && (
        <p className="whitespace-pre-wrap break-words text-xs leading-5 text-foreground">
          {text(cell.effect_summary)}
        </p>
      )}
      {processNotes.length > 0 && (
        <div className="rounded-md bg-muted/30 p-2">
          <p className="mb-1 text-[10px] font-medium text-muted-foreground">过程记录</p>
          <ul className="space-y-1">
            {processNotes.map((item, index) => (
              <li key={`${item}-${index}`} className="text-[11px] leading-5 text-muted-foreground">
                {index + 1}. {item}
              </li>
            ))}
          </ul>
        </div>
      )}
      {problems.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50/70 p-2">
          <p className="mb-1 text-[10px] font-medium text-amber-800">问题点</p>
          <ul className="space-y-1">
            {problems.map((item, index) => (
              <li key={`${item}-${index}`} className="text-[11px] leading-5 text-amber-900">
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
      <MediaGallery
        materials={inlineMedia}
        responsive
        columns={{ mobile: 3, sm: 5, lg: 5 }}
        size="sm"
        onPreview={onPreview}
      />
      {appendixMedia.length > 0 && (
        <div className="rounded-md border bg-muted/20 p-2">
          <p className="mb-2 text-[10px] text-muted-foreground">附录素材 {appendixMedia.length} 个</p>
          <MediaGallery
            materials={appendixMedia}
            responsive
            columns={{ mobile: 3, sm: 5, lg: 5 }}
            size="sm"
            onPreview={onPreview}
          />
        </div>
      )}
      {!cell.effect_summary && problems.length === 0 && inlineMedia.length === 0 && appendixMedia.length === 0 && (
        <span className="text-xs text-muted-foreground">暂无单元格内容</span>
      )}
    </div>
  );
}

export function ComparisonReportView({
  snapshot,
  title,
  compact = false,
  onPreview,
}: ComparisonReportViewProps) {
  const objects = snapshot.objects || [];
  const itemNodes = (snapshot.item_nodes || []).filter(isMatrixNode);
  const cells = snapshot.cells || [];
  const cellMap = new Map(cells.map((cell) => [cellKey(cell.item_node_id, cell.object_id), cell]));
  const objectMap = objectById(objects);
  const maxInline = snapshot.media_contract?.max_inline_media ?? 5;
  const confirmedAi = snapshot.confirmed_ai_results || [];
  const assembly = snapshot.assembly || {};
  const stats: Array<[string, number]> = [
    ['对比对象', objects.length],
    ['对比节点', itemNodes.length],
    ['单元格', cells.length],
    ['已确认 AI', confirmedAi.length],
  ];

  return (
    <div className={cn('space-y-4', compact && 'space-y-3')}>
      <Card className="border bg-background shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <CardTitle className="break-words text-base lg:text-lg">
                {title || text(assembly.name, '对比报告')}
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {text(assembly.product_category, '未设置品类')} / {text(assembly.product, '未设置产品')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="text-[10px]">comparison_report</Badge>
              <Badge variant="outline" className="text-[10px]">{text(snapshot.layout_profile, 'image_matrix')}</Badge>
              <Badge variant="outline" className="text-[10px]">主体最多 {maxInline}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {Boolean(assembly.comparison_intent) && (
            <div className="rounded-md border bg-muted/20 p-3 text-sm leading-6">
              <p className="mb-1 text-xs font-medium text-muted-foreground">对比目的</p>
              <p className="whitespace-pre-wrap break-words">{text(assembly.comparison_intent)}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {stats.map(([label, value]) => (
              <div key={label} className="rounded-md border bg-muted/20 p-3 text-center">
                <p className="text-xl font-semibold tabular-nums">{value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {objects.map((object, index) => (
              <div key={text(object.id, String(index))} className="rounded-md border p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="break-words text-sm font-medium">{text(object.object_name, `对象 ${index + 1}`)}</p>
                  {Boolean(object.is_competitor) && <Badge variant="outline" className="text-[10px]">竞品</Badge>}
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  {Boolean(object.brand) && <p>品牌：{text(object.brand)}</p>}
                  {Boolean(object.model) && <p>型号：{text(object.model)}</p>}
                  {Boolean(object.specification) && <p>规格：{text(object.specification)}</p>}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">快照生成：{formatTime(snapshot.generated_at)}</p>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border bg-background shadow-sm">
        <CardHeader className="border-b pb-3">
          <CardTitle className="text-sm">对比矩阵</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="sticky left-0 z-[1] min-w-40 border-r bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground">
                    项目
                  </th>
                  {objects.map((object, index) => (
                    <th key={text(object.id, String(index))} className="min-w-64 border-r px-3 py-2 text-xs font-medium">
                      {text(object.object_name, `对象 ${index + 1}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {itemNodes.map((node, rowIndex) => (
                  <tr key={text(node.id, String(rowIndex))} className="border-b align-top">
                    <th className="sticky left-0 z-[1] min-w-40 border-r bg-background px-3 py-3 text-xs font-medium">
                      <div className="space-y-1">
                        <p className="break-words">{text(node.node_label, `节点 ${rowIndex + 1}`)}</p>
                        <p className="text-[10px] text-muted-foreground">{text(node.node_type, 'item')}</p>
                      </div>
                    </th>
                    {objects.map((object, columnIndex) => {
                      const cell = cellMap.get(cellKey(node.id, object.id));
                      const objectName = text(objectMap.get(String(object.id))?.object_name, `对象 ${columnIndex + 1}`);
                      return (
                        <td key={`${text(node.id)}-${text(object.id)}`} className="min-w-64 border-r px-3 py-3 align-top">
                          <div className="mb-2 text-[10px] text-muted-foreground">{objectName}</div>
                          <CellBody cell={cell} onPreview={onPreview} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {itemNodes.length === 0 && (
                  <tr>
                    <td className="px-4 py-8 text-center text-sm text-muted-foreground" colSpan={Math.max(1, objects.length + 1)}>
                      暂无对比节点
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
