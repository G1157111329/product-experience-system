'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, Star } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { PresignedImage, PresignedVideo } from '@/components/presigned-media';
import type { ComparisonSnapshot } from '@/components/reports/comparison-report-view';

type Row = Record<string, unknown>;

export interface MatrixData {
  matrixType: 'multi_matrix' | 'single_waterfall';
  matrix?: ComparisonSnapshot;
  waterfall?: Row[];
  emptyReason?: string;
}

export function ReportMatrixTab({ data }: { data: MatrixData | null }) {
  if (!data) {
    return <div className="p-8 text-center text-sm text-muted-foreground">加载中...</div>;
  }

  if (data.matrixType === 'multi_matrix' && data.matrix) {
    const objects = ((data.matrix as Row).objects || []) as Row[];
    if (objects.length === 0) {
      return (
        <div className="p-8 text-center text-sm text-muted-foreground">
          {data.emptyReason || '暂无对比矩阵数据'}
        </div>
      );
    }
    return <MultiMatrixView matrix={data.matrix} />;
  }

  if (data.matrixType === 'single_waterfall' && data.waterfall) {
    return <WaterfallList recipes={data.waterfall} />;
  }

  return <div className="p-8 text-center text-sm text-muted-foreground">暂无矩阵/功能效果数据</div>;
}

// ── 字段读取助手：snapshot 使用 snake_case 数据库字段 ──
function nodeName(node: Row): string {
  return String(node.node_label ?? node.name ?? node.label ?? '');
}
function objectType(obj: Row): string {
  return String(obj.object_name ?? obj.name ?? '');
}
function objectSubtitle(obj: Row): string {
  const parts = [obj.brand, obj.model, obj.project_stage].filter(Boolean).map(String);
  return parts.join(' / ');
}
function cellConclusion(cell: Row | undefined): string {
  if (!cell) return '';
  const tag = String(cell.conclusion_tag ?? cell.conclusion ?? '');
  if (!tag) return ''; // conclusion_tag 为空时不 fallback 到 effect_summary（避免与 summary 重复）
  const map: Record<string, string> = {
    best: '最佳',
    acceptable: '可接受',
    average: '一般',
    risk: '风险',
    retest: '需复测',
    passed: '达标',
    failed: '不达标',
  };
  return map[tag] || tag;
}
function cellScore(cell: Row | undefined): string {
  if (!cell) return '';
  return String(cell.manual_score ?? cell.ai_score ?? cell.score ?? '');
}
function cellSummary(cell: Row | undefined): string {
  if (!cell) return '';
  return String(cell.effect_summary ?? cell.summary ?? '');
}
function cellProblems(cell: Row | undefined): string[] {
  if (!cell) return [];
  const pp = cell.problem_points;
  if (Array.isArray(pp)) {
    return pp.map((p) => (typeof p === 'string' ? p : String((p as Row)?.text ?? ''))).filter(Boolean);
  }
  return [];
}
function conclusionColor(conclusion: string): string {
  if (['风险', '不达标', 'failed', 'risk'].includes(conclusion)) return 'text-red-600';
  if (['达标', 'passed', '最佳', 'best'].includes(conclusion)) return 'text-emerald-600';
  if (['需复测', 'retest'].includes(conclusion)) return 'text-blue-600';
  return 'text-amber-600';
}

