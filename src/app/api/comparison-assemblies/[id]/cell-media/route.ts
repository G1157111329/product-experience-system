import { NextRequest, NextResponse } from 'next/server';
import { canAccessAssembly, isAuthResponse, requireUser } from '@/lib/server/auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * Batch media endpoint — eliminates the per-cell N+1 pattern.
 *
 * `comparison-workspace` previously fired one GET /api/comparison-cells/[id]/media
 * request per cell, each doing requireUser + canAccessAssembly + a materials query.
 * This endpoint does it all in a single request: one auth check at the assembly
 * level, one materials query scoped by comparison_assembly_id, grouped by cell_id.
 *
 * Mounted under /api/comparison-assemblies/[id]/cell-media (not under
 * comparison-cells/media) to avoid clashing with the [id] dynamic segment.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const { id: assemblyId } = await params;

  // Single assembly-level auth check (replaces N per-cell canAccessAssembly calls).
  const accessible = await canAccessAssembly(client, user, assemblyId);
  if (!accessible) {
    return NextResponse.json({ code: 1, message: '无权访问' }, { status: 403 });
  }

  // Single query: all materials for this assembly, ordered for stable grouping.
  // comparison_assembly_id is set on every cell-bound material at upload/assign time.
  const { data, error } = await client
    .from('materials')
    .select('*')
    .eq('comparison_assembly_id', assemblyId)
    .order('comparison_cell_id', { ascending: true })
    .order('media_display_order', { ascending: true });

  if (error) {
    return NextResponse.json({ code: 1, message: error.message || '查询失败' }, { status: 500 });
  }

  // Group materials by cell_id. Materials without a cell_id are dropped (shouldn't
  // happen for assembly-scoped rows, but guard anyway).
  const mediaByCell: Record<string, unknown[]> = {};
  for (const row of (data || []) as (Record<string, unknown> & { comparison_cell_id?: string | null })[]) {
    const cellId = row.comparison_cell_id;
    if (!cellId) continue;
    if (!mediaByCell[cellId]) mediaByCell[cellId] = [];
    mediaByCell[cellId].push(row);
  }

  return NextResponse.json({
    code: 0,
    message: 'success',
    data: { media_by_cell: mediaByCell },
  });
}
