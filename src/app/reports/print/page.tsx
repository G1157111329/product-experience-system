'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

interface Material {
  id: string; material_type: string; file_name: string; file_url: string; file_size: number;
}

interface RecipeStep {
  id: string; step_number: number; operation: string; problem_point: string | null;
  materials?: Material[];
}

interface Recipe {
  id: string; name: string; ingredients: string | null; recipe_type: string;
  problem_count: number; recipe_steps: RecipeStep[];
}

interface CheckRecord {
  id: string; sensory_dimension?: string; check_dimension?: string; sub_check_dimension?: string;
  check_item: string; check_requirement?: string; check_standard?: string;
  evaluation_result: string; problem_description?: string;
  materials?: Material[];
  [key: string]: unknown;
}

interface ReportContent {
  task: Record<string, unknown>;
  records: CheckRecord[];
  issues: Array<Record<string, unknown>>;
  recipes: Recipe[];
  materials: Material[];
  generatedAt: string;
}

interface ReportData {
  id: string; title: string; product_model: string | null; status: string; version: number;
  created_at: string;
  content: ReportContent | null;
}

const taskFieldLabels: Record<string, string> = {
  task_name: '任务名称', product_category: '产品品类', product_model: '产品型号',
  project_type: '项目类型', project_phase: '项目阶段',
  test_date: '测试日期', organizer: '组织人', target_user: '目标用户',
  test_purpose: '测试目的', test_method: '测试方法', status: '状态',
  assigned_to: '负责人', created_at: '创建时间', updated_at: '更新时间',
};

async function imageUrlToBase64(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return url;
  }
}

