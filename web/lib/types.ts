export interface Restaurant {
  place_id: string;
  name: string;
  address: string | null;
  short_address: string | null;
  zip_code: string | null;
  neighborhood: string | null;
  borough: string | null;
  phone: string | null;
  website: string | null;
  lat: number | null;
  lng: number | null;
  rating: number | null;
  review_count: number | null;
  primary_type: string | null;
  delivery_fee: string | null;
  delivery_minimum: string | null;
  delivery_radius: string | null;
  ordering_method: string | null;
  online_order_url: string | null;
  editorial_summary: string | null;
  delivery_hours: string | null;
  direct_delivery: number;
}

export type Borough =
  | "All"
  | "Manhattan"
  | "Brooklyn"
  | "Queens"
  | "Bronx"
  | "Staten Island";

export const BOROUGHS: Borough[] = [
  "All",
  "Manhattan",
  "Brooklyn",
  "Queens",
  "Bronx",
  "Staten Island",
];

export function formatOrderingMethod(method: string | null): string {
  if (!method) return "Direct";
  const map: Record<string, string> = {
    phone: "Phone",
    website: "Website",
    slice: "Slice",
    toast: "Toast",
    chownow: "ChowNow",
    square: "Square",
    menufy: "Menufy",
    clover: "Clover",
    doordash_storefront: "DoorDash Storefront",
    dine_online: "Dine Online",
    beyondmenu: "BeyondMenu",
    sauce: "Sauce",
    foodbooking: "Foodbooking",
    netwaiter: "Netwaiter",
    otter: "Otter",
    ezCater: "ezCater",
    seamless: "Seamless",
    app: "App",
    menusifu: "Menusifu",
    other_platform: "Online",
  };
  return map[method] || method;
}

export function formatDeliveryFee(fee: string | null): string | null {
  if (!fee) return null;
  if (fee === "0" || fee === "free" || fee === "Free") return "Free delivery";
  if (fee === "varies") return "Fee varies";
  if (fee.startsWith("$")) return `${fee} delivery`;
  return `$${fee} delivery`;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
