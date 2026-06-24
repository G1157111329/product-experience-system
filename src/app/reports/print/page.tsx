'use client';

import { Suspense, useEffect, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { ReportPrintSectionBlocks } from '@/components/reports/report-section-block-renderer';
import { buildDisplayReportContent, type AiSummaryLike, type ReportContentWithReview, type ReportReviewOverrides } from '@/lib/report-review-overrides';
import { mapWithConcurrency, normalizePrintMode, uniqueUrls, type PrintMode } from '@/lib/print-assets';
import type { ReportDetailModel } from '@/lib/server/report-detail';
import {
  getReportMergeModel,
  isMergeableReportProjectType,
  normalizeReportProjectType,
  sortReportsByCreatedAtAsc,
} from '@/lib/report-merge';

interface Material {
  id: string; material_type: string; file_name: string; file_url: string; file_size: number; file_path?: string;
}

interface ProblemPoint { text: string; material_ids?: string[]; }
interface ReEvaluation { id: string; description: string | null; ai_result: Record<string, unknown> | null; created_at: string; materials?: Material[]; }
interface RecipeStep {
  id: string; step_number: number; operation: string; problem_point: string | null;
  problem_points?: ProblemPoint[];
  materials?: Material[];
}

interface Recipe {
  id: string; name: string; ingredients: string | null; recipe_type: string;
  problem_count: number; recipe_steps: RecipeStep[];
  effect_description?: string | null; effect_score?: string | null; effect_problem_point?: string | null;
  effect_ai_result?: { score: number; summary: string } | null;
  effect_materials?: Material[];
}

interface CheckRecord {
  id: string; sensory_dimension?: string; check_dimension?: string; sub_check_dimension?: string;
  check_item: string; check_requirement?: string; check_standard?: string;
  evaluation_result: string; problem_description?: string;
  materials?: Material[];
  [key: string]: unknown;
}

interface IssueItem {
  id: string; title: string; description: string | null; level: string | null;
  status: string; source_report_id: string | null; source_type: string | null;
  category?: string; improve_plan?: string; responsible_person?: string;
  plan_complete_date?: string; verification_note?: string;
  [key: string]: unknown;
}

interface ReportContent {
  task: Record<string, unknown>;
  ai_summary?: AiTaskSummary | null;
  records: CheckRecord[];
  issues: Array<Record<string, unknown>>;
  recipes: Recipe[];
  materials: Material[];
  generatedAt: string;
  review_overrides?: ReportReviewOverrides;
}

interface AiTaskSummary {
  tag?: string;
  satisfaction_score?: number;
  summary?: string;
  strengths?: string[];
  risks?: string[];
  historical_position?: string;
  suggestions?: string[];
}

interface ReportData {
  id: string; title: string; product_model: string | null; status: string; version: number;
  task_id: string; created_at: string;
  content: ReportContent | null;
}

const taskFieldLabels: Record<string, string> = {
  task_name: '任务名称', product_category: '产品品类', product: '产品', product_model: '产品型号',
  project_number: '项目单号', project_type: '项目类型', project_phase: '项目阶段',
  test_date: '测试日期', organizer: '组织人', target_user: '目标用户',
  test_purpose: '测试目的', test_method: '测试方法', status: '状态',
  assigned_to: '负责人', created_at: '创建时间', updated_at: '更新时间',
};

const hiddenTaskFields = new Set(['id', 'selected_standards', 'created_by']);
const beijingTimeFields = new Set(['created_at', 'updated_at']);

function formatBeijingTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return String(dateStr);
    const utc = d.getTime() + d.getTimezoneOffset() * 60000;
    const beijing = new Date(utc + 8 * 60 * 60000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${beijing.getFullYear()}-${pad(beijing.getMonth() + 1)}-${pad(beijing.getDate())} ${pad(beijing.getHours())}:${pad(beijing.getMinutes())}:${pad(beijing.getSeconds())}`;
  } catch {
    return String(dateStr);
  }
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function imageUrlToPrintableDataUrl(url: string, mode: PrintMode): Promise<string> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    if (mode === 'high') return blobToDataUrl(blob);

    const objectUrl = URL.createObjectURL(blob);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = objectUrl;
      });
      const maxSide = 1200;
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return blobToDataUrl(blob);
      ctx.drawImage(image, 0, 0, width, height);
      const compressed = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.72));
      return compressed ? blobToDataUrl(compressed) : blobToDataUrl(blob);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return url;
  }
}

async function batchPresignUrls(paths: string[], reportId?: string | null, shareToken?: string | null): Promise<Record<string, string>> {
  const objectKeys = paths.filter((path) => !isDirectPrintableUrl(path));
  const directUrls = paths.filter(isDirectPrintableUrl);
  const directMap = Object.fromEntries(directUrls.map((url) => [url, url]));
  if (!objectKeys.length) return directMap;
  try {
    const res = await fetch('/api/materials/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: objectKeys, report_id: reportId || undefined, share_token: shareToken || undefined }),
    });
    if (!res.ok) return directMap;
    const data = await res.json();
    return data.code === 0 ? { ...directMap, ...data.data } : directMap;
  } catch {
    return directMap;
  }
}

function isDirectPrintableUrl(value: string): boolean {
  return value.startsWith('http') || value.startsWith('/uploads/') || value.startsWith('/media/') || value.startsWith('data:');
}

async function presignReportUrls(rpt: ReportData, shareToken?: string | null): Promise<ReportData> {
  const filePaths: string[] = [];
  const collectPaths = (obj: unknown) => {
    if (!obj || typeof obj !== 'object') return;
    const record = obj as Record<string, unknown>;
    for (const [key, val] of Object.entries(record)) {
      if ((key === 'file_url' || key === 'file_path') && typeof val === 'string' && val && !isDirectPrintableUrl(val)) {
        filePaths.push(val);
      } else if (Array.isArray(val)) {
        val.forEach(item => collectPaths(item));
      } else if (typeof val === 'object' && val !== null) {
        collectPaths(val);
      }
    }
  };
  collectPaths(rpt);
  if (filePaths.length === 0) return rpt;

  try {
    const res = await fetch('/api/materials/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_paths: [...new Set(filePaths)], report_id: rpt.id, share_token: shareToken || undefined }),
    });
    const data = await res.json();
    if (data.code === 0 && data.data) {
      const urlMap = data.data as Record<string, string>;
      const replacePaths = (obj: unknown): unknown => {
        if (!obj || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(item => replacePaths(item));
        const record = obj as Record<string, unknown>;
        const result: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(record)) {
          if ((key === 'file_url' || key === 'file_path') && typeof val === 'string' && urlMap[val]) {
            result[key] = urlMap[val];
          } else if (typeof val === 'object' && val !== null) {
            result[key] = replacePaths(val);
          } else {
            result[key] = val;
          }
        }
        return result;
      };
      return replacePaths(rpt) as ReportData;
    }
  } catch { /* ignore */ }

  return rpt;
}

async function fetchReportDetailModel(reportId: string): Promise<ReportDetailModel | null> {
  try {
    const res = await fetch(`/api/reports/${reportId}/detail`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.code === 0 ? data.data as ReportDetailModel : null;
  } catch {
    return null;
  }
}

function parseProblemPoints(value?: string | null): ProblemPoint[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => {
          if (typeof item === 'string') return { text: item };
          if (item && typeof item === 'object' && typeof (item as Record<string, unknown>).text === 'string') {
            const rawIds = (item as Record<string, unknown>).material_ids;
            return {
              text: (item as Record<string, string>).text,
              material_ids: Array.isArray(rawIds) ? rawIds.filter((id): id is string => typeof id === 'string') : undefined,
            };
          }
          return null;
        })
        .filter((item): item is ProblemPoint => Boolean(item));
    }
    if (typeof parsed === 'string' && parsed.trim()) return [{ text: parsed.trim() }];
  } catch {
    // Legacy reports stored a plain text problem point.
  }
  return value.trim() ? [{ text: value.trim() }] : [];
}

function getBoundMaterials(materials: Material[] | undefined, ids: string[] | undefined): Material[] {
  if (!materials?.length || !ids?.length) return [];
  const idSet = new Set(ids);
  return materials.filter((material) => idSet.has(material.id));
}

function getStepProblemPoints(step: RecipeStep): ProblemPoint[] {
  if (step.problem_points && step.problem_points.length > 0) {
    return step.problem_points.filter((point) => point.text && point.text.trim());
  }
  return step.problem_point ? [{ text: step.problem_point }] : [];
}

function getUnboundStepMaterials(materials: Material[] | undefined, problemPoints: ProblemPoint[]): Material[] {
  if (!materials?.length) return [];
  const boundIds = new Set(problemPoints.flatMap((point) => point.material_ids || []));
  return materials.filter((material) => !boundIds.has(material.id));
}

function PrintMediaStrip({ materials, indent = 0 }: { materials?: Material[]; indent?: number }) {
  if (!materials?.length) return null;
  const images = materials.filter(m => m.material_type === 'image');
  const videos = materials.filter(m => m.material_type === 'video');
  if (images.length === 0 && videos.length === 0) return null;

  const mediaBoxStyle: CSSProperties = {
    width: '72px',
    height: '72px',
    borderRadius: '6px',
    objectFit: 'cover',
    border: '1px solid #d1d5db',
    background: '#f3f4f6',
  };

  return (
    <div style={{ display: 'flex', gap: '8px', marginTop: '8px', marginLeft: indent, flexWrap: 'wrap' }}>
      {images.map(mat => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={mat.id} src={mat.file_url} alt={mat.file_name} style={mediaBoxStyle} crossOrigin="anonymous" />
      ))}
      {videos.map(mat => (
        <div key={mat.id} style={{ ...mediaBoxStyle, overflow: 'hidden', position: 'relative' }}>
          <video src={mat.file_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted preload="metadata" />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(17,24,39,0.28)' }}>
            <span style={{ color: 'white', fontSize: '16px' }}>&#9654;</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function PrintAiSummary({ summary }: { summary?: AiSummaryLike | null }) {
  if (!summary || (!summary.summary && !summary.tag && !summary.historical_position)) return null;
  return (
    <>
      <h3 style={{ fontSize: '17px', margin: '18px 0 10px', color: '#0f766e', borderBottom: '2px solid #0d9488', paddingBottom: '6px' }}>总结</h3>
      <div style={{ padding: '14px', background: '#fff', border: '1px solid #d1d5db', borderRadius: '8px', margin: '8px 0 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
          {summary.tag && <span style={{ fontSize: '12px', fontWeight: 700, color: '#0f766e', background: '#ccfbf1', padding: '3px 9px', borderRadius: '4px' }}>{summary.tag}</span>}
          {summary.satisfaction_score !== undefined && <span style={{ fontSize: '12px', fontWeight: 600, color: '#0f766e' }}>满意度 {summary.satisfaction_score}/10</span>}
        </div>
        {summary.summary && (
          <div style={{ fontSize: '13px', lineHeight: 1.75, whiteSpace: 'pre-wrap', marginBottom: '12px', color: '#111827' }}>
            {summary.summary}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
          {(summary.strengths || []).length > 0 && (
            <div style={{ border: '1px solid #d1fae5', background: '#ecfdf5', borderRadius: '6px', padding: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#047857', marginBottom: '6px' }}>主要优势</div>
              {(summary.strengths || []).map((item, idx) => (
                <div key={idx} style={{ fontSize: '12px', lineHeight: 1.6, color: '#1f2937', marginBottom: '4px' }}>• {item}</div>
              ))}
            </div>
          )}
          {(summary.risks || []).length > 0 && (
            <div style={{ border: '1px solid #fde68a', background: '#fffbeb', borderRadius: '6px', padding: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#b45309', marginBottom: '6px' }}>主要风险</div>
              {(summary.risks || []).map((item, idx) => (
                <div key={idx} style={{ fontSize: '12px', lineHeight: 1.6, color: '#1f2937', marginBottom: '4px' }}>• {item}</div>
              ))}
            </div>
          )}
        </div>
        {summary.historical_position && (
          <div style={{ fontSize: '12px', lineHeight: 1.6, color: '#4b5563', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '8px 10px', marginBottom: '10px' }}>
            <strong style={{ color: '#111827' }}>历史表现：</strong>{summary.historical_position}
          </div>
        )}
        {(summary.suggestions || []).length > 0 && (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: '6px', padding: '10px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#111827', marginBottom: '6px' }}>后续建议</div>
            {summary.suggestions!.map((item, idx) => (
              <div key={idx} style={{ fontSize: '12px', lineHeight: 1.6, color: '#4b5563', marginBottom: '4px' }}>{idx + 1}. {item}</div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function PrintReportSection({ report, liveIssues }: { report: ReportData; liveIssues: IssueItem[] }) {
  const content = report.content;
  if (!content) return null;
  const task = content.task;
  const records = content.records || [];
  const recipes = content.recipes || [];
  const display = buildDisplayReportContent({ title: report.title, content: content as unknown as ReportContentWithReview });
  const STATUS_BG: Record<string, string> = { '待整改': '#fef3c7', '整改中': '#dbeafe', '已验证': '#d1fae5', '不整改': '#e5e7eb' };
  const STATUS_FG: Record<string, string> = { '待整改': '#92400e', '整改中': '#1e40af', '已验证': '#065f46', '不整改': '#374151' };

  return (
    <>
      {/* Task Info */}
      {task && (
        <>
          <h3 style={{ fontSize: '15px', margin: '16px 0 8px', color: '#0d9488', borderBottom: '1px solid #0d9488', paddingBottom: '4px' }}>任务信息</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', margin: '8px 0' }}>
            {Object.entries(task)
              .filter(([k]) => !hiddenTaskFields.has(k))
              .map(([key, value]) => {
                const displayValue = beijingTimeFields.has(key)
                  ? formatBeijingTime(value as string | null | undefined)
                  : String(value || '-');
                return (
                  <div key={key} style={{ fontSize: '12px', padding: '6px', background: '#f9fafb', borderRadius: '4px' }}>
                    <div style={{ color: '#666', fontSize: '10px', marginBottom: '2px' }}>{taskFieldLabels[key] || key}</div>
                    <div style={{ wordBreak: 'break-all' }}>{displayValue}</div>
                  </div>
                );
              })}
          </div>
        </>
      )}

      <PrintAiSummary summary={display.ai_summary} />
      {display.review_note && (
        <div style={{ padding: '10px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', margin: '8px 0', fontSize: '12px', whiteSpace: 'pre-wrap' }}>
          <strong>评审备注：</strong>{display.review_note}
        </div>
      )}

      {/* Issues with live status */}
      {liveIssues.length > 0 && (
        <>
          <h3 style={{ fontSize: '15px', margin: '16px 0 8px', color: '#0d9488', borderBottom: '1px solid #0d9488', paddingBottom: '4px' }}>问题清单 ({liveIssues.length})</h3>
          {liveIssues.map((issue, idx) => (
            <div key={idx} style={{ padding: '8px', background: '#f9fafb', borderRadius: '4px', margin: '4px 0', fontSize: '12px', border: '1px solid #e5e7eb' }}>
              {/* Row 1: Level + Title + Status */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: '3px', fontSize: '10px', fontWeight: 500,
                  background: issue.level === '一类' ? '#fee2e2' : issue.level === '二类' ? '#fef3c7' : '#e0f2fe',
                  color: issue.level === '一类' ? '#991b1b' : issue.level === '二类' ? '#92400e' : '#0c4a6e'
                }}>{String(issue.level || '二类')}</span>
                {issue.source_type === 'recipe_problem' && (
                  <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: '3px', fontSize: '10px', border: '1px solid #d1d5db' }}>食谱/功能</span>
                )}
                <span style={{ flex: 1, fontWeight: 500 }}>{String(issue.title || '')}</span>
                <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: '3px', fontSize: '10px', fontWeight: 500,
                  background: STATUS_BG[issue.status] || '#fef3c7', color: STATUS_FG[issue.status] || '#92400e'
                }}>{issue.status}</span>
              </div>
              {/* Row 2: Standard/Category */}
              {issue.category && (
                <div style={{ marginTop: '4px', paddingLeft: '4px' }}>
                  <span style={{ color: '#6b7280', fontSize: '10px' }}>标准: </span>
                  <span style={{ color: '#6b7280', fontSize: '10px' }}>{String(issue.category)}</span>
                </div>
              )}
              {/* Row 3: Problem description */}
              {issue.description && (
                <div style={{ marginTop: '4px', paddingLeft: '4px' }}>
                  <span style={{ color: '#6b7280', fontSize: '10px' }}>问题来源: </span>
                  <span style={{ color: '#6b7280', fontSize: '10px' }}>{String(issue.description)}</span>
                </div>
              )}
              {/* Row 4: Rectification plan */}
              {(issue.improve_plan || issue.responsible_person || issue.plan_complete_date) && (
                <div style={{ marginTop: '4px', paddingLeft: '4px' }}>
                  <span style={{ color: '#6b7280', fontSize: '10px' }}>整改方案: </span>
                  <span style={{ color: '#6b7280', fontSize: '10px' }}>
                    {issue.improve_plan && String(issue.improve_plan)}
                    {issue.responsible_person && <span> ({String(issue.responsible_person)})</span>}
                    {issue.plan_complete_date && <span> 截止: {String(issue.plan_complete_date)}</span>}
                  </span>
                </div>
              )}
              {/* Row 5: Verification result */}
              {issue.verification_note && (
                <div style={{ marginTop: '4px', paddingLeft: '4px' }}>
                  <span style={{ color: '#6b7280', fontSize: '10px' }}>验证结果: </span>
                  <span style={{ color: '#6b7280', fontSize: '10px' }}>{String(issue.verification_note)}</span>
                </div>
              )}
              {/* Re-evaluations for recipe_problem issues */}
              {Array.isArray(issue._reEvaluations) && (issue._reEvaluations as Array<Record<string, unknown>>).length > 0 && (
                <div style={{ marginTop: '6px', borderTop: '1px dashed #d1d5db', paddingTop: '4px' }}>
                  {(issue._reEvaluations as Array<Record<string, unknown>>).map((re, reIdx) => {
                    const reMats = re.materials as Array<Record<string, string>> | undefined;
                    const aiResult = re.ai_result as { score: number; summary: string } | null | undefined;
                    return (
                    <div key={String(re.id)} style={{ background: '#f0fdf4', borderRadius: '3px', padding: '4px 6px', margin: '3px 0', fontSize: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ background: '#dcfce7', padding: '0 4px', borderRadius: '2px', fontWeight: 500 }}>第{reIdx + 1}次复测</span>
                        {aiResult && (
                          <span style={{ border: '1px solid #d1d5db', padding: '0 4px', borderRadius: '2px' }}>AI评分: {aiResult.score}</span>
                        )}
                        <span style={{ color: '#9ca3af', marginLeft: 'auto' }}>{re.created_at ? new Date(String(re.created_at)).toLocaleDateString('zh-CN') : ''}</span>
                      </div>
                      {String(re.description || '') && <div style={{ marginTop: '2px' }}>{String(re.description || '')}</div>}
                      {aiResult && aiResult.summary && <div style={{ color: '#6b7280', marginTop: '2px' }}>AI总结: {String(aiResult.summary)}</div>}
                      {reMats && reMats.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                          {reMats.filter(m => m.material_type === 'image').map((m, mi) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={mi} src={String(m.file_url)} alt={String(m.file_name)} style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '3px', border: '1px solid #e5e7eb' }} />
                          ))}
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {/* Check Records */}
      <h3 style={{ fontSize: '15px', margin: '16px 0 8px', color: '#0d9488', borderBottom: '1px solid #0d9488', paddingBottom: '4px' }}>检查记录 ({records.length})</h3>
      {records.length > 0 ? records.map((record) => {
        const recordMats = record.materials || [];
        return (
          <div key={record.id} style={{ padding: '10px', margin: '4px 0', background: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{
                display: 'inline-block', padding: '1px 6px', borderRadius: '3px', fontSize: '10px', fontWeight: 500,
                background: record.evaluation_result === '合格' ? '#d1fae5' : record.evaluation_result === '不合格' ? '#fee2e2' : '#fef3c7',
                color: record.evaluation_result === '合格' ? '#065f46' : record.evaluation_result === '不合格' ? '#991b1b' : '#92400e'
              }}>{record.evaluation_result}</span>
              <span style={{ fontWeight: 500, fontSize: '13px', flex: 1 }}>{record.check_item}</span>
              {record.sensory_dimension && <span style={{ fontSize: '10px', color: '#0c4a6e', background: '#e0f2fe', padding: '1px 4px', borderRadius: '2px' }}>{record.sensory_dimension}</span>}
              {record.check_dimension && <span style={{ fontSize: '10px', color: '#666' }}>{record.check_dimension}</span>}
            </div>
            {(record.check_requirement || record.check_standard) && (
              <div style={{ fontSize: '10px', color: '#888', marginTop: '2px', paddingLeft: '4px' }}>
                {record.check_requirement && <div>要求: {record.check_requirement}</div>}
                {record.check_standard && <div>标准: {record.check_standard}</div>}
              </div>
            )}
            {record.problem_description && <div style={{ color: '#666', fontSize: '11px', marginTop: '3px' }}>{record.problem_description}</div>}
            <PrintMediaStrip materials={recordMats} />
          </div>
        );
      }) : <div style={{ textAlign: 'center', color: '#666', padding: '12px', fontSize: '12px' }}>暂无记录</div>}

      {/* Recipes */}
      {recipes.length > 0 && (
        <>
          <h3 style={{ fontSize: '15px', margin: '16px 0 8px', color: '#0d9488', borderBottom: '1px solid #0d9488', paddingBottom: '4px' }}>食谱/功能列表 ({recipes.length})</h3>
          {recipes.map(recipe => (
            <div key={recipe.id} style={{ border: '1px solid #e5e7eb', borderRadius: '6px', padding: '12px', margin: '6px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: '3px', fontSize: '10px', fontWeight: 500, background: '#e0f2fe', color: '#0c4a6e' }}>{recipe.recipe_type}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: '13px' }}>{recipe.name}</span>
                  {recipe.ingredients && <div style={{ color: '#888', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{recipe.ingredients}</div>}
                </div>
                <span style={{ color: '#666', fontSize: '11px', marginLeft: 'auto', flexShrink: 0 }}>{recipe.recipe_steps?.length || 0} 步骤 | {recipe.problem_count || 0} 问题{recipe.effect_score ? ` | ${recipe.effect_score}分` : ''}</span>
              </div>
              {recipe.recipe_steps?.map(step => {
                const stepMats = step.materials || [];
                const problemPoints = getStepProblemPoints(step);
                const stepLevelMats = getUnboundStepMaterials(stepMats, problemPoints);
                return (
                  <div key={step.id} style={{ padding: '6px', margin: '3px 0', background: '#f9fafb', borderRadius: '3px' }}>
                    <div>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', borderRadius: '50%', background: '#f3f4f6', color: '#374151', fontSize: '10px', fontWeight: 600, marginRight: '6px' }}>{step.step_number}</span>
                      <span style={{ fontSize: '12px' }}>{step.operation}</span>
                    </div>
                    {(() => {
                      const pps = problemPoints;
                      if (pps.length === 0) return null;
                      return (
                          <div style={{ marginLeft: '24px' }}>
                          {pps.map((pp: ProblemPoint, ppIdx: number) => {
                            const pointMaterials = getBoundMaterials(stepMats, pp.material_ids);
                            return (
                            <div key={ppIdx}>
                            <div style={{ color: '#d97706', fontSize: '11px' }}>
                              {pps.length > 1 && <span style={{ fontWeight: 600 }}>问题{ppIdx + 1}: </span>}
                              {pp.text}
                            </div>
                            <PrintMediaStrip materials={pointMaterials} />
                            </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                    <PrintMediaStrip materials={stepLevelMats} indent={24} />
                  </div>
                );
              })}
              {/* Effect Evaluation */}
              {(recipe.effect_description || recipe.effect_problem_point || recipe.effect_score || recipe.effect_ai_result || (recipe.effect_materials && recipe.effect_materials.length > 0)) && (
                <div style={{ marginTop: '8px', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#0d9488' }}>效果/出品效果评价</span>
                    {recipe.effect_score && (
                      <span style={{ marginLeft: 'auto', display: 'inline-block', padding: '1px 6px', borderRadius: '3px', fontSize: '10px', fontWeight: 600,
                        background: Number(recipe.effect_score) >= 8 ? '#059669' : Number(recipe.effect_score) >= 6 ? '#2563eb' : Number(recipe.effect_score) >= 4 ? '#d97706' : '#dc2626',
                        color: 'white' }}>综合 {recipe.effect_score}分/10分</span>
                    )}
                  </div>
                  {recipe.effect_ai_result && (
                      <div style={{ fontSize: '11px', color: '#555', marginLeft: '20px', whiteSpace: 'pre-wrap' }}>{recipe.effect_ai_result.summary}</div>
                  )}
                  {!recipe.effect_ai_result && recipe.effect_description && (
                    <div style={{ fontSize: '11px', color: '#555', marginLeft: '20px', whiteSpace: 'pre-wrap' }}>{recipe.effect_description}</div>
                  )}
                  {recipe.effect_problem_point && (() => {
                    let pps: string[] = [];
                    try {
                      const parsed = JSON.parse(recipe.effect_problem_point);
                      if (Array.isArray(parsed)) {
                        pps = parsed.filter((p: unknown) => typeof p === 'object' && p !== null && typeof (p as Record<string, unknown>).text === 'string').map((p: { text: string }) => p.text);
                      } else { pps = [recipe.effect_problem_point]; }
                    } catch { pps = [recipe.effect_problem_point]; }
                    return pps.map((pp, i) => (
                      <div key={i} style={{ fontSize: '11px', color: '#d97706', marginLeft: '20px' }}>问题{i > 0 ? i + 1 : ''}: {pp}</div>
                    ));
                  })()}
                  {(() => {
                    const effectPoints = parseProblemPoints(recipe.effect_problem_point);
                    const effectMaterials = recipe.effect_materials || [];
                    const hasBoundMaterials = effectPoints.some((point) => point.material_ids?.length);
                    if (!hasBoundMaterials) return null;
                    return effectPoints.map((point, i) => (
                      <div key={`${point.text}-${i}`} style={{ marginLeft: '20px', marginTop: '6px' }}>
                        <div style={{ fontSize: '10px', color: '#6b7280' }}>对应素材 {effectPoints.length > 1 ? i + 1 : ''}</div>
                        <PrintMediaStrip materials={getBoundMaterials(effectMaterials, point.material_ids)} />
                      </div>
                    ));
                  })()}
                  {recipe.effect_materials && recipe.effect_materials.length > 0 && !parseProblemPoints(recipe.effect_problem_point).some((point) => point.material_ids?.length) && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px', marginLeft: '20px' }}>
                      {recipe.effect_materials.filter(m => m.material_type === 'image').map(mat => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={mat.id} src={mat.file_url} alt={mat.file_name} style={{ width: '50px', height: '50px', borderRadius: '3px', objectFit: 'cover', border: '1px solid #e5e7eb' }} crossOrigin="anonymous" />
                      ))}
                      {recipe.effect_materials.filter(m => m.material_type === 'video').map(mat => (
                        <div key={mat.id} style={{ width: '50px', height: '50px', borderRadius: '3px', overflow: 'hidden', border: '1px solid #e5e7eb', position: 'relative', background: '#e5e7eb' }}>
                          <video src={mat.file_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted preload="metadata" />
                          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)' }}>
                            <span style={{ color: 'white', fontSize: '16px' }}>&#9654;</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </>
      )}

    </>
  );
}

export default function ReportPrintPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
      <ReportPrintContent />
    </Suspense>
  );
}

function ReportPrintContent() {
  const searchParams = useSearchParams();
  const reportId = searchParams.get('id');
  const shareToken = searchParams.get('share_token');
  const printMode = normalizePrintMode(searchParams.get('mode'));
  const printParityMode = searchParams.get('parity') === '1' || searchParams.get('debug') === 'legacy';
  const [report, setReport] = useState<ReportData | null>(null);
  const [siblingReports, setSiblingReports] = useState<ReportData[]>([]);
  const [detailModelsMap, setDetailModelsMap] = useState<Record<string, ReportDetailModel>>({});
  const [liveIssuesMap, setLiveIssuesMap] = useState<Record<string, IssueItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const [imageProgress, setImageProgress] = useState({ total: 0, done: 0 });

  useEffect(() => {
    if (!reportId) return;
    if (shareToken) {
      fetch(`/api/reports/share?token=${encodeURIComponent(shareToken)}`).then(r => r.json()).then(async (res) => {
        if (res.code !== 0 || !res.data?.report) return;

        const currentReport = res.data.report as ReportData;
        if (currentReport.id !== reportId) return;

        const rpt = await presignReportUrls(currentReport, shareToken);
        const siblings = await Promise.all(((res.data.siblingReports || []) as ReportData[])
          .filter((item) => Boolean(item?.content))
          .map((item) => presignReportUrls(item, shareToken)));
        setReport(rpt);
        setSiblingReports(siblings);
        setDetailModelsMap({
          ...(res.data.detailModel ? { [rpt.id]: res.data.detailModel as ReportDetailModel } : {}),
          ...(res.data.siblingDetailModels || {}),
        });
        setLiveIssuesMap({
          [rpt.id]: res.data.liveIssues || [],
          ...(res.data.siblingIssuesMap || {}),
        });
      }).finally(() => setLoading(false));
      return;
    }

    fetch(`/api/reports/${reportId}`).then(r => r.json()).then(async (res) => {
      if (res.code === 0) {
        const rpt = await presignReportUrls(res.data as ReportData);
        setReport(rpt);
        setSiblingReports([]);
        const detailModel = await fetchReportDetailModel(rpt.id);
        if (detailModel) setDetailModelsMap(prev => ({ ...prev, [rpt.id]: detailModel }));
        // Fetch sibling reports for merging
        const mergeModel = getReportMergeModel(rpt.product_model);
        if (mergeModel) {
          const allRes = await fetch('/api/reports?limit=200');
          const allData = await allRes.json();
          const allReports: ReportData[] = Array.isArray(allData.data) ? allData.data : (allData.data?.list || []);
          const projectType = (rpt.content?.task as Record<string, unknown>)?.project_type as string;
          if (isMergeableReportProjectType(projectType)) {
            // Deduplicate: for each task_id, only keep the latest report
            const byTaskId: Record<string, ReportData> = {};
            for (const r of allReports) {
              if (getReportMergeModel(r.product_model) !== mergeModel) continue;
              const rProjectType = normalizeReportProjectType((r as unknown as Record<string, unknown>).project_type as string || (r.content?.task as Record<string, unknown>)?.project_type as string);
              if (!isMergeableReportProjectType(rProjectType)) continue;
              const existing = byTaskId[r.task_id];
              if (!existing || r.created_at > existing.created_at) {
                byTaskId[r.task_id] = r;
              }
            }
            // Current report's task_id should use current report
            byTaskId[rpt.task_id] = rpt;
            const siblingSummaries = sortReportsByCreatedAtAsc(Object.values(byTaskId))
              .filter((r: ReportData) => r.id !== rpt.id)
              .filter((r: ReportData) => Boolean(r.id));
            const siblings = await Promise.all(siblingSummaries.map(async (summary) => {
              const detailRes = await fetch(`/api/reports/${summary.id}`);
              const detailData = await detailRes.json();
              if (detailData.code !== 0) return null;
              const sibling = await presignReportUrls(detailData.data as ReportData);
              const siblingDetailModel = await fetchReportDetailModel(sibling.id);
              if (siblingDetailModel) setDetailModelsMap(prev => ({ ...prev, [sibling.id]: siblingDetailModel }));
              return sibling;
            }));
            setSiblingReports(siblings.filter((item): item is ReportData => Boolean(item?.content)));
          }
        }
        // Fetch live issues
        const issuesRes = await fetch(`/api/issues?source_report_id=${rpt.id}&limit=500`);
        const issuesData = await issuesRes.json();
        const raw = issuesData.data;
        const allIssues: IssueItem[] = Array.isArray(raw) ? raw : (raw?.list || []);
        const reportIssues = allIssues.filter((i: IssueItem) => i.source_report_id === rpt.id);
        // Fetch re-evaluations for recipe_problem issues
        const recipeIssues = reportIssues.filter((i: IssueItem) => i.source_type === 'recipe_problem');
        if (recipeIssues.length > 0) {
          try {
            const issueIds = recipeIssues.map(i => i.id).join(',');
            const reRes = await fetch(`/api/issue-re-evaluations?issue_ids=${issueIds}`);
            const reData = await reRes.json();
            if (reData.code === 0 && reData.data) {
              const reEvalMap: Record<string, unknown[]> = {};
              for (const re of reData.data) {
                if (!reEvalMap[re.issue_id]) reEvalMap[re.issue_id] = [];
                reEvalMap[re.issue_id].push(re);
              }
              for (const issue of recipeIssues) {
                (issue as Record<string, unknown>)._reEvaluations = reEvalMap[issue.id] || [];
              }
            }
          } catch { /* ignore */ }
        }
        setLiveIssuesMap({ [rpt.id]: reportIssues });
      }
    }).finally(() => setLoading(false));
  }, [reportId, shareToken]);

  // Fetch live issues for sibling reports
  useEffect(() => {
    if (siblingReports.length === 0) return;
    Promise.all(siblingReports.map(async (rpt) => {
      const res = await fetch(`/api/issues?source_report_id=${rpt.id}&limit=500`);
      const data = await res.json();
      const raw = data.data;
      const allIssues: IssueItem[] = Array.isArray(raw) ? raw : (raw?.list || []);
      return { reportId: rpt.id, issues: allIssues.filter((i: IssueItem) => i.source_report_id === rpt.id) };
    })).then(async results => {
      const map: Record<string, IssueItem[]> = {};
      results.forEach(result => { map[result.reportId] = result.issues; });
      // Fetch re-evaluations for recipe_problem issues
      const allRecipeIssues = Object.values(map).flat().filter((i: IssueItem) => i.source_type === 'recipe_problem');
      if (allRecipeIssues.length > 0) {
        try {
          const issueIds = allRecipeIssues.map(i => i.id).join(',');
          const reRes = await fetch(`/api/issue-re-evaluations?issue_ids=${issueIds}`);
          const reData = await reRes.json();
          if (reData.code === 0 && reData.data) {
            const reEvalMap: Record<string, unknown[]> = {};
            for (const re of reData.data) {
              if (!reEvalMap[re.issue_id]) reEvalMap[re.issue_id] = [];
              reEvalMap[re.issue_id].push(re);
            }
            for (const issue of allRecipeIssues) {
              (issue as Record<string, unknown>)._reEvaluations = reEvalMap[issue.id] || [];
            }
          }
        } catch { /* ignore */ }
      }
      setLiveIssuesMap(prev => ({ ...prev, ...map }));
    });
  }, [siblingReports]);

  // Convert images for printing. Fast mode dedupes and compresses; high mode keeps originals.
  useEffect(() => {
    if (!report) return;
    setImagesLoaded(false);
    setImageProgress({ total: 0, done: 0 });

    if (printMode === 'text') {
      setImagesLoaded(true);
      return;
    }

    const convertImages = async () => {
      const allReports = [report, ...siblingReports];
      const allFilePaths: string[] = [];
      allReports.forEach(rpt => {
        if (!rpt.content) return;
        rpt.content.records?.forEach(r => {
          (r as CheckRecord).materials?.forEach(m => {
            if (m.material_type === 'image') allFilePaths.push(m.file_path || m.file_url);
          });
        });
        rpt.content.recipes?.forEach(recipe => {
          recipe.recipe_steps?.forEach(step => {
            step.materials?.forEach(m => {
              if (m.material_type === 'image') allFilePaths.push(m.file_path || m.file_url);
            });
          });
          recipe.effect_materials?.forEach(m => {
            if (m.material_type === 'image') allFilePaths.push(m.file_path || m.file_url);
          });
        });
        rpt.content.materials?.forEach(m => {
          if (m.material_type === 'image') allFilePaths.push(m.file_path || m.file_url);
        });
      });

      // Also include re-evaluation materials
      Object.values(liveIssuesMap).flat().forEach(issue => {
        const reEvals = (issue as Record<string, unknown>)._reEvaluations as ReEvaluation[] | undefined;
        reEvals?.forEach(reEval => {
          reEval.materials?.forEach(m => {
            if (m.material_type === 'image') allFilePaths.push(m.file_path || m.file_url);
          });
        });
      });

      // Presign all file paths to get valid URLs
      const filePaths = uniqueUrls(allFilePaths);
      const presignedMap = await batchPresignUrls(filePaths, reportId, shareToken);

      // Step 1: Update DOM img/video src from S3 key to presigned URL
      for (const [fp, presignedUrl] of Object.entries(presignedMap)) {
        document.querySelectorAll('img').forEach((img) => {
          if (img.getAttribute('src') === fp) (img as HTMLImageElement).src = presignedUrl;
        });
        document.querySelectorAll('video').forEach((vid) => {
          if (vid.getAttribute('src') === fp) (vid as HTMLVideoElement).src = presignedUrl;
        });
      }

      // Step 2: Convert presigned URLs to base64 for print
      const imageUrls = filePaths.map(fp => presignedMap[fp] || fp);
      setImageProgress({ total: imageUrls.length, done: 0 });

      await mapWithConcurrency(imageUrls, printMode === 'high' ? 3 : 5, async (url) => {
        try {
          const base64 = await imageUrlToPrintableDataUrl(url, printMode);
          document.querySelectorAll('img').forEach((img) => {
            if (img.getAttribute('src') === url || (img as HTMLImageElement).src === url) {
              (img as HTMLImageElement).src = base64;
            }
          });
        } catch { /* ignore */ }
        setImageProgress((current) => ({ total: current.total, done: current.done + 1 }));
      });
      setImagesLoaded(true);
    };
    const timer = setTimeout(convertImages, 500);
    return () => clearTimeout(timer);
  }, [report, siblingReports, printMode, liveIssuesMap, reportId, shareToken]);

  useEffect(() => {
    if (report && imagesLoaded) {
      const timer = setTimeout(() => window.print(), 800);
      return () => clearTimeout(timer);
    }
  }, [report, imagesLoaded]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">加载报告内容...</span>
      </div>
    );
  }

  const primaryDetailModel = report ? detailModelsMap[report.id] : null;

  if (!report || (!report.content && !primaryDetailModel)) {
    return <div className="p-8 text-center text-muted-foreground">报告不存在或内容为空</div>;
  }

  const task = report.content?.task || {};
  const projectType = task?.project_type as string | undefined;
  const isMerged = siblingReports.length > 0;
  const allReports = isMerged ? [report, ...siblingReports] : [report];

  // Total stats
  const totalRecords = allReports.flatMap(r => r.content?.records || []);
  const allLiveIssues = allReports.flatMap(r => liveIssuesMap[r.id] || []);
  const totalRecipes = allReports.flatMap(r => r.content?.recipes || []);
  const totalPass = totalRecords.filter(r => r.evaluation_result === '合格').length;
  const totalFail = totalRecords.filter(r => r.evaluation_result === '不合格').length;
  const totalRecipePC = totalRecipes.reduce((s, r) => s + (r.problem_count || 0), 0);
  const displayReport = report.content
    ? buildDisplayReportContent({
      title: report.title,
      content: report.content as unknown as ReportContentWithReview,
    })
    : { title: report.title, ai_summary: null, review_note: null };
  const primaryPrintDelivery = primaryDetailModel?.printDelivery;
  const preflightErrors = primaryPrintDelivery?.preflight.errors || [];
  const preflightWarnings = primaryPrintDelivery?.preflight.warnings || [];

  return (
    <>
      {!imagesLoaded && printMode !== 'text' && (
        <div className="print-status" style={{ position: 'fixed', top: 16, right: 16, zIndex: 50, padding: '10px 12px', borderRadius: '8px', background: '#0f766e', color: 'white', fontSize: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.16)' }}>
          正在处理图片 {imageProgress.done}/{imageProgress.total || '-'} · {printMode === 'high' ? '高清模式' : '快速模式'}
        </div>
      )}
    <div className={`print-container ${printMode === 'text' ? 'print-text-mode' : ''}`} style={{ padding: '40px', maxWidth: '1000px', margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif', color: '#1a1a1a', lineHeight: 1.6, fontSize: '14px' }}>
      {/* Title */}
      <h1 style={{ fontSize: '24px', marginBottom: '8px', color: '#111827', letterSpacing: '0' }}>
        {report.product_model || displayReport.title}
        {isMerged && <span style={{ fontSize: '14px', color: '#666', fontWeight: 400, marginLeft: '8px' }}>(合并 {allReports.length} 份报告)</span>}
      </h1>
      <div style={{ color: '#666', fontSize: '12px', marginBottom: '20px' }}>
        {projectType && <span>项目类型: {projectType} | </span>}
        版本 V{report.version} | 状态: {report.status} | 生成时间: {formatBeijingTime(report.content?.generatedAt || report.created_at)}
      </div>

      {primaryPrintDelivery && (
        <section
          data-testid="print-preflight-panel"
          style={{ border: '1px solid #d1d5db', borderRadius: '8px', padding: '12px', margin: '16px 0', background: primaryPrintDelivery.preflight.ok ? '#f0fdf4' : '#fef2f2' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: primaryPrintDelivery.preflight.ok ? '#166534' : '#991b1b' }}>
                Print preflight: {primaryPrintDelivery.preflight.ok ? 'OK' : 'Blocked'}
              </div>
              <div data-testid="print-profile-label" style={{ fontSize: '12px', color: '#4b5563', marginTop: '2px' }}>
                Profile {primaryPrintDelivery.profile.id} - {primaryPrintDelivery.profile.paper} {primaryPrintDelivery.profile.orientation} - {primaryPrintDelivery.preflight.counts.printBlocks} print blocks
              </div>
            </div>
            {primaryPrintDelivery.latestPdfJob && (
              <div data-testid="print-pdf-job-status" style={{ fontSize: '12px', color: '#4b5563' }}>
                Latest PDF job: {primaryPrintDelivery.latestPdfJob.status}
              </div>
            )}
          </div>
          {(preflightErrors.length > 0 || preflightWarnings.length > 0) && (
            <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: '6px' }}>
              {[...preflightErrors, ...preflightWarnings].map((item) => (
                <li
                  key={item.code}
                  data-testid="print-preflight-item"
                  style={{ border: `1px solid ${item.severity === 'error' ? '#fecaca' : '#fde68a'}`, borderRadius: '6px', padding: '8px', background: '#fff', color: item.severity === 'error' ? '#991b1b' : '#92400e', fontSize: '12px' }}
                >
                  <strong>{item.code}</strong> - {item.message}
                  <div style={{ color: '#6b7280', marginTop: '2px' }}>{item.action}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Overall Stats */}
      <h2 style={{ fontSize: '18px', margin: '24px 0 12px', color: '#0d9488', borderBottom: '2px solid #0d9488', paddingBottom: '4px' }}>概览统计</h2>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', margin: '16px 0' }}>
        {[
          { label: '检查项总数', value: totalRecords.length, color: '#1a1a1a' },
          { label: '合格', value: totalPass, color: '#059669' },
          { label: '不合格', value: totalFail, color: '#dc2626' },
          { label: '问题整改', value: allLiveIssues.length, color: '#d97706' },
          { label: '食谱/功能问题', value: totalRecipePC, color: '#ea580c' },
        ].map((stat) => (
          <div key={stat.label} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px', textAlign: 'center', minWidth: '120px', flex: 1 }}>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Report sections with dividers */}
      {allReports.map((rpt, idx) => {
        const rptTask = rpt.content?.task as Record<string, unknown> | undefined;
        const rptPhase = rptTask?.project_phase as string | undefined;
        const rptDate = rptTask?.test_date as string | undefined;
        const rptType = rptTask?.project_type as string | undefined;
        return (
          <div key={rpt.id}>
            {/* Divider between reports */}
            {idx > 0 && (
              <div style={{ margin: '32px 0', borderTop: '2px dashed #0d9488', paddingTop: '12px' }}>
                <div style={{ fontSize: '16px', fontWeight: 600, color: '#0d9488', marginBottom: '4px' }}>
                  {rptPhase && <span style={{ display: 'inline-block', padding: '2px 8px', background: '#ccfbf1', borderRadius: '4px', fontSize: '12px', marginRight: '8px' }}>{rptPhase}</span>}
                  {rpt.title}
                  {rptDate && <span style={{ color: '#666', fontWeight: 400, marginLeft: '8px', fontSize: '12px' }}>({rptDate})</span>}
                </div>
                <div style={{ fontSize: '11px', color: '#888' }}>
                  以下为独立报告内容，与上方报告以分割线区分{rptType ? ` | 项目类型: ${rptType}` : ''}
                </div>
              </div>
            )}
            {/* First report header */}
            {idx === 0 && isMerged && (
              <div style={{ margin: '24px 0 12px' }}>
                <h2 style={{ fontSize: '18px', color: '#0d9488', borderBottom: '2px solid #0d9488', paddingBottom: '4px' }}>
                  {rptPhase && <span style={{ display: 'inline-block', padding: '2px 8px', background: '#ccfbf1', borderRadius: '4px', fontSize: '12px', marginRight: '8px' }}>{rptPhase}</span>}
                  {rpt.title}
                  {rptDate && <span style={{ color: '#666', fontWeight: 400, marginLeft: '8px', fontSize: '12px' }}>({rptDate})</span>}
                </h2>
              </div>
            )}
            {!isMerged && idx === 0 && (
              <h2 style={{ fontSize: '18px', margin: '24px 0 12px', color: '#0d9488', borderBottom: '2px solid #0d9488', paddingBottom: '4px' }}>{rpt.title}</h2>
            )}
            {detailModelsMap[rpt.id] && (
              <ReportPrintSectionBlocks sections={detailModelsMap[rpt.id].sections} />
            )}
            {(!detailModelsMap[rpt.id] || printParityMode) && (
              <div data-testid="print-legacy-content" data-display-weight={detailModelsMap[rpt.id] ? 'parity' : 'fallback'}>
                <PrintReportSection report={rpt} liveIssues={liveIssuesMap[rpt.id] || []} />
              </div>
            )}
          </div>
        );
      })}

      {/* Print-specific styles */}
      <style>{`
        @media print {
          body { margin: 0; padding: 0; }
          .print-status { display: none !important; }
          .print-container { padding: 20px !important; }
          .print-text-mode img, .print-text-mode video { display: none !important; }
          h2, h3 { page-break-after: avoid; }
          img { page-break-inside: avoid; max-width: 100%; }
        }
        .print-text-mode img, .print-text-mode video { display: none !important; }
        .print-container {
          background: #fff !important;
        }
        .print-container h1,
        .print-container h2,
        .print-container h3 {
          color: #111827 !important;
          border-color: #d1d5db !important;
          letter-spacing: 0 !important;
        }
        .print-container [style*="#f0fdfa"],
        .print-container [style*="#ccfbf1"] {
          background: #fff !important;
          border-color: #d1d5db !important;
          color: #111827 !important;
        }
        .print-container img,
        .print-container video {
          width: 72px !important;
          height: 72px !important;
          object-fit: cover !important;
        }
        .print-container [style*="width: 50px"] {
          width: 72px !important;
          height: 72px !important;
          border-radius: 6px !important;
        }
        @page { size: A4; margin: 20mm; }
      `}</style>
    </div>
    </>
  );
}
