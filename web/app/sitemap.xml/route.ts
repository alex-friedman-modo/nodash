import { NextResponse } from "next/server";
import { getRestaurants } from "@/lib/db";

export const dynamic = "force-dynamic";

const BOROUGH_SLUGS = ["manhattan", "brooklyn", "queens", "bronx", "staten-island"];
const CUISINE_SLUGS = ["pizza", "chinese", "mexican", "japanese", "thai", "indian", "italian", "american", "halal", "deli"];

export async function GET() {
  const baseUrl = "https://nodash.nyc";

  // Static pages
  const staticUrls = [
    { loc: baseUrl, changefreq: "daily", priority: "1.0" },
    { loc: `${baseUrl}/about`, changefreq: "monthly", priority: "0.5" },
  ];

  // Borough pages
  const boroughUrls = BOROUGH_SLUGS.map((slug) => ({
    loc: `${baseUrl}/${slug}`,
    changefreq: "daily",
    priority: "0.9",
  }));

  // Cuisine pages
  const cuisineUrls = CUISINE_SLUGS.map((slug) => ({
    loc: `${baseUrl}/cuisine/${slug}`,
    changefreq: "daily",
    priority: "0.8",
  }));

  // Restaurant detail pages
  let restaurantUrls: { loc: string; changefreq: string; priority: string }[] = [];
  try {
    const { restaurants } = getRestaurants({ limit: 10000 });
    restaurantUrls = restaurants.map((r) => ({
      loc: `${baseUrl}/restaurants/${encodeURIComponent(r.place_id)}`,
      changefreq: "weekly",
      priority: "0.7",
    }));
  } catch {
    // DB not available at build time
  }

  const allUrls = [...staticUrls, ...boroughUrls, ...cuisineUrls, ...restaurantUrls];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>`;

  return new NextResponse(xml, {
    headers: { "Content-Type": "application/xml" },
  });
}
