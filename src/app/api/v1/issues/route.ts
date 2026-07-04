/**
 * V3.1 §17 — Example v1 endpoint. Mirrors the legacy `/api/issues` GET but
 * returns the v1 envelope `{ code, message, data, trace_id }` and threads the
 * trace id into the underlying query.
 *
 * This is the reference shape for all future v1 routes. Repository calls go
 * through `withTrace` so errors get a 500 + trace_id without leaking stack
 * traces to the client.
 */

import { NextRequest } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { requireUser, isAuthResponse, forbidden } from "@/lib/server/auth";
import { ok, unauthorized, fail, withTrace } from "@/lib/server/api-v1/response";

export const dynamic = "force-dynamic";

type IssueRow = {
  id: string;
  title: string;
  status: string;
  level: string | null;
  task_id: string;
  created_at: string;
};

export const GET = withTrace<[NextRequest]>(async (traceId, request) => {
  const client = getSupabaseClient();
  const user = await requireUser(request, client);
  if (isAuthResponse(user)) return unauthorized(traceId, "unauthorized");
  if (!user) return forbidden(traceId);

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || 50), 200);
  const offset = Math.max(Number(url.searchParams.get("offset") || 0), 0);

  const { data, error } = await client
    .from("issues")
    .select("id, title, status, level, task_id, created_at")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return fail(traceId, { message: error.message, status: 500 });
  }

  return ok<{ items: IssueRow[]; limit: number; offset: number }>(
    { items: (data as IssueRow[]) ?? [], limit, offset },
    traceId,
  );
});