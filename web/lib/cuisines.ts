/**
 * Cuisine type mapping for nodash restaurants.
 *
 * Maps raw Google Places `primary_type` values to clean display labels,
 * groups related types, and provides a ranked list of top cuisines.
 */

/** Raw Google primary_type → display label */
export const CUISINE_MAP: Record<string, string> = {
  // Pizza (891 total)
  pizza_restaurant: "Pizza",
  pizza_delivery: "Pizza",

  // Mexican (380 total)
  mexican_restaurant: "Mexican",
  taco_restaurant: "Mexican",
  burrito_restaurant: "Mexican",
  tex_mex_restaurant: "Tex-Mex",

  // Chinese (353 total)
  chinese_restaurant: "Chinese",
  chinese_noodle_restaurant: "Chinese",
  cantonese_restaurant: "Chinese",
  dim_sum_restaurant: "Chinese",

  // Thai
  thai_restaurant: "Thai",

  // Japanese (303 total)
  japanese_restaurant: "Japanese",
  sushi_restaurant: "Japanese",
  ramen_restaurant: "Japanese",
  japanese_izakaya_restaurant: "Japanese",

  // Indian (148 total)
  indian_restaurant: "Indian",
  south_indian_restaurant: "Indian",
  north_indian_restaurant: "Indian",

  // Italian
  italian_restaurant: "Italian",

  // Halal
  halal_restaurant: "Halal",

  // American (94 total)
  american_restaurant: "American",
  hamburger_restaurant: "American",
  hot_dog_restaurant: "American",
  soul_food_restaurant: "American",
  diner: "American",

  // Chicken
  chicken_restaurant: "Chicken",
  chicken_wings_restaurant: "Chicken",

  // Caribbean
  caribbean_restaurant: "Caribbean",

  // Deli / Sandwich (25 total)
  deli: "Deli",
  sandwich_shop: "Deli",
  bagel_shop: "Deli",

  // Seafood
  seafood_restaurant: "Seafood",

  // Asian Fusion / Pan-Asian (26 total)
  asian_fusion_restaurant: "Asian",
  asian_restaurant: "Asian",

  // Latin American (20 total)
  latin_american_restaurant: "Latin American",
  colombian_restaurant: "Latin American",
  peruvian_restaurant: "Latin American",
  cuban_restaurant: "Latin American",
  brazilian_restaurant: "Latin American",

  // Mediterranean (21 total)
  mediterranean_restaurant: "Mediterranean",
  greek_restaurant: "Mediterranean",

  // Korean
  korean_restaurant: "Korean",

  // Vietnamese
  vietnamese_restaurant: "Vietnamese",

  // Turkish
  turkish_restaurant: "Turkish",

  // Pakistani / Bangladeshi (17 total)
  pakistani_restaurant: "Pakistani",
  bangladeshi_restaurant: "Pakistani",

  // BBQ
  barbecue_restaurant: "BBQ",
  bar_and_grill: "BBQ",

  // Middle Eastern (13 total)
  middle_eastern_restaurant: "Middle Eastern",
  lebanese_restaurant: "Middle Eastern",
  falafel_restaurant: "Middle Eastern",
  persian_restaurant: "Middle Eastern",
  gyro_restaurant: "Middle Eastern",

  // Dumpling
  dumpling_restaurant: "Dumplings",
  hot_pot_restaurant: "Dumplings",

  // Vegan / Vegetarian (8 total)
  vegan_restaurant: "Vegan",
  vegetarian_restaurant: "Vegan",

  // Salad
  salad_shop: "Salad",

  // Malaysian
  malaysian_restaurant: "Malaysian",

  // Eastern European (6 total)
  eastern_european_restaurant: "Eastern European",
  ukrainian_restaurant: "Eastern European",

  // Hawaiian
  hawaiian_restaurant: "Hawaiian",

  // Fusion
  fusion_restaurant: "Fusion",

  // Dessert (5 total)
  dessert_restaurant: "Dessert",
  dessert_shop: "Dessert",

  // Ethiopian
  ethiopian_restaurant: "Ethiopian",

  // Cajun
  cajun_restaurant: "Cajun",

  // Spanish
  spanish_restaurant: "Spanish",

  // African
  african_restaurant: "African",

  // Moroccan
  moroccan_restaurant: "Moroccan",

  // Sri Lankan
  sri_lankan_restaurant: "Sri Lankan",

  // Tibetan
  tibetan_restaurant: "Tibetan",

  // Burmese
  burmese_restaurant: "Burmese",

  // Belgian
  belgian_restaurant: "Belgian",

  // Steak
  steak_house: "Steakhouse",

  // Noodle
  noodle_shop: "Noodles",

  // Gastropub / Bistro / Bar
  gastropub: "Gastropub",
  bistro: "Bistro",

  // --- Excluded / too generic (mapped to null via EXCLUDED_TYPES) ---
  // restaurant, meal_takeaway, fast_food_restaurant, meal_delivery,
  // cafe, bar, food_court, food, grocery_store, supermarket, bakery,
  // catering_service, asian_grocery_store, wholesaler, tea_house,
  // juice_shop, ice_cream_shop, hypermarket, manufacturer,
  // hookah_bar, confectionery, coffee_shop, cocktail_bar
};

/** Types that are too generic or not cuisines — excluded from filtering */
export const EXCLUDED_TYPES: string[] = [
  "restaurant",
  "meal_takeaway",
  "fast_food_restaurant",
  "meal_delivery",
  "cafe",
  "bar",
  "food_court",
  "food",
  "grocery_store",
  "supermarket",
  "bakery",
  "catering_service",
  "asian_grocery_store",
  "wholesaler",
  "tea_house",
  "juice_shop",
  "ice_cream_shop",
  "hypermarket",
  "manufacturer",
  "hookah_bar",
  "confectionery",
  "coffee_shop",
  "cocktail_bar",
];

/** Display label → array of raw Google types that map to it */
export const CUISINE_GROUPS: Record<string, string[]> = {};
for (const [rawType, label] of Object.entries(CUISINE_MAP)) {
  if (!CUISINE_GROUPS[label]) {
    CUISINE_GROUPS[label] = [];
  }
  CUISINE_GROUPS[label].push(rawType);
}

/**
 * Top 10 cuisine display labels by restaurant count (after grouping).
 * Computed from direct_delivery=1 data as of 2026-03-11:
 *
 *  Pizza       891  (pizza_restaurant + pizza_delivery)
 *  Mexican     380  (mexican + taco + burrito)
 *  Chinese     353  (chinese + noodle + cantonese + dim_sum)
 *  Japanese    303  (japanese + sushi + ramen + izakaya)
 *  Thai        175
 *  Indian      148  (indian + south_indian + north_indian)
 *  American     94  (american + hamburger + hot_dog + soul_food + diner)
 *  Italian      92
 *  Halal        40
 *  Deli         28  (deli + sandwich_shop + bagel_shop)
 */
export const TOP_CUISINES: string[] = [
  "Pizza",
  "Mexican",
  "Chinese",
  "Japanese",
  "Thai",
  "Indian",
  "American",
  "Italian",
  "Halal",
  "Deli",
];

/** Get the cuisine display label for a raw type, or null if excluded/unknown */
export function getCuisineLabel(primaryType: string): string | null {
  if (EXCLUDED_TYPES.includes(primaryType)) return null;
  return CUISINE_MAP[primaryType] ?? null;
}
