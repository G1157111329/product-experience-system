import { NextRequest, NextResponse } from 'next/server';
import { and, count, desc, eq, ilike, inArray } from 'drizzle-orm';
import { getDb } from '@/storage/database/pg-db';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { standardItems, standards } from '@/storage/database/shared/schema';
import { isAuthResponse, requireAdmin, requireUser } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

function toApiStandard(
  standard: typeof standards.$inferSelect,
  itemCount = 0,
) {
  return {
    id: standard.id,
    standard_name: standard.standardName,
    category: standard.category,
    product_category: standard.productCategory,
    product: standard.product,
    version: standard.version,
    is_active: standard.isActive,
    description: standard.description,
    created_at: standard.createdAt,
    updated_at: standard.updatedAt,
    standard_items: [{ count: itemCount }],
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireUser(request, getSupabaseClient());
  if (isAuthResponse(auth)) return auth;

  const db = getDb();
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category')?.trim();
  const productCategory = searchParams.get('product_category')?.trim();
  const product = searchParams.get('product')?.trim();
  const keyword = searchParams.get('keyword')?.trim();

  const filters = [
    category ? eq(standards.category, category) : undefined,
    productCategory ? eq(standards.productCategory, productCategory) : undefined,
    product ? eq(standards.product, product) : undefined,
    keyword ? ilike(standards.standardName, `%${keyword}%`) : undefined,
  ].filter(Boolean);

  const rows = await db
    .select()
    .from(standards)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(standards.createdAt));

  if (rows.length === 0) {
    return NextResponse.json({ code: 0, message: 'success', data: [] });
  }

  const countRows = await db
    .select({
      standardId: standardItems.standardId,
      count: count(standardItems.id),
    })
    .from(standardItems)
    .where(inArray(standardItems.standardId, rows.map(row => row.id)))
    .groupBy(standardItems.standardId);

  const countsByStandardId = new Map(countRows.map(row => [row.standardId, row.count]));
  const data = rows.map(row => toApiStandard(row, countsByStandardId.get(row.id) || 0));

  return NextResponse.json({ code: 0, message: 'success', data });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request, getSupabaseClient());
  if (isAuthResponse(auth)) return auth;

  const db = getDb();
  const body = await request.json();

  if (!body.standard_name || !body.category) {
    return NextResponse.json({ code: 1, message: '缺少标准名称或分类' }, { status: 400 });
  }

  const [created] = await db.insert(standards).values({
    standardName: body.standard_name,
    category: body.category,
    productCategory: body.product_category || null,
    product: body.product || null,
    version: body.version || 'V1.0',
    description: body.description || null,
  }).returning();

  return NextResponse.json({ code: 0, message: '创建成功', data: toApiStandard(created) });
}
