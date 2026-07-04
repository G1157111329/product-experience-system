import { NextResponse } from "next/server";
import { loadAllDictionaries, DICT_TYPES } from "@/lib/server/dictionaries";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const dict = await loadAllDictionaries();
    return NextResponse.json(
      { code: 0, message: "success", data: { types: DICT_TYPES, dictionaries: dict } },
      {
        headers: {
          "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  } catch (err) {
    return NextResponse.json(
      { code: 1, message: err instanceof Error ? err.message : "load dictionaries failed" },
      { status: 500 },
    );
  }
}