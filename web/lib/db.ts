import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "..", "data", "restaurants.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH, { readonly: true });
  }
  return _db;
}

export interface Restaurant {
  place_id: string;
  name: string;
  address: string;
  short_address: string;
  phone: string | null;
  website: string | null;
  borough: string;
  neighborhood: string;
  zip_code: string;
  lat: number;
  lng: number;
  rating: number | null;
  review_count: number | null;
  price_level: string | null;
  primary_type: string | null;
  direct_delivery: number | null;
  delivery_fee: string | null;
  delivery_minimum: string | null;
  delivery_radius: string | null;
  delivery_hours: string | null;
  ordering_method: string | null;
  online_order_url: string | null;
  detected_platform: string | null;
  scrape_status: string | null;
  llm_confidence: string | null;
  serves_vegetarian: number | null;
  generative_summary: string | null;
  editorial_summary: string | null;
}

export interface RestaurantFilters {
  borough?: string;
  neighborhood?: string;
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

  if (filters.search) {
    conditions.push("name LIKE ?");
    params.push(`%${filters.search}%`);
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
       ORDER BY rating DESC NULLS LAST, review_count DESC NULLS LAST
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

export function getTotalDirectDelivery(): number {
  const db = getDb();
  const row = db
    .prepare("SELECT COUNT(*) as count FROM restaurants WHERE direct_delivery = 1")
    .get() as { count: number };
  return row.count;
}

/** Derive a human-readable cuisine label from primary_type */
export function formatCuisine(primaryType: string | null): string {
  if (!primaryType) return "Restaurant";
  return primaryType
    .replace(/_restaurant$/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Format ordering method for display */
export function formatOrderingMethod(method: string | null, platform: string | null): string {
  if (platform) {
    const platformNames: Record<string, string> = {
      toast: "Toast",
      chownow: "ChowNow",
      slice: "Slice",
      square: "Square",
      menufy: "Menufy",
      beyondmenu: "BeyondMenu",
      clover: "Clover",
      otter: "Otter",
      dine_online: "Dine.Online",
      sauce: "Sauce",
      foodbooking: "FoodBooking",
      owner: "Owner",
    };
    return platformNames[platform] || platform;
  }
  if (method === "phone") return "Phone";
  if (method === "website") return "Website";
  return method || "Direct";
}
