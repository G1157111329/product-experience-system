import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const product_category = searchParams.get('product_category');
  const keyword = searchParams.get('keyword');

  let query = client.from('standards').select('*, standard_items(count)').order('created_at', { ascending: false });

  if (category) query = query.eq('category', category);
  if (product_category) query = query.eq('product_category', product_category);
  if (keyword) query = query.ilike('standard_name', `%${keyword}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: 'success', data });
}

export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const body = await request.json();

  const { data, error } = await client.from('standards').insert({
    standard_name: body.standard_name,
    category: body.category,
    product_category: body.product_category || null,
    version: body.version || 'V1.0',
    description: body.description || null,
  }).select().single();

  if (error) return NextResponse.json({ code: 1, message: error.message }, { status: 500 });
  return NextResponse.json({ code: 0, message: '创建成功', data });
}
