import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { canAccessAssembly, isAuthResponse, requireUser } from '@/lib/server/auth';

type MatrixRow = Record<string, unknown>;

function asRows(value: unknown): MatrixRow[] {
  return Array.isArray(value) ? (value as MatrixRow[]) : [];
}

function isMatrixNode(node: MatrixRow) {
  return node.node_type !== 'section';
}

function cellKey(itemNodeId: unknown, objectId: unknown) {
  return `${String(itemNodeId)}::${String(objectId)}`;
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

function buildMissingCells(assemblyId: string, objects: MatrixRow[], itemNodes: MatrixRow[], cells: MatrixRow[]) {
  const existing = new Set(cells.map((cell) => cellKey(cell.item_node_id, cell.object_id)));
  const missing: MatrixRow[] = [];

  for (const node of itemNodes.filter(isMatrixNode)) {
    if (!node.id) continue;
    for (const object of objects) {
      if (!object.id) continue;
      const key = cellKey(node.id, object.id);
      if (existing.has(key)) continue;
      missing.push({
        assembly_id: assemblyId,
        item_node_id: node.id,
        object_id: object.id,
        params: {},
        process_notes: [],
        problem_points: [],
        metric_values: {},
        media_display_config: {},
      });
    }
  }

  return missing;
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

  const missingCells = buildMissingCells(assemblyId, matrix.objects, matrix.itemNodes, matrix.cells);
  return NextResponse.json({
    code: 0,
    message: 'success',
    data: {
      assembly: matrix.assembly,
      objects: matrix.objects,
      item_nodes: matrix.itemNodes,
      cells: matrix.cells,
      missing_cells: missingCells,
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

  const missingCells = buildMissingCells(assemblyId, matrix.objects, matrix.itemNodes, matrix.cells);
  if (missingCells.length === 0) {
    return NextResponse.json({
      code: 0,
      message: '矩阵单元格已完整',
      data: { created_count: 0, cells: matrix.cells },
    });
  }

  const { data, error } = await client
    .from('comparison_matrix_cells')
    .insert(missingCells)
    .select();
  if (error) {
    return NextResponse.json({ code: 1, message: error.message || '补齐矩阵单元格失败' }, { status: 500 });
  }

  return NextResponse.json({
    code: 0,
    message: '矩阵单元格已补齐',
    data: {
      created_count: missingCells.length,
      cells: [...matrix.cells, ...asRows(data)],
    },
  });
}
