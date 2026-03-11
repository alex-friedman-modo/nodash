import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { mockRestaurants } from "@/lib/mock-data";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const borough = searchParams.get("borough");
  const search = searchParams.get("search");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  // Try Supabase first, fall back to mock data
  if (supabaseAdmin) {
    try {
      let query = supabaseAdmin
        .from("restaurants")
        .select(
          "place_id, name, address, short_address, zip_code, neighborhood, borough, phone, website, lat, lng, rating, review_count, primary_type, delivery_fee, delivery_minimum, delivery_radius, ordering_method, online_order_url, editorial_summary, delivery_hours, direct_delivery"
        )
        .eq("direct_delivery", 1)
        .range(offset, offset + limit - 1);

      if (borough && borough !== "All") {
        query = query.eq("borough", borough);
      }

      if (search) {
        query = query.or(
          `name.ilike.%${search}%,neighborhood.ilike.%${search}%,short_address.ilike.%${search}%`
        );
      }

      query = query.order("review_count", { ascending: false, nullsFirst: false });

      const { data, error, count } = await query;

      if (error) throw error;

      return NextResponse.json({
        restaurants: data || [],
        total: count,
        limit,
        offset,
      });
    } catch {
      // Fall through to mock data
    }
  }

  // Mock data fallback
  let results = [...mockRestaurants];

  if (borough && borough !== "All") {
    results = results.filter((r) => r.borough === borough);
  }

  if (search) {
    const q = search.toLowerCase();
    results = results.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.neighborhood?.toLowerCase().includes(q) ?? false) ||
        (r.short_address?.toLowerCase().includes(q) ?? false)
    );
  }

  const total = results.length;
  results = results.slice(offset, offset + limit);

  return NextResponse.json({
    restaurants: results,
    total,
    limit,
    offset,
  });
}