function PrintReportSection({ report }: { report: ReportData }) {
  const content = report.content;
  if (!content) return null;
  const task = content.task;
  const records = content.records || [];
  const issues = content.issues || [];
  const recipes = content.recipes || [];
  const passCount = records.filter(r => r.evaluation_result === '合格').length;
  const failCount = records.filter(r => r.evaluation_result === '不合格').length;
  const recipeProblemCount = recipes.reduce((s, r) => s + (r.problem_count || 0), 0);

  return (
    <>
      {/* Mini stats */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', margin: '8px 0 16px', fontSize: '12px', color: '#666' }}>
        <span>检查项 <strong style={{ color: '#1a1a1a' }}>{records.length}</strong></span>
        <span>合格 <strong style={{ color: '#059669' }}>{passCount}</strong></span>
        <span>不合格 <strong style={{ color: '#dc2626' }}>{failCount}</strong></span>
        <span>整改 <strong style={{ color: '#d97706' }}>{issues.length}</strong></span>
        <span>食谱问题 <strong style={{ color: '#ea580c' }}>{recipeProblemCount}</strong></span>
      </div>

      {/* Task Info */}
      {task && (
        <>
          <h3 style={{ fontSize: '15px', margin: '16px 0 8px', color: '#0d9488', borderBottom: '1px solid #0d9488', paddingBottom: '4px' }}>任务信息</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', margin: '8px 0' }}>
            {Object.entries(task)
              .filter(([k]) => !['id', 'selected_standards'].includes(k))
              .map(([key, value]) => (
                <div key={key} style={{ fontSize: '12px', padding: '6px', background: '#f9fafb', borderRadius: '4px' }}>
                  <div style={{ color: '#666', fontSize: '10px', marginBottom: '2px' }}>{taskFieldLabels[key] || key}</div>
                  <div style={{ wordBreak: 'break-all' }}>{String(value || '-')}</div>
                </div>
              ))}
          </div>
        </>
      )}

      {/* Check Records */}
      <h3 style={{ fontSize: '15px', margin: '16px 0 8px', color: '#0d9488', borderBottom: '1px solid #0d9488', paddingBottom: '4px' }}>检查记录 ({records.length})</h3>
      {records.length > 0 ? records.map((record) => {
        const recordMats = record.materials || [];
        const recordImages = recordMats.filter(m => m.material_type === 'image');
        const recordVideos = recordMats.filter(m => m.material_type === 'video');
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
            {(recordImages.length > 0 || recordVideos.length > 0) && (
              <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
                {recordImages.map(mat => (
                  <img key={mat.id} src={mat.file_url} alt={mat.file_name} style={{ width: '50px', height: '50px', borderRadius: '3px', objectFit: 'cover', border: '1px solid #e5e7eb' }} crossOrigin="anonymous" />
                ))}
                {recordVideos.map(mat => (
                  <div key={mat.id} style={{ width: '50px', height: '50px', borderRadius: '3px', background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', border: '1px solid #e5e7eb' }}>&#9654;</div>
                ))}
              </div>
            )}
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
                <span style={{ fontWeight: 600, fontSize: '13px' }}>{recipe.name}</span>
                <span style={{ color: '#666', fontSize: '11px', marginLeft: 'auto' }}>{recipe.recipe_steps?.length || 0} 步骤 | {recipe.problem_count || 0} 问题</span>
              </div>
              {recipe.recipe_steps?.map(step => {
                const stepImages = (step.materials || []).filter(m => m.material_type === 'image');
                return (
                  <div key={step.id} style={{ padding: '6px', margin: '3px 0', background: '#f9fafb', borderRadius: '3px' }}>
                    <div>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', borderRadius: '50%', background: '#ccfbf1', color: '#0d9488', fontSize: '10px', fontWeight: 600, marginRight: '6px' }}>{step.step_number}</span>
                      <span style={{ fontSize: '12px' }}>{step.operation}</span>
                    </div>
                    {step.problem_point && <div style={{ color: '#d97706', fontSize: '11px', marginLeft: '24px' }}>问题: {step.problem_point}</div>}
                    {stepImages.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px', marginLeft: '24px' }}>
                        {stepImages.map(mat => (
                          <img key={mat.id} src={mat.file_url} alt={mat.file_name} style={{ width: '50px', height: '50px', borderRadius: '3px', objectFit: 'cover', border: '1px solid #e5e7eb' }} crossOrigin="anonymous" />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </>
      )}

      {/* Issues */}
      {issues.length > 0 && (
        <>
          <h3 style={{ fontSize: '15px', margin: '16px 0 8px', color: '#0d9488', borderBottom: '1px solid #0d9488', paddingBottom: '4px' }}>问题清单 ({issues.length})</h3>
          {issues.map((issue, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px', background: '#f9fafb', borderRadius: '3px', margin: '3px 0', fontSize: '12px' }}>
              <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: '3px', fontSize: '10px', fontWeight: 500,
                background: issue.level === '一类' ? '#fee2e2' : issue.level === '二类' ? '#fef3c7' : '#e0f2fe',
                color: issue.level === '一类' ? '#991b1b' : issue.level === '二类' ? '#92400e' : '#0c4a6e'
              }}>{String(issue.level || '二类')}</span>
              <span style={{ flex: 1 }}>{String(issue.title || '')}</span>
              <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: '3px', fontSize: '10px', fontWeight: 500, background: '#e0f2fe', color: '#0c4a6e' }}>{String(issue.status || '')}</span>
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
  const [report, setReport] = useState<ReportData | null>(null);
  const [siblingReports, setSiblingReports] = useState<ReportData[]>([]);
  const [loading, setLoading] = useState(true);
  const [imagesLoaded, setImagesLoaded] = useState(false);

  useEffect(() => {
    if (!reportId) return;
    fetch(`/api/reports/${reportId}`).then(r => r.json()).then(async (res) => {
      if (res.code === 0) {
        const rpt = res.data as ReportData;
        setReport(rpt);
        // Fetch sibling reports for merging
        if (rpt.product_model) {
          const allRes = await fetch('/api/reports?limit=200');
          const allData = await allRes.json();
          const allReports: ReportData[] = Array.isArray(allData.data) ? allData.data : (allData.data?.list || []);
          const projectType = (rpt.content?.task as Record<string, unknown>)?.project_type as string;
          const shouldMerge = projectType === '自研' || projectType === '改型/降本/优化';
          if (shouldMerge) {
            const siblings = allReports.filter((r: ReportData) =>
              r.id !== rpt.id && r.product_model === rpt.product_model
            ).sort((a: ReportData, b: ReportData) => a.created_at.localeCompare(b.created_at));
            setSiblingReports(siblings);
          }
        }
      }
    }).finally(() => setLoading(false));
  }, [reportId]);

  // Convert images to base64
  useEffect(() => {
    if (!report) return;
    const convertImages = async () => {
      const allReports = [report, ...siblingReports];
      const allImageUrls: string[] = [];
      allReports.forEach(rpt => {
        if (!rpt.content) return;
        rpt.content.records?.forEach(r => {
          (r as CheckRecord).materials?.forEach(m => {
            if (m.material_type === 'image') allImageUrls.push(m.file_url);
          });
        });
        rpt.content.recipes?.forEach(recipe => {
          recipe.recipe_steps?.forEach(step => {
            step.materials?.forEach(m => {
              if (m.material_type === 'image') allImageUrls.push(m.file_url);
            });
          });
        });
        rpt.content.materials?.forEach(m => {
          if (m.material_type === 'image') allImageUrls.push(m.file_url);
        });
      });

      await Promise.all(allImageUrls.map(async (url) => {
        try {
          const base64 = await imageUrlToBase64(url);
          const imgs = document.querySelectorAll(`img[src="${url}"]`);
          imgs.forEach(img => { (img as HTMLImageElement).src = base64; });
        } catch { /* ignore */ }
      }));
      setImagesLoaded(true);
    };
    const timer = setTimeout(convertImages, 500);
    return () => clearTimeout(timer);
  }, [report, siblingReports]);

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

  if (!report || !report.content) {
    return <div className="p-8 text-center text-muted-foreground">报告不存在或内容为空</div>;
  }

  const task = report.content.task;
  const projectType = task?.project_type as string | undefined;
  const isMerged = siblingReports.length > 0;
  const allReports = isMerged ? [report, ...siblingReports] : [report];

  // Total stats
  const totalRecords = allReports.flatMap(r => r.content?.records || []);
  const totalIssues = allReports.flatMap(r => r.content?.issues || []);
  const totalRecipes = allReports.flatMap(r => r.content?.recipes || []);
  const totalPass = totalRecords.filter(r => r.evaluation_result === '合格').length;
  const totalFail = totalRecords.filter(r => r.evaluation_result === '不合格').length;
  const totalRecipePC = totalRecipes.reduce((s, r) => s + (r.problem_count || 0), 0);

  return (
    <div className="print-container" style={{ padding: '40px', maxWidth: '1000px', margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif', color: '#1a1a1a', lineHeight: 1.6, fontSize: '14px' }}>
      {/* Title */}
      <h1 style={{ fontSize: '24px', marginBottom: '8px', color: '#0d9488' }}>
        {report.product_model || report.title}
        {isMerged && <span style={{ fontSize: '14px', color: '#666', fontWeight: 400, marginLeft: '8px' }}>(合并 {allReports.length} 份报告)</span>}
      </h1>
      <div style={{ color: '#666', fontSize: '12px', marginBottom: '20px' }}>
        {projectType && <span>项目类型: {projectType} | </span>}
        版本 V{report.version} | 状态: {report.status} | 生成时间: {report.content.generatedAt ? new Date(report.content.generatedAt).toLocaleString('zh-CN') : '-'}
      </div>

      {/* Overall Stats */}
      <h2 style={{ fontSize: '18px', margin: '24px 0 12px', color: '#0d9488', borderBottom: '2px solid #0d9488', paddingBottom: '4px' }}>概览统计</h2>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', margin: '16px 0' }}>
        {[
          { label: '检查项总数', value: totalRecords.length, color: '#1a1a1a' },
          { label: '合格', value: totalPass, color: '#059669' },
          { label: '不合格', value: totalFail, color: '#dc2626' },
          { label: '问题整改', value: totalIssues.length, color: '#d97706' },
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
            <PrintReportSection report={rpt} />
          </div>
        );
      })}

      {/* Print-specific styles */}
      <style>{`
        @media print {
          body { margin: 0; padding: 0; }
          .print-container { padding: 20px !important; }
          h2, h3 { page-break-after: avoid; }
          img { page-break-inside: avoid; max-width: 100%; }
        }
        @page { size: A4; margin: 20mm; }
      `}</style>
    </div>
  );
}
