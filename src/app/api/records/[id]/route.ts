import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();
  const body = await request.json();

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const allowedFields = [
    'evaluation_result', 'problem_description', 'measurement_value',
    'tester', 'sort_order', 'sensory_dimension', 'test_phase',
    'check_dimension', 'sub_check_dimension', 'check_item', 'check_requirement', 'check_standard',
    'standard_category', 'experience_flow', 'touch_point', 'experience_standard',
    'check_tool', 'problem_level',
  ];

  for (const field of allowedFields) {
    if (body[field] !== undefined) updateData[field] = body[field];
  }

  const { data, error } = await client
    .from('check_records')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });

  // ── Sync corresponding issue if this is a record_fail ──
  // Find the record to get task_id and check_item for matching
  const updatedRecord = data as Record<string, unknown>;
  if (updatedRecord) {
    const taskId = updatedRecord.task_id as string;
    const checkItem = (updatedRecord.check_item as string) || '';
    const evaluationResult = updatedRecord.evaluation_result as string;
    const standardCategory = updatedRecord.standard_category as string;

    if (taskId && checkItem) {
      // Find matching issues by title (check_item) + source_type=record_fail + task_id
      const { data: matchingIssues } = await client
        .from('issues')
        .select('id, title, status, level')
        .eq('task_id', taskId)
        .eq('source_type', 'record_fail')
        .eq('title', checkItem);

      if (matchingIssues && matchingIssues.length > 0) {
        // Build issue update data
        const issueUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };

        // If evaluation_result changed to 合格, mark issue as 不整改 (resolved)
        if (evaluationResult === '合格') {
          issueUpdate.status = '已验证';
        } else if (evaluationResult === '不合格') {
          // If changed back to 不合格, ensure status is not 已验证
          for (const issue of matchingIssues) {
            if (issue.status === '已验证') {
              await client.from('issues').update({ status: '待整改', updated_at: new Date().toISOString() }).eq('id', issue.id);
            }
          }
        }

        // Update standard_category info in issue description if it changed
        if (standardCategory) {
          issueUpdate.source = `${standardCategory}问题`;
        }

        // Apply updates
        if (Object.keys(issueUpdate).length > 1) { // more than just updated_at
          for (const issue of matchingIssues) {
            if (evaluationResult !== '合格' && issue.status === '已验证') continue; // already handled above
            await client.from('issues').update(issueUpdate).eq('id', issue.id);
          }
        }
      }
    }
  }

  return NextResponse.json({ code: 0, message: '更新成功', data });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseClient();

  // Unlink materials associated with this record (don't delete them, just remove the association)
  await client.from('materials').update({ record_id: null }).eq('record_id', id);

  const { error } = await client.from('check_records').delete().eq('id', id);
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: '删除成功' });
}
