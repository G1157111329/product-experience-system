import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const sensory_dimension = searchParams.get('sensory_dimension');
  const test_phase = searchParams.get('test_phase');
  const experience_flow = searchParams.get('experience_flow');
  const check_dimension = searchParams.get('check_dimension');
  const category = searchParams.get('category');
  const product_category = searchParams.get('product_category');
  const keyword = searchParams.get('keyword');

  // First get matching standards
  // When product_category is specified, include:
  //   1. Standards with matching product_category (品类标准 etc.)
  //   2. Standards with null product_category (通用标准 applies to all products)
  let stdQuery = client.from('standards').select('id, standard_name, category, product_category');
  if (category) stdQuery = stdQuery.eq('category', category);
  if (product_category) {
    stdQuery = stdQuery.or(`product_category.eq.${product_category},product_category.is.null`);
  }

  const { data: standards, error: stdError } = await stdQuery;
  if (stdError) return NextResponse.json({ code: 1, message: stdError.message }, { status: 500 });

  if (!standards || standards.length === 0) {
    return NextResponse.json({ code: 0, message: 'success', data: [] });
  }

  const standardIds = standards.map(s => s.id);
  const standardMap = Object.fromEntries(standards.map(s => [s.id, s]));

  // Then get matching items from those standards
  let itemQuery = client
    .from('standard_items')
    .select('*')
    .in('standard_id', standardIds)
    .order('sort_order', { ascending: true });

  if (sensory_dimension) itemQuery = itemQuery.eq('sensory_dimension', sensory_dimension);
  if (test_phase) itemQuery = itemQuery.eq('test_phase', test_phase);
  if (experience_flow) itemQuery = itemQuery.eq('experience_flow', experience_flow);
  if (check_dimension) itemQuery = itemQuery.eq('check_dimension', check_dimension);
  if (keyword) itemQuery = itemQuery.ilike('check_item', `%${keyword}%`);

  const { data: items, error: itemError } = await itemQuery;
  if (itemError) return NextResponse.json({ code: 1, message: itemError.message }, { status: 500 });

  // Attach standard info to each item
  const result = (items || []).map(item => ({
    ...item,
    standard: standardMap[item.standard_id] || null,
  }));

  return NextResponse.json({ code: 0, message: 'success', data: result });
}
