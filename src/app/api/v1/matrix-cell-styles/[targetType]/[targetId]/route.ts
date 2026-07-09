/**
 * PUT /api/v1/matrix-cell-styles/{targetType}/{targetId}
 * PRD V3.1.2.4 §8.8 / §13.8 — Upsert a cell/column/narrative style.
 *
 * Body: { matrixId, fontColorToken?, fontSizeToken?, bold?, italic? }
 * Safe token whitelist enforced by DB CHECK constraints. No raw CSS allowed.
 */
import { NextRequest } from 'next/server';
import { getDb } from '@/storage/database/pg-db';
import { sql } from 'drizzle-orm';
import { matrixCellStyles } from '@/storage/database/shared/schema';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireUser, isAuthResponse } from '@/lib/server/auth';
import { ok, fail } from '@/lib/server/api-v1/response';
import { resolveTraceId } from '@/lib/server/api-v1/trace';

export const dynamic = 'force-dynamic';

const VALID_TARGET_TYPES = new Set(['column_header', 'cell', 'narrative_block']);
const VALID_FONT_SIZE_TOKENS = new Set(['xs', 'sm', 'md', 'lg', 'xl']);
const VALID_FONT_COLOR_TOKENS = new Set([
  'font_color_default',
  'font_color_red',
  'font_color_orange',
  'font_color_blue',
]);

type StyleBody = {
  matrixId?: string;
  fontColorToken?: string | null;
  fontSizeToken?: string | null;
  bold?: boolean;
  italic?: boolean;
  // PRD snake_case aliases
  matrix_id?: string;
  font_color_token?: string | null;
  font_size_token?: string | null;
};

function normalizeStyleBody(raw: StyleBody) {
  return {
    matrixId: raw.matrixId || raw.matrix_id,
    fontColorToken:
      raw.fontColorToken !== undefined
        ? raw.fontColorToken
        : raw.font_color_token !== undefined
          ? raw.font_color_token
          : undefined,
    fontSizeToken:
      raw.fontSizeToken !== undefined
        ? raw.fontSizeToken
        : raw.font_size_token !== undefined
          ? raw.font_size_token
          : undefined,
    bold: raw.bold,
    italic: raw.italic,
  };
}

async function upsertStyle(
  req: NextRequest,
  targetType: string,
  targetId: string,
) {
  const traceId = resolveTraceId(req.headers);

  if (!VALID_TARGET_TYPES.has(targetType)) {
    return fail(traceId, { message: `targetType 无效: ${targetType}`, status: 400 });
  }

  const client = getSupabaseClient();
  const user = await requireUser(req, client);
  if (isAuthResponse(user)) return fail(traceId, { message: '未认证', status: 401 });

  let raw: StyleBody;
  try {
    raw = await req.json();
  } catch {
    return fail(traceId, { message: '请求体不是合法 JSON', status: 400 });
  }

  const body = normalizeStyleBody(raw);
  if (!body.matrixId) {
    return fail(traceId, { message: 'matrixId 必填', status: 400 });
  }
  if (body.fontSizeToken && !VALID_FONT_SIZE_TOKENS.has(body.fontSizeToken)) {
    return fail(traceId, { message: `fontSizeToken 无效: ${body.fontSizeToken}`, status: 400 });
  }
  if (body.fontColorToken && !VALID_FONT_COLOR_TOKENS.has(body.fontColorToken)) {
    return fail(traceId, { message: `fontColorToken 无效: ${body.fontColorToken}`, status: 400 });
  }

  try {
    const db = await getDb();

    const [style] = await db
      .insert(matrixCellStyles)
      .values({
        matrixId: body.matrixId,
        targetType,
        targetId,
        fontColorToken: body.fontColorToken ?? null,
        fontSizeToken: body.fontSizeToken ?? null,
        bold: body.bold === true,
        italic: body.italic === true,
        updatedBy: user.id,
      })
      .onConflictDoUpdate({
        target: [matrixCellStyles.matrixId, matrixCellStyles.targetType, matrixCellStyles.targetId],
        set: {
          fontColorToken: body.fontColorToken ?? null,
          fontSizeToken: body.fontSizeToken ?? null,
          bold: body.bold === true,
          italic: body.italic === true,
          updatedBy: user.id,
          updatedAt: sql`NOW()`,
        },
      })
      .returning()
      .execute();

    return ok(style, traceId);
  } catch (err) {
    const message = err instanceof Error ? err.message : '保存失败';
    return fail(traceId, { message, status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ targetType: string; targetId: string }> },
) {
  const { targetType, targetId } = await params;
  return upsertStyle(req, targetType, targetId);
}

/** PRD §13.8 documents PATCH; keep PUT for existing clients. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ targetType: string; targetId: string }> },
) {
  const { targetType, targetId } = await params;
  return upsertStyle(req, targetType, targetId);
}
