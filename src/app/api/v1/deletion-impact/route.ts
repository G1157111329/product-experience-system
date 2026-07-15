import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireUser, isAuthResponse } from '@/lib/server/auth';
import { fail, ok } from '@/lib/server/api-v1/response';
import { resolveTraceId } from '@/lib/server/api-v1/trace';
import {
  DeletionImpactAccessError,
  getDeletionImpact,
  type DeletionImpactKind,
} from '@/lib/server/deletion-impact';

export const dynamic = 'force-dynamic';

const KINDS = new Set<DeletionImpactKind>([
  'record',
  'comparison_section',
  'comparison_item',
  'recipe',
]);

export async function GET(request: NextRequest) {
  const traceId = resolveTraceId(request.headers);
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) {
    return fail(traceId, { message: 'unauthorized', status: 401 });
  }

  const url = new URL(request.url);
  const kind = url.searchParams.get('kind') as DeletionImpactKind | null;
  const id = url.searchParams.get('id')?.trim() ?? '';
  if (!kind || !KINDS.has(kind) || !id) {
    return fail(traceId, { message: 'kind and id are required', status: 400 });
  }

  try {
    const data = await getDeletionImpact({ kind, id, actorId: user.id });
    return ok(data, traceId);
  } catch (error) {
    if (error instanceof DeletionImpactAccessError) {
      return fail(traceId, {
        message: error.message,
        status: error.code === 'forbidden' ? 403 : 404,
      });
    }
    console.error(`[deletion-impact] trace=${traceId} projection failed`, error);
    return fail(traceId, { message: 'failed to load deletion impact', status: 500 });
  }
}