function MultiMatrixView({ matrix }: { matrix: ComparisonSnapshot }) {
  const objects = (matrix.objects || []) as Row[];
  const cells = (matrix.cells || []) as Row[];
  const itemNodes = ((matrix.item_nodes || []) as Row[]).sort(
    (a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0),
  );

  // 构建层级结构：section（大类）→ item（细项）
  const sections = itemNodes.filter((n) => String(n.node_type ?? '') === 'section' || !n.parent_id);
  const sectionSummaryNodes = itemNodes.filter((n) => String(n.node_type ?? '') === 'summary');

  // 每个 section 的子项（排除 summary 节点，避免小结行重复渲染）
  const childrenOf = (parentId: string) => itemNodes.filter(
    (n) => String(n.parent_id ?? '') === parentId && String(n.node_type ?? '') !== 'summary',
  );

  const findCell = (nodeId: string, objId: string) =>
    cells.find(
      (c) =>
        String(c.item_node_id ?? c.itemNodeId ?? '') === nodeId &&
        String(c.object_id ?? c.objectId ?? '') === objId,
    );

  return (
    <div className="space-y-4 p-4">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-[3] min-w-[140px] border-b border-r bg-muted p-2 text-left">维度 / 对象</th>
              {objects.map((obj) => (
                <th
                  key={obj.id as string}
                  className="sticky top-0 z-[2] min-w-[120px] border-b border-r bg-muted p-2 text-center align-bottom"
                >
                  <div className="font-semibold">{objectType(obj)}</div>
                  {objectSubtitle(obj) && (
                    <div className="mt-0.5 text-[10px] font-normal text-muted-foreground">{objectSubtitle(obj)}</div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sections.length === 0 ? (
              // 无 section 结构：直接平铺所有 item_nodes
              itemNodes.map((node) => (
                <MatrixRow
                  key={node.id as string}
                  node={node}
                  objects={objects}
                  findCell={findCell}
                  isSummary={false}
                />
              ))
            ) : (
              // 有 section 结构：按大类分组渲染
              <>
                {sections.map((section) => {
                  const sid = String(section.id);
                  const childNodes = childrenOf(sid);
                  // 大类小结：找 parent_id = section 的 summary 节点，或 section 自带的汇总
                  const summaryNode = sectionSummaryNodes.find((s) => String(s.parent_id ?? '') === sid);
                  return (
                    <SectionGroup
                      key={sid}
                      section={section}
                      objects={objects}
                      findCell={findCell}
                      childNodes={childNodes}
                      summaryNode={summaryNode}
                    />
                  );
                })}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SectionGroup({
  section,
  objects,
  findCell,
  childNodes,
  summaryNode,
}: {
  section: Row;
  objects: Row[];
  findCell: (nodeId: string, objId: string) => Row | undefined;
  childNodes: Row[];
  summaryNode?: Row;
}) {
  // 大类小结汇总：优先用 summary 节点的单元格，否则聚合子项
  return (
    <>
      {/* 大类标题行 */}
      <tr>
        <td colSpan={objects.length + 1} className="border-b border-r bg-muted/70 p-2 text-left font-semibold">
          {nodeName(section)}
        </td>
      </tr>
      {/* 细项行 */}
      {childNodes.map((node) => (
        <MatrixRow key={node.id as string} node={node} objects={objects} findCell={findCell} isSummary={false} />
      ))}
      {/* 大类小结汇总行：优先读 summary 节点的 config.summary_text（用户输入），跨列显示 */}
      {summaryNode && (() => {
        const cfg = summaryNode.config as Record<string, unknown> | null | undefined;
        const summaryText = String(cfg?.summary_text || cfg?.summary || summaryNode.node_label || '');
        return (
          <tr className="bg-amber-50/60">
            <td className="sticky left-0 z-[2] border-b border-r bg-inherit p-2 font-semibold align-top whitespace-nowrap">
              {nodeName(summaryNode) || '小结'}
            </td>
            <td colSpan={objects.length} className="border-b border-r p-2 text-[11px] whitespace-pre-wrap leading-relaxed">
              {summaryText || <span className="text-muted-foreground">—</span>}
            </td>
          </tr>
        );
      })()}
    </>
  );
}

function MatrixRow({
  node,
  objects,
  findCell,
  isSummary,
}: {
  node: Row;
  objects: Row[];
  findCell: (nodeId: string, objId: string) => Row | undefined;
  isSummary: boolean;
}) {
  return (
    <tr className={isSummary ? 'bg-amber-50/60' : ''}>
      <td className={cn('sticky left-0 z-[2] border-b border-r bg-inherit p-2', isSummary ? 'font-semibold' : 'font-medium')}>
        {nodeName(node)}
      </td>
      {objects.map((obj) => {
        const cell = findCell(String(node.id ?? ''), String(obj.id ?? ''));
        return (
          <td key={`${node.id}-${obj.id}`} className="border-b border-r p-2 align-top">
            <MatrixCell cell={cell} />
          </td>
        );
      })}
    </tr>
  );
}

function MatrixCell({ cell }: { cell: Row | undefined }) {
  if (!cell) return <span className="text-muted-foreground">-</span>;
  const conclusion = cellConclusion(cell);
  const score = cellScore(cell);
  const summary = cellSummary(cell);
  const problems = cellProblems(cell);
  // 去重：与 summary 相同的问题文本不重复显示
  const dedupedProblems = problems.filter((p) => p !== summary);
  // 素材：snapshot 的 cell 注入了 inline_media / appendix_media
  const inlineMedia = (cell.inline_media || []) as Row[];
  const appendixMedia = (cell.appendix_media || []) as Row[];
  const allMedia = [...inlineMedia, ...appendixMedia];

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        {conclusion && <span className={cn('font-semibold', conclusionColor(conclusion))}>{conclusion}</span>}
        {score && <span className="text-muted-foreground">{score}分</span>}
      </div>
      {summary && <p className="line-clamp-2 text-[10px] text-muted-foreground">{summary}</p>}
      {dedupedProblems.length > 0 && (
        <ul className="space-y-0.5">
          {dedupedProblems.map((p, i) => (
            <li key={i} className="line-clamp-1 text-[10px] text-red-600">• {p}</li>
          ))}
        </ul>
      )}
      {allMedia.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {allMedia.slice(0, 4).map((m) => (
            <div key={String(m.id)} className="h-12 w-12 overflow-hidden rounded border bg-muted">
              {String(m.material_type || 'image') === 'image' ? (
                <PresignedImage filePath={String(m.file_path || m.file_url || '')} alt={String(m.file_name || '')} className="h-full w-full object-cover" />
              ) : (
                <PresignedVideo filePath={String(m.file_path || m.file_url || '')} className="h-full w-full object-cover" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WaterfallList({ recipes }: { recipes: Row[] }) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-3 p-4">
      {recipes.map((recipe) => {
        const expanded = expandedIds.has(recipe.id as string);
        const steps = (recipe.recipe_steps || recipe.steps || []) as Row[];
        const effectScore = recipe.effect_score || recipe.effectScore;
        return (
          <Card key={recipe.id as string}>
            <CardHeader className="pb-2">
              <button
                type="button"
                onClick={() => toggle(recipe.id as string)}
                className="flex w-full items-center gap-2 text-left"
              >
                {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <span className="text-sm font-semibold">{String(recipe.name || '')}</span>
                {effectScore !== undefined && effectScore !== null && (
                  <Badge className="text-[10px]">
                    <Star className="mr-1 h-3 w-3" />{String(effectScore)}分
                  </Badge>
                )}
              </button>
            </CardHeader>
            {expanded && (
              <CardContent className="space-y-2 pt-0">
                {Boolean(recipe.effect_description || recipe.effectDescription) && (
                  <p className="text-xs text-muted-foreground">
                    {String(recipe.effect_description || recipe.effectDescription)}
                  </p>
                )}
                {steps.map((step, idx) => (
                  <div key={idx} className="rounded border bg-muted/20 p-2 text-xs">
                    <span className="font-medium">
                      步骤{String(step.step_number || idx + 1)}: {String(step.operation || '')}
                    </span>
                    {Boolean(step.problem_point) && (
                      <p className="mt-1 text-amber-600">{String(step.problem_point)}</p>
                    )}
                  </div>
                ))}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
