/** Derive a human-readable cuisine label from primary_type */
export function formatCuisine(primaryType: string | null): string {
  if (!primaryType) return "Restaurant";
  return primaryType
    .replace(/_restaurant$/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Format price level for display */
export function formatPriceLevel(level: string | null): string | null {
  if (!level) return null;
  const map: Record<string, string> = {
    PRICE_LEVEL_FREE: "Free",
    PRICE_LEVEL_INEXPENSIVE: "$",
    PRICE_LEVEL_MODERATE: "$$",
    PRICE_LEVEL_EXPENSIVE: "$$$",
    PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
  };
  return map[level] || level;
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
  photo_url: string | null;
  delivery_menu: string | null;
  cuisine_label: string | null;
}
