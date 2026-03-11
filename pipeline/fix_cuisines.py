"""
fix_cuisines.py — Add cuisine_label column to restaurants.db and populate it
from the canonical cuisine mapping.

Usage:
    cd /home/ccloud/clawd/projects/nodash
    uv run python pipeline/fix_cuisines.py
"""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "restaurants.db"

# Mirrors CUISINE_MAP from web/lib/cuisines.ts — keep in sync
CUISINE_MAP: dict[str, str] = {
    # Pizza
    "pizza_restaurant": "Pizza",
    "pizza_delivery": "Pizza",
    # Mexican
    "mexican_restaurant": "Mexican",
    "taco_restaurant": "Mexican",
    "burrito_restaurant": "Mexican",
    "tex_mex_restaurant": "Tex-Mex",
    # Chinese
    "chinese_restaurant": "Chinese",
    "chinese_noodle_restaurant": "Chinese",
    "cantonese_restaurant": "Chinese",
    "dim_sum_restaurant": "Chinese",
    # Thai
    "thai_restaurant": "Thai",
    # Japanese
    "japanese_restaurant": "Japanese",
    "sushi_restaurant": "Japanese",
    "ramen_restaurant": "Japanese",
    "japanese_izakaya_restaurant": "Japanese",
    # Indian
    "indian_restaurant": "Indian",
    "south_indian_restaurant": "Indian",
    "north_indian_restaurant": "Indian",
    # Italian
    "italian_restaurant": "Italian",
    # Halal
    "halal_restaurant": "Halal",
    # American
    "american_restaurant": "American",
    "hamburger_restaurant": "American",
    "hot_dog_restaurant": "American",
    "soul_food_restaurant": "American",
    "diner": "American",
    # Chicken
    "chicken_restaurant": "Chicken",
    "chicken_wings_restaurant": "Chicken",
    # Caribbean
    "caribbean_restaurant": "Caribbean",
    # Deli / Sandwich
    "deli": "Deli",
    "sandwich_shop": "Deli",
    "bagel_shop": "Deli",
    # Seafood
    "seafood_restaurant": "Seafood",
    # Asian
    "asian_fusion_restaurant": "Asian",
    "asian_restaurant": "Asian",
    # Latin American
    "latin_american_restaurant": "Latin American",
    "colombian_restaurant": "Latin American",
    "peruvian_restaurant": "Latin American",
    "cuban_restaurant": "Latin American",
    "brazilian_restaurant": "Latin American",
    # Mediterranean
    "mediterranean_restaurant": "Mediterranean",
    "greek_restaurant": "Mediterranean",
    # Korean
    "korean_restaurant": "Korean",
    # Vietnamese
    "vietnamese_restaurant": "Vietnamese",
    # Turkish
    "turkish_restaurant": "Turkish",
    # Pakistani
    "pakistani_restaurant": "Pakistani",
    "bangladeshi_restaurant": "Pakistani",
    # BBQ
    "barbecue_restaurant": "BBQ",
    "bar_and_grill": "BBQ",
    # Middle Eastern
    "middle_eastern_restaurant": "Middle Eastern",
    "lebanese_restaurant": "Middle Eastern",
    "falafel_restaurant": "Middle Eastern",
    "persian_restaurant": "Middle Eastern",
    "gyro_restaurant": "Middle Eastern",
    # Dumplings
    "dumpling_restaurant": "Dumplings",
    "hot_pot_restaurant": "Dumplings",
    # Vegan
    "vegan_restaurant": "Vegan",
    "vegetarian_restaurant": "Vegan",
    # Salad
    "salad_shop": "Salad",
    # Malaysian
    "malaysian_restaurant": "Malaysian",
    # Eastern European
    "eastern_european_restaurant": "Eastern European",
    "ukrainian_restaurant": "Eastern European",
    # Hawaiian
    "hawaiian_restaurant": "Hawaiian",
    # Fusion
    "fusion_restaurant": "Fusion",
    # Dessert
    "dessert_restaurant": "Dessert",
    "dessert_shop": "Dessert",
    # Ethiopian
    "ethiopian_restaurant": "Ethiopian",
    # Cajun
    "cajun_restaurant": "Cajun",
    # Spanish
    "spanish_restaurant": "Spanish",
    # African
    "african_restaurant": "African",
    # Moroccan
    "moroccan_restaurant": "Moroccan",
    # Sri Lankan
    "sri_lankan_restaurant": "Sri Lankan",
    # Tibetan
    "tibetan_restaurant": "Tibetan",
    # Burmese
    "burmese_restaurant": "Burmese",
    # Belgian
    "belgian_restaurant": "Belgian",
    # Steak
    "steak_house": "Steakhouse",
    # Noodle
    "noodle_shop": "Noodles",
    # Gastropub / Bistro
    "gastropub": "Gastropub",
    "bistro": "Bistro",
}

# Types that are too generic — set cuisine_label to NULL
EXCLUDED_TYPES = {
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
}


def main() -> None:
    print(f"Opening database: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Add column if it doesn't exist
    columns = {row[1] for row in cur.execute("PRAGMA table_info(restaurants)")}
    if "cuisine_label" not in columns:
        print("Adding cuisine_label column...")
        cur.execute("ALTER TABLE restaurants ADD COLUMN cuisine_label TEXT")
    else:
        print("cuisine_label column already exists, updating values...")

    # Reset all to NULL first
    cur.execute("UPDATE restaurants SET cuisine_label = NULL")

    # Update each mapped type
    updated = 0
    for raw_type, label in CUISINE_MAP.items():
        cur.execute(
            "UPDATE restaurants SET cuisine_label = ? WHERE primary_type = ?",
            (label, raw_type),
        )
        updated += cur.rowcount

    conn.commit()

    # Report results
    print(f"\nUpdated {updated} restaurants with cuisine labels.")

    print("\nCuisine label distribution (direct_delivery=1):")
    rows = cur.execute(
        """
        SELECT cuisine_label, COUNT(*) as cnt
        FROM restaurants
        WHERE direct_delivery = 1
        GROUP BY cuisine_label
        ORDER BY cnt DESC
        """
    ).fetchall()
    for label, cnt in rows:
        display = label if label else "(none/excluded)"
        print(f"  {display:25s} {cnt:>5d}")

    unmapped = cur.execute(
        """
        SELECT primary_type, COUNT(*) as cnt
        FROM restaurants
        WHERE direct_delivery = 1 AND cuisine_label IS NULL
        GROUP BY primary_type
        ORDER BY cnt DESC
        """
    ).fetchall()
    if unmapped:
        print(f"\nUnmapped types ({sum(c for _, c in unmapped)} restaurants):")
        for pt, cnt in unmapped:
            print(f"  {pt:35s} {cnt:>5d}")

    conn.close()
    print("\nDone!")


if __name__ == "__main__":
    main()
