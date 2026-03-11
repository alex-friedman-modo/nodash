import type { MetadataRoute } from "next";
import { getRestaurants } from "@/lib/db";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://nodash.nyc";

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${baseUrl}/about`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
  ];

  // Restaurant pages — get all direct delivery restaurants
  const { restaurants } = getRestaurants({ limit: 10000 });
  const restaurantPages: MetadataRoute.Sitemap = restaurants.map((r) => ({
    url: `${baseUrl}/restaurants/${encodeURIComponent(r.place_id)}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  return [...staticPages, ...restaurantPages];
}
