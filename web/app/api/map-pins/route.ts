import { NextRequest, NextResponse } from "next/server";
import { getMapPins } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const borough = searchParams.get("borough") || undefined;
  const cuisine = searchParams.get("cuisine") || undefined;
  const search = searchParams.get("search") || undefined;

  const pins = getMapPins({ borough, cuisine, search });

  return NextResponse.json(
    { pins },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    }
  );
}
