import { NextResponse } from "next/server";
import { getRestaurants } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const baseUrl = "https://nodash.nyc";

  let restaurantUrls = "";
  try {
    const { restaurants } = getRestaurants({ limit: 10000 });
    restaurantUrls = restaurants
      .map(
        (r) => `  <url>
    <loc>${baseUrl}/restaurants/${encodeURIComponent(r.place_id)}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`
      )
      .join("\n");
  } catch {
    // DB not available at build time
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${baseUrl}/about</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
${restaurantUrls}
</urlset>`;

  return new NextResponse(xml, {
    headers: { "Content-Type": "application/xml" },
  });
}
