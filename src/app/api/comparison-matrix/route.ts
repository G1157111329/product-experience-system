import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessAssembly, isAuthResponse, requireUser } from '@/lib/server/auth';
import {
  buildMissingComparisonCells,
  ensureComparisonMatrixCells,
} from '@/lib/server/comparison-matrix-cells';

type MatrixRow = Record<string, unknown>;

function asRows(value: unknown): MatrixRow[] {
  return Array.isArray(value) ? (value as MatrixRow[]) : [];
}

async function loadMatrix(client: ReturnType<typeof getSupabaseClient>, assemblyId: string) {
  const [
    assemblyResult,
    objectsResult,
    nodesResult,
    cellsResult,
  ] = await Promise.all([
    client.from('comparison_assemblies').select('*').eq('id', assemblyId).maybeSingle(),
    client.from('comparison_objects').select('*').eq('assembly_id', assemblyId).order('sort_order', { ascending: true }),
    client.from('comparison_item_nodes').select('*').eq('assembly_id', assemblyId).order('sort_order', { ascending: true }),
    client.from('comparison_matrix_cells').select('*').eq('assembly_id', assemblyId),
  ]);

  return {
    assembly: assemblyResult.data,
    objects: asRows(objectsResult.data),
    itemNodes: asRows(nodesResult.data),
    cells: asRows(cellsResult.data),
    error: assemblyResult.error || objectsResult.error || nodesResult.error || cellsResult.error,
  };
}

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const assemblyId = request.nextUrl.searchParams.get('assembly_id');
  if (!assemblyId) {
    return NextResponse.json({ code: 1, message: '请提供 assembly_id' }, { status: 400 });
  }

  const accessible = await canAccessAssembly(client, user, assemblyId);
  if (!accessible) {
    return NextResponse.json({ code: 1, message: '无权访问' }, { status: 403 });
  }

  const matrix = await loadMatrix(client, assemblyId);
  if (matrix.error) {
    return NextResponse.json({ code: 1, message: matrix.error.message || '查询失败' }, { status: 500 });
  }
  if (!matrix.assembly) {
    return NextResponse.json({ code: 1, message: '未找到对比组装' }, { status: 404 });
  }

  // PRD §10.1 — auto-heal any missing cells on read so the UI is always editable.
  const missingCells = buildMissingComparisonCells(
    assemblyId,
    matrix.objects,
    matrix.itemNodes,
    matrix.cells,
  );
  let cells = matrix.cells;
  if (missingCells.length > 0) {
    const ensured = await ensureComparisonMatrixCells(client, assemblyId);
    if (ensured.error) {
      return NextResponse.json({ code: 1, message: ensured.error }, { status: 500 });
    }
    if (ensured.created.length > 0) {
      const refreshed = await loadMatrix(client, assemblyId);
      if (refreshed.error) {
        return NextResponse.json({ code: 1, message: refreshed.error.message || '查询失败' }, { status: 500 });
      }
      cells = refreshed.cells;
    }
  }

  return NextResponse.json({
    code: 0,
    message: 'success',
    data: {
      assembly: matrix.assembly,
      objects: matrix.objects,
      item_nodes: matrix.itemNodes,
      cells,
      missing_cells: [],
    },
  });
}

export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return user;

  const body = await request.json().catch(() => ({}));
  const assemblyId = typeof body.assembly_id === 'string'
    ? body.assembly_id
    : request.nextUrl.searchParams.get('assembly_id');
  if (!assemblyId) {
    return NextResponse.json({ code: 1, message: '请提供 assembly_id' }, { status: 400 });
  }

  const accessible = await canAccessAssembly(client, user, assemblyId);
  if (!accessible) {
    return NextResponse.json({ code: 1, message: '无权访问' }, { status: 403 });
  }

  const matrix = await loadMatrix(client, assemblyId);
  if (matrix.error) {
    return NextResponse.json({ code: 1, message: matrix.error.message || '查询失败' }, { status: 500 });
  }
  if (!matrix.assembly) {
    return NextResponse.json({ code: 1, message: '未找到对比组装' }, { status: 404 });
  }

  const ensured = await ensureComparisonMatrixCells(client, assemblyId);
  if (ensured.error) {
    return NextResponse.json({ code: 1, message: ensured.error }, { status: 500 });
  }

  return NextResponse.json({
    code: 0,
    message: ensured.created.length === 0 ? '矩阵单元格已完整' : '矩阵单元格已补齐',
    data: {
      created_count: ensured.created.length,
      cells: [...matrix.cells, ...ensured.created],
    },
  });
}
