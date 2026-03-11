import Database from "better-sqlite3";
import path from "path";
import { formatCuisine } from "./formatters";
import type { Restaurant } from "./formatters";
import { NEIGHBORHOOD_ALIASES } from "./neighborhoods";
export type { Restaurant };
export { formatCuisine, formatOrderingMethod, formatPriceLevel } from "./formatters";

// Railway: persistent volume at /data, or fallback to local ../data/
const DB_PATH = process.env.DB_PATH || 
  (process.env.RAILWAY_ENVIRONMENT 
    ? "/data/restaurants.db" 
    : path.join(process.cwd(), "..", "data", "restaurants.db"));

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    try {
      _db = new Database(DB_PATH, { readonly: true });
    } catch (e) {
      throw new Error(`Cannot open database at ${DB_PATH}: ${e}`);
    }
  }
  return _db;
}

export interface RestaurantFilters {
  borough?: string;
  neighborhood?: string;
  cuisine?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export function getRestaurants(filters: RestaurantFilters = {}): {
  restaurants: Restaurant[];
  total: number;
} {
  const db = getDb();
  const conditions: string[] = ["direct_delivery = 1"];
  const params: (string | number)[] = [];

  if (filters.borough && filters.borough !== "All") {
    conditions.push("borough = ?");
    params.push(filters.borough);
  }

  if (filters.neighborhood) {
    conditions.push("neighborhood = ?");
    params.push(filters.neighborhood);
  }

  if (filters.cuisine) {
    conditions.push("cuisine_label = ?");
    params.push(filters.cuisine);
  }

  if (filters.search) {
    const searchLower = filters.search.toLowerCase().trim();

    // Check if this matches a neighborhood alias
    const aliasDistricts = NEIGHBORHOOD_ALIASES[searchLower];
    if (aliasDistricts && aliasDistricts.length > 0) {
      const placeholders = aliasDistricts.map(() => "?").join(", ");
      conditions.push(
        `(neighborhood IN (${placeholders}) OR name LIKE ? OR address LIKE ? OR zip_code = ?)`
      );
      params.push(...aliasDistricts, `%${filters.search}%`, `%${filters.search}%`, filters.search);
    } else {
      conditions.push("(name LIKE ? OR neighborhood LIKE ? OR address LIKE ? OR zip_code = ?)");
      params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`, filters.search);
    }
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters.limit || 50;
  const offset = filters.offset || 0;

  const countRow = db
    .prepare(`SELECT COUNT(*) as count FROM restaurants ${where}`)
    .get(...params) as { count: number };

  const restaurants = db
    .prepare(
      `SELECT place_id, name, address, short_address, phone, website,
              borough, neighborhood, zip_code, lat, lng, rating, review_count,
              price_level, primary_type, direct_delivery, delivery_fee, delivery_minimum,
              delivery_radius, delivery_hours, ordering_method, online_order_url,
              detected_platform, scrape_status, llm_confidence, serves_vegetarian,
              generative_summary, editorial_summary
       FROM restaurants ${where}
       ORDER BY
         CASE WHEN online_order_url IS NOT NULL THEN 0 ELSE 1 END,
         COALESCE(rating, 0) * MIN(COALESCE(review_count, 0), 500) DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as Restaurant[];

  return { restaurants, total: countRow.count };
}

export function getRestaurant(placeId: string): Restaurant | null {
  const db = getDb();
  return (
    (db
      .prepare(
        `SELECT place_id, name, address, short_address, phone, website,
                borough, neighborhood, zip_code, lat, lng, rating, review_count,
                price_level, primary_type, direct_delivery, delivery_fee, delivery_minimum,
                delivery_radius, delivery_hours, ordering_method, online_order_url,
                detected_platform, scrape_status, llm_confidence, serves_vegetarian,
                generative_summary, editorial_summary
         FROM restaurants WHERE place_id = ?`
      )
      .get(placeId) as Restaurant) || null
  );
}

export function getBoroughCounts(): Record<string, number> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT borough, COUNT(*) as count FROM restaurants
       WHERE direct_delivery = 1
       GROUP BY borough ORDER BY count DESC`
    )
    .all() as { borough: string; count: number }[];
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.borough] = row.count;
  }
  return counts;
}

export function getNeighborhoods(borough?: string): string[] {
  const db = getDb();
  const where = borough
    ? "WHERE direct_delivery = 1 AND borough = ?"
    : "WHERE direct_delivery = 1";
  const params = borough ? [borough] : [];
  const rows = db
    .prepare(
      `SELECT DISTINCT neighborhood FROM restaurants ${where}
       ORDER BY neighborhood`
    )
    .all(...params) as { neighborhood: string }[];
  return rows.map((r) => r.neighborhood).filter(Boolean);
}

export function getCuisineCounts(): { cuisine: string; label: string; count: number }[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT cuisine_label, COUNT(*) as count FROM restaurants
       WHERE direct_delivery = 1 AND cuisine_label IS NOT NULL
       GROUP BY cuisine_label
       ORDER BY count DESC
       LIMIT 12`
    )
    .all() as { cuisine_label: string; count: number }[];
  return rows.map((r) => ({
    cuisine: r.cuisine_label,
    label: r.cuisine_label,
    count: r.count,
  }));
}

export function getTotalDirectDelivery(): number {
  const db = getDb();
  const row = db
    .prepare("SELECT COUNT(*) as count FROM restaurants WHERE direct_delivery = 1")
    .get() as { count: number };
  return row.count;
}


