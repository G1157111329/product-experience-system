import { NextRequest, NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/storage/database/pg-db';
import { standardItems, standards } from '@/storage/database/shared/schema';

export const dynamic = 'force-dynamic';

function toApiItem(item: typeof standardItems.$inferSelect) {
  return {
    id: item.id,
    standard_id: item.standardId,
    sort_order: item.sortOrder,
    sensory_dimension: item.sensoryDimension,
    test_phase: item.testPhase,
    experience_flow: item.experienceFlow,
    touch_point: item.touchPoint,
    check_dimension: item.checkDimension,
    sub_check_dimension: item.subCheckDimension,
    check_item: item.checkItem,
    check_requirement: item.checkRequirement,
    experience_standard: item.experienceStandard,
    check_standard: item.checkStandard,
    measurement_position: item.measurementPosition,
    check_tool: item.checkTool,
    standard_a: item.standardA,
    standard_b: item.standardB,
    standard_c: item.standardC,
    problem_level: item.problemLevel,
    evaluation_prep: item.evaluationPrep,
    subjective_score: item.subjectiveScore,
    subjective_rating: item.subjectiveRating,
    reference_images: item.referenceImages,
    created_at: item.createdAt,
  };
}

function toApiStandard(
  standard: typeof standards.$inferSelect,
  items: Array<typeof standardItems.$inferSelect> = [],
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
    standard_items: items.map(toApiItem),
  };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const [standard] = await db
    .select()
    .from(standards)
    .where(eq(standards.id, id))
    .limit(1);

  if (!standard) {
    return NextResponse.json({ code: 1, message: '标准不存在' }, { status: 404 });
  }

  const items = await db
    .select()
    .from(standardItems)
    .where(eq(standardItems.standardId, id))
    .orderBy(asc(standardItems.sortOrder), asc(standardItems.createdAt));

  return NextResponse.json({ code: 0, message: 'success', data: toApiStandard(standard, items) });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const body = await request.json();

  const [updated] = await db
    .update(standards)
    .set({
      standardName: body.standard_name,
      category: body.category,
      productCategory: body.product_category || null,
      product: body.product || null,
      version: body.version,
      description: body.description,
      isActive: body.is_active,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(standards.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ code: 1, message: '标准不存在' }, { status: 404 });
  }

  return NextResponse.json({ code: 0, message: '更新成功', data: toApiStandard(updated) });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  await db.delete(standards).where(eq(standards.id, id));

  return NextResponse.json({ code: 0, message: '删除成功' });
}
