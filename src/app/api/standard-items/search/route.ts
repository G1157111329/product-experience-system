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
  const product = searchParams.get('product');
  const keyword = searchParams.get('keyword');

  // First get matching standards
  // When product_category is specified, include:
  //   1. Standards with matching product_category (品类标准 etc.)
  //   2. Standards with null product_category (通用标准 applies to all products)
  let stdQuery = client.from('standards').select('id, standard_name, category, product_category, product');
  if (category) stdQuery = stdQuery.eq('category', category);
  if (product_category) {
    stdQuery = stdQuery.or(`product_category.eq.${product_category},product_category.is.null`);
  }
  // When product is specified, also filter by product for 品类标准
  // This ensures 品类标准 matches the specific product, not just the category
  if (product) {
    // Standards matching the specific product OR with null product (generic)
    // Combined with category filter above
    // We need to get all standards matching category, then filter client-side by product
    // Actually, let's use a more precise query:
    // For 品类标准: must match product OR product is null (within the same category)
    // For 通用标准: product_category is null so they always match
  }

  const { data: standards, error: stdError } = await stdQuery;
  if (stdError) return NextResponse.json({ code: 1, message: stdError.message }, { status: 500 });

  if (!standards || standards.length === 0) {
    return NextResponse.json({ code: 0, message: 'success', data: [] });
  }

  // Filter by product if specified: keep standards that match product OR have no product
  let filteredStandards = standards;
  if (product) {
    filteredStandards = standards.filter(s => {
      // 通用标准 (no product_category) always matches
      if (!s.product_category) return true;
      // 品类标准: match if product matches or product is null
      if (!s.product) return true;
      return s.product === product;
    });
  }

  const standardIds = filteredStandards.map(s => s.id);
  if (standardIds.length === 0) {
    return NextResponse.json({ code: 0, message: 'success', data: [] });
  }

  const standardMap = Object.fromEntries(filteredStandards.map(s => [s.id, s]));

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
  if (keyword) {
    // Fuzzy search across multiple text fields
    const kw = `%${keyword}%`;
    itemQuery = itemQuery.or(`check_item.ilike.${kw},check_requirement.ilike.${kw},touch_point.ilike.${kw},experience_standard.ilike.${kw},check_standard.ilike.${kw}`);
  }

  const { data: items, error: itemError } = await itemQuery;
  if (itemError) return NextResponse.json({ code: 1, message: itemError.message }, { status: 500 });

  // Attach standard info to each item
  const result = (items || []).map(item => ({
    ...item,
    standard: standardMap[item.standard_id] || null,
  }));

  return NextResponse.json({ code: 0, message: 'success', data: result });
}
