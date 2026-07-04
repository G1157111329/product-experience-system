import { NextRequest, NextResponse } from "next/server";
import { isDictType, loadDictionary } from "@/lib/server/dictionaries";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ dictType: string }> },
) {
  const { dictType } = await params;
  if (!isDictType(dictType)) {
    return NextResponse.json(
      { code: 1, message: `unknown dictionary type: ${dictType}` },
      { status: 400 },
    );
  }
  try {
    const items = await loadDictionary(dictType);
    const firstCode = items[0]?.code ?? "";
    const etag = `"${dictType}-${items.length}-${Buffer.from(firstCode).toString("hex").slice(0, 16)}"`;
    return NextResponse.json(
      { code: 0, message: "success", data: { type: dictType, items } },
      {
        headers: {
          "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
          ETag: etag,
        },
      },
    );
  } catch (err) {
    return NextResponse.json(
      { code: 1, message: err instanceof Error ? err.message : "load dictionary failed" },
      { status: 500 },
    );
  }
}