'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Video, Image as ImageIcon, Loader2 } from 'lucide-react';

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

interface ReportData {
  id: string; title: string; status: string; version: number;
  content: {
    task: Record<string, unknown>;
    records: Array<Record<string, unknown>>;
    issues: Array<Record<string, unknown>>;
    recipes: Recipe[];
    materials: Material[];
    generatedAt: string;
  } | null;
}

export default function ReportPrintPage() {
  const searchParams = useSearchParams();
  const reportId = searchParams.get('id');
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!reportId) return;
    fetch(`/api/reports/${reportId}`).then(r => r.json()).then(res => {
      if (res.code === 0) setReport(res.data);
    }).finally(() => setLoading(false));
  }, [reportId]);

  useEffect(() => {
    if (report && !loading) {
      // Auto-trigger print after content is loaded + small delay for images
      const timer = setTimeout(() => {
        window.print();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [report, loading]);

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
  const materials = content.materials || [];

  const passCount = records.filter((r) => r.evaluation_result === '合格').length;
  const failCount = records.filter((r) => r.evaluation_result === '不合格').length;
  const images = materials.filter((m) => m.material_type === 'image');
  const videos = materials.filter((m) => m.material_type === 'video');

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

      {/* Task Info */}
      {task && (
        <>
          <h2 style={{ fontSize: '18px', margin: '24px 0 12px', color: '#0d9488', borderBottom: '2px solid #0d9488', paddingBottom: '4px' }}>任务信息</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', margin: '12px 0' }}>
            {Object.entries(task).filter(([k]) => !['id', 'selected_standards'].includes(k)).map(([key, value]) => (
              <div key={key} style={{ fontSize: '13px' }}>
                <div style={{ color: '#666', fontSize: '11px' }}>{key}</div>
                <div>{String(value || '-')}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Recipes */}
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
                  {recipe.recipe_steps.map((step) => (
                    <div key={step.id} style={{ padding: '8px', margin: '4px 0', background: '#f9fafb', borderRadius: '4px' }}>
                      <div>
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', borderRadius: '50%', background: '#ccfbf1', color: '#0d9488', fontSize: '11px', fontWeight: 600, marginRight: '8px' }}>{step.step_number}</span>
                        {step.operation}
                      </div>
                      {step.problem_point && <div style={{ color: '#d97706', fontSize: '12px', marginLeft: '28px' }}>问题: {step.problem_point}</div>}
                      {step.materials && step.materials.filter(m => m.material_type === 'image').length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px', marginLeft: '28px' }}>
                          {step.materials.filter(m => m.material_type === 'image').map((mat) => (
                            <img key={mat.id} src={mat.file_url} alt={mat.file_name} style={{ width: '80px', height: '80px', borderRadius: '4px', objectFit: 'cover', border: '1px solid #e5e7eb' }} crossOrigin="anonymous" />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {/* Records Table */}
      <h2 style={{ fontSize: '18px', margin: '24px 0 12px', color: '#0d9488', borderBottom: '2px solid #0d9488', paddingBottom: '4px' }}>检查记录</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr>
            <th style={{ border: '1px solid #e5e7eb', padding: '8px 12px', textAlign: 'left', background: '#f3f4f6', fontWeight: 600, color: '#374151' }}>检查项</th>
            <th style={{ border: '1px solid #e5e7eb', padding: '8px 12px', textAlign: 'left', background: '#f3f4f6', fontWeight: 600, color: '#374151' }}>感官维度</th>
            <th style={{ border: '1px solid #e5e7eb', padding: '8px 12px', textAlign: 'left', background: '#f3f4f6', fontWeight: 600, color: '#374151' }}>检查维度</th>
            <th style={{ border: '1px solid #e5e7eb', padding: '8px 12px', textAlign: 'left', background: '#f3f4f6', fontWeight: 600, color: '#374151' }}>结果</th>
            <th style={{ border: '1px solid #e5e7eb', padding: '8px 12px', textAlign: 'left', background: '#f3f4f6', fontWeight: 600, color: '#374151' }}>问题描述</th>
          </tr>
        </thead>
        <tbody>
          {records.length > 0 ? records.map((record, idx) => (
            <tr key={idx}>
              <td style={{ border: '1px solid #e5e7eb', padding: '8px 12px' }}>{String(record.check_item || '')}</td>
              <td style={{ border: '1px solid #e5e7eb', padding: '8px 12px' }}>{String(record.sensory_dimension || '-')}</td>
              <td style={{ border: '1px solid #e5e7eb', padding: '8px 12px' }}>{String(record.check_dimension || '-')}</td>
              <td style={{ border: '1px solid #e5e7eb', padding: '8px 12px' }}>
                <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 500, background: record.evaluation_result === '合格' ? '#d1fae5' : record.evaluation_result === '不合格' ? '#fee2e2' : '#fef3c7', color: record.evaluation_result === '合格' ? '#065f46' : record.evaluation_result === '不合格' ? '#991b1b' : '#92400e' }}>{String(record.evaluation_result || '')}</span>
              </td>
              <td style={{ border: '1px solid #e5e7eb', padding: '8px 12px', color: '#666', fontSize: '12px' }}>{String(record.problem_description || '-')}</td>
            </tr>
          )) : (
            <tr><td colSpan={5} style={{ border: '1px solid #e5e7eb', padding: '16px', textAlign: 'center', color: '#666' }}>暂无记录</td></tr>
          )}
        </tbody>
      </table>

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

      {/* Material Appendix */}
      {(images.length > 0 || videos.length > 0) && (
        <>
          <div style={{ pageBreakBefore: 'always' }} />
          <h2 style={{ fontSize: '18px', margin: '24px 0 12px', color: '#0d9488', borderBottom: '2px solid #0d9488', paddingBottom: '4px' }}>附录 - 素材预览</h2>
          {images.length > 0 && (
            <div>
              <h3 style={{ fontSize: '15px', margin: '16px 0 8px', color: '#1a1a1a' }}>照片 ({images.length})</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', margin: '12px 0' }}>
                {images.map((mat) => (
                  <div key={mat.id} style={{ width: '120px', textAlign: 'center' }}>
                    <img src={mat.file_url} alt={mat.file_name} style={{ width: '120px', height: '120px', borderRadius: '4px', objectFit: 'cover', border: '1px solid #e5e7eb' }} crossOrigin="anonymous" />
                    <div style={{ fontSize: '10px', color: '#666', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mat.file_name}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {videos.length > 0 && (
            <div>
              <h3 style={{ fontSize: '15px', margin: '16px 0 8px', color: '#1a1a1a' }}>视频 ({videos.length})</h3>
              {videos.map((mat) => (
                <div key={mat.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', background: '#f9fafb', borderRadius: '4px', margin: '4px 0' }}>
                  <div style={{ width: '32px', height: '32px', background: '#e5e7eb', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>&#9654;</div>
                  <div>
                    <div style={{ fontSize: '13px' }}>{mat.file_name}</div>
                    <div style={{ color: '#666', fontSize: '11px' }}>{((mat.file_size || 0) / 1024 / 1024).toFixed(1)} MB</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Print-specific styles */}
      <style>{`
        @media print {
          body { margin: 0; padding: 0; }
          .print-container { padding: 20px !important; }
          h2 { page-break-after: avoid; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          img { page-break-inside: avoid; }
        }
        @page { size: A4; margin: 20mm; }
      `}</style>
    </div>
  );
}
