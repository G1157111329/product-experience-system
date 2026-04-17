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
  id: string; sensory_dimension?: string; check_dimension?: string;
  check_item: string; evaluation_result: string; problem_description?: string;
  materials?: Material[];
  [key: string]: unknown;
}

interface ReportData {
  id: string; title: string; status: string; version: number;
  content: {
    task: Record<string, unknown>;
    records: CheckRecord[];
    issues: Array<Record<string, unknown>>;
    recipes: Recipe[];
    materials: Material[];
    generatedAt: string;
  } | null;
}

// Task field name mapping: English -> Chinese
const taskFieldLabels: Record<string, string> = {
  task_name: '任务名称',
  product_category: '产品品类',
  product_model: '产品型号',
  project_phase: '项目阶段',
  test_date: '测试日期',
  organizer: '组织人',
  target_user: '目标用户',
  test_purpose: '测试目的',
  test_method: '测试方法',
  status: '状态',
  assigned_to: '负责人',
  created_at: '创建时间',
  updated_at: '更新时间',
};

// Convert image URL to base64 for PDF embedding
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
    return url; // fallback to original URL
  }
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
  const [loading, setLoading] = useState(true);
  const [imagesLoaded, setImagesLoaded] = useState(false);

  useEffect(() => {
    if (!reportId) return;
    fetch(`/api/reports/${reportId}`).then(r => r.json()).then(res => {
      if (res.code === 0) setReport(res.data);
    }).finally(() => setLoading(false));
  }, [reportId]);

  // Convert all image URLs to base64 for PDF compatibility
  useEffect(() => {
    if (!report || !report.content) return;

    const convertImages = async () => {
      const content = report.content!;
      const allImageUrls: string[] = [];

      // Collect all image URLs
      content.records?.forEach(r => {
        (r as CheckRecord).materials?.forEach(m => {
          if (m.material_type === 'image') allImageUrls.push(m.file_url);
        });
      });
      content.recipes?.forEach(recipe => {
        recipe.recipe_steps?.forEach(step => {
          step.materials?.forEach(m => {
            if (m.material_type === 'image') allImageUrls.push(m.file_url);
          });
        });
      });
      content.materials?.forEach(m => {
        if (m.material_type === 'image') allImageUrls.push(m.file_url);
      });

      // Preload images
      await Promise.all(allImageUrls.map(async (url) => {
        try {
          const base64 = await imageUrlToBase64(url);
          // Replace URL in DOM after render
          const imgs = document.querySelectorAll(`img[src="${url}"]`);
          imgs.forEach(img => { (img as HTMLImageElement).src = base64; });
        } catch {
          // ignore failed conversions
        }
      }));

      setImagesLoaded(true);
    };

    // Wait for DOM to render first
    const timer = setTimeout(() => {
      convertImages();
    }, 500);

    return () => clearTimeout(timer);
  }, [report]);

  useEffect(() => {
    if (report && imagesLoaded) {
      const timer = setTimeout(() => {
        window.print();
      }, 800);
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

  const content = report.content;
  const task = content.task;
  const records = content.records || [];
  const issues = content.issues || [];
  const recipes = content.recipes || [];

  const passCount = records.filter((r) => r.evaluation_result === '合格').length;
  const failCount = records.filter((r) => r.evaluation_result === '不合格').length;

  return (
    <div className="print-container" style={{ padding: '40px', maxWidth: '1000px', margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif', color: '#1a1a1a', lineHeight: 1.6, fontSize: '14px' }}>
      {/* Title */}
      <h1 style={{ fontSize: '24px', marginBottom: '8px', color: '#0d9488' }}>{report.title}</h1>
      <div style={{ color: '#666', fontSize: '12px', marginBottom: '20px' }}>
        版本 V{report.version} | 状态: {report.status} | 生成时间: {content.generatedAt ? new Date(content.generatedAt).toLocaleString('zh-CN') : '-'}
      </div>

      {/* Stats */}
      <h2 style={{ fontSize: '18px', margin: '24px 0 12px', color: '#0d9488', borderBottom: '2px solid #0d9488', paddingBottom: '4px' }}>概览统计</h2>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', margin: '16px 0' }}>
        {[
          { label: '检查项总数', value: records.length, color: '#1a1a1a' },
          { label: '合格', value: passCount, color: '#059669' },
          { label: '不合格', value: failCount, color: '#dc2626' },
          { label: '问题数', value: issues.length, color: '#d97706' },
          { label: '食谱/功能', value: recipes.length, color: '#0d9488' },
        ].map((stat) => (
          <div key={stat.label} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px', textAlign: 'center', minWidth: '120px', flex: 1 }}>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Task Info - Chinese labels */}
      {task && (
        <>
          <h2 style={{ fontSize: '18px', margin: '24px 0 12px', color: '#0d9488', borderBottom: '2px solid #0d9488', paddingBottom: '4px' }}>任务信息</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', margin: '12px 0' }}>
            {Object.entries(task)
              .filter(([k]) => !['id', 'selected_standards'].includes(k))
              .map(([key, value]) => (
                <div key={key} style={{ fontSize: '13px', padding: '8px', background: '#f9fafb', borderRadius: '4px' }}>
                  <div style={{ color: '#666', fontSize: '11px', marginBottom: '2px' }}>{taskFieldLabels[key] || key}</div>
                  <div style={{ wordBreak: 'break-all' }}>{String(value || '-')}</div>
                </div>
              ))}
          </div>
        </>
      )}

      {/* Check Records - Card layout with per-record thumbnails */}
      <h2 style={{ fontSize: '18px', margin: '24px 0 12px', color: '#0d9488', borderBottom: '2px solid #0d9488', paddingBottom: '4px' }}>检查记录</h2>
      {records.length > 0 ? records.map((record) => {
        const recordMats = (record as CheckRecord).materials || [];
        const recordImages = recordMats.filter(m => m.material_type === 'image');
        const recordVideos = recordMats.filter(m => m.material_type === 'video');
        return (
          <div key={record.id} style={{ padding: '12px', margin: '6px 0', background: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{
                display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 500,
                background: record.evaluation_result === '合格' ? '#d1fae5' : record.evaluation_result === '不合格' ? '#fee2e2' : '#fef3c7',
                color: record.evaluation_result === '合格' ? '#065f46' : record.evaluation_result === '不合格' ? '#991b1b' : '#92400e'
              }}>
                {String(record.evaluation_result || '')}
              </span>
              <span style={{ fontWeight: 500, flex: 1 }}>{String(record.check_item || '')}</span>
              {record.sensory_dimension && <span style={{ fontSize: '11px', color: '#0c4a6e', background: '#e0f2fe', padding: '1px 6px', borderRadius: '3px' }}>{String(record.sensory_dimension)}</span>}
              {record.check_dimension && <span style={{ fontSize: '11px', color: '#666' }}>{String(record.check_dimension)}</span>}
            </div>
            {record.problem_description && <div style={{ color: '#666', fontSize: '12px', marginTop: '4px' }}>{String(record.problem_description)}</div>}
            {/* Per-record thumbnails */}
            {(recordImages.length > 0 || recordVideos.length > 0) && (
              <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                {recordImages.map((mat) => (
                  <img key={mat.id} src={mat.file_url} alt={mat.file_name} style={{ width: '60px', height: '60px', borderRadius: '4px', objectFit: 'cover', border: '1px solid #e5e7eb' }} crossOrigin="anonymous" />
                ))}
                {recordVideos.map((mat) => (
                  <div key={mat.id} style={{ width: '60px', height: '60px', borderRadius: '4px', background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', border: '1px solid #e5e7eb' }}>&#9654;</div>
                ))}
              </div>
            )}
          </div>
        );
      }) : <div style={{ textAlign: 'center', color: '#666', padding: '16px' }}>暂无记录</div>}

      {/* Recipes / Functions */}
      {recipes.length > 0 && (
        <>
          <h2 style={{ fontSize: '18px', margin: '24px 0 12px', color: '#0d9488', borderBottom: '2px solid #0d9488', paddingBottom: '4px' }}>食谱/功能列表</h2>
          {recipes.map((recipe) => (
            <div key={recipe.id} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px', margin: '8px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 500, background: '#e0f2fe', color: '#0c4a6e' }}>{recipe.recipe_type}</span>
                <span style={{ fontWeight: 600, fontSize: '14px' }}>{recipe.name}</span>
                <span style={{ color: '#666', fontSize: '12px', marginLeft: 'auto' }}>{recipe.recipe_steps?.length || 0} 步骤 | {recipe.problem_count || 0} 问题</span>
              </div>
              {recipe.ingredients && <div style={{ color: '#666', fontSize: '12px', marginBottom: '8px' }}>食材/参数: {recipe.ingredients}</div>}
              {recipe.recipe_steps && recipe.recipe_steps.length > 0 && (
                <div style={{ marginLeft: '8px' }}>
                  {recipe.recipe_steps.map((step) => {
                    const stepImages = (step.materials || []).filter(m => m.material_type === 'image');
                    return (
                      <div key={step.id} style={{ padding: '8px', margin: '4px 0', background: '#f9fafb', borderRadius: '4px' }}>
                        <div>
                          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', borderRadius: '50%', background: '#ccfbf1', color: '#0d9488', fontSize: '11px', fontWeight: 600, marginRight: '8px' }}>{step.step_number}</span>
                          {step.operation}
                        </div>
                        {step.problem_point && <div style={{ color: '#d97706', fontSize: '12px', marginLeft: '28px' }}>问题: {step.problem_point}</div>}
                        {stepImages.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px', marginLeft: '28px' }}>
                            {stepImages.map((mat) => (
                              <img key={mat.id} src={mat.file_url} alt={mat.file_name} style={{ width: '60px', height: '60px', borderRadius: '4px', objectFit: 'cover', border: '1px solid #e5e7eb' }} crossOrigin="anonymous" />
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

      {/* Issues */}
      {issues.length > 0 && (
        <>
          <h2 style={{ fontSize: '18px', margin: '24px 0 12px', color: '#0d9488', borderBottom: '2px solid #0d9488', paddingBottom: '4px' }}>问题清单</h2>
          {issues.map((issue, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', background: '#f9fafb', borderRadius: '4px', margin: '4px 0' }}>
              <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 500, background: issue.severity === '致命' ? '#fee2e2' : issue.severity === '严重' ? '#fef3c7' : '#e0f2fe', color: issue.severity === '致命' ? '#991b1b' : issue.severity === '严重' ? '#92400e' : '#0c4a6e' }}>{String(issue.severity || '')}</span>
              <span style={{ flex: 1 }}>{String(issue.title || '')}</span>
              <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 500, background: '#e0f2fe', color: '#0c4a6e' }}>{String(issue.status || '')}</span>
            </div>
          ))}
        </>
      )}

      {/* Print-specific styles */}
      <style>{`
        @media print {
          body { margin: 0; padding: 0; }
          .print-container { padding: 20px !important; }
          h2 { page-break-after: avoid; }
          img { page-break-inside: avoid; max-width: 100%; }
        }
        @page { size: A4; margin: 20mm; }
      `}</style>
    </div>
  );
}
