import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET: list categories with their products
export async function GET() {
  const client = getSupabaseClient();

  const { data: categories, error: catError } = await client
    .from('platform_categories')
    .select('id, name, sort_order')
    .order('sort_order', { ascending: true });

  if (catError) return NextResponse.json({ code: 1, message: catError.message }, { status: 500 });

  const { data: products, error: prodError } = await client
    .from('platform_products')
    .select('id, name, category_id, sort_order')
    .order('sort_order', { ascending: true });

  if (prodError) return NextResponse.json({ code: 1, message: prodError.message }, { status: 500 });

  // Attach products to categories
  const result = (categories || []).map(cat => ({
    ...cat,
    products: (products || []).filter(p => p.category_id === cat.id),
  }));

  return NextResponse.json({ code: 0, data: result });
}

// POST: add category or product
export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const body = await request.json();

  if (body.type === 'category') {
    const { name, sort_order } = body;
    if (!name) return NextResponse.json({ code: 1, message: '品类名称不能为空' });

    const { data, error } = await client
      .from('platform_categories')
      .insert({ name: name.trim(), sort_order: sort_order || 0 })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') return NextResponse.json({ code: 1, message: '该品类已存在' });
      return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
    }
    return NextResponse.json({ code: 0, data: { ...data, products: [] } });
  }

  if (body.type === 'product') {
    const { name, category_id, sort_order } = body;
    if (!name || !category_id) return NextResponse.json({ code: 1, message: '产品名称和品类不能为空' });

    const { data, error } = await client
      .from('platform_products')
      .insert({ name: name.trim(), category_id, sort_order: sort_order || 0 })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') return NextResponse.json({ code: 1, message: '该品类下已存在此产品' });
      return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
    }
    return NextResponse.json({ code: 0, data });
  }

  return NextResponse.json({ code: 1, message: '未知操作类型' });
}

// DELETE: remove category or product
export async function DELETE(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const id = searchParams.get('id');

  if (!id || !type) return NextResponse.json({ code: 1, message: '参数不完整' });

  if (type === 'category') {
    // Delete category and its products
    await client.from('platform_products').delete().eq('category_id', id);
    const { error } = await client.from('platform_categories').delete().eq('id', id);
    if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
    return NextResponse.json({ code: 0, message: '已删除' });
  }

  if (type === 'product') {
    const { error } = await client.from('platform_products').delete().eq('id', id);
    if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
    return NextResponse.json({ code: 0, message: '已删除' });
  }

  return NextResponse.json({ code: 1, message: '未知操作类型' });
}
