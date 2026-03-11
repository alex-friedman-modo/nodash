import { NextRequest, NextResponse } from "next/server";
import { getRestaurants } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const filters = {
    borough: searchParams.get("borough") || undefined,
    neighborhood: searchParams.get("neighborhood") || undefined,
    cuisine: searchParams.get("cuisine") || undefined,
    search: searchParams.get("search") || undefined,
    limit: searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : 50,
    offset: searchParams.get("offset") ? parseInt(searchParams.get("offset")!) : 0,
  };

  try {
    const result = getRestaurants(filters);
    return NextResponse.json(result);
  } catch (error) {
    console.error("DB error:", error);
    return NextResponse.json({ error: "Failed to fetch restaurants" }, { status: 500 });
  }
}
