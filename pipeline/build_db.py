#!/usr/bin/env python3
"""
nodash - NYC free delivery restaurant database builder

Strategy:
  1. Load all 177 NYC zip codes (with borough + neighborhood labels)
  2. Geocode each zip → get exact bounding box from Google Geocoding API
  3. Use bounding box as locationRestriction in Places Text Search
  4. Filter delivery:true candidates, pull full Place Details
  5. Store in SQLite, deduplicating by place_id
"""

import os, json, time, sqlite3, urllib.request, urllib.error, csv
from datetime import datetime, timezone
from pathlib import Path

API_KEY = os.environ.get('GOOGLE_PLACES_API_KEY')
ROOT = Path(__file__).parent.parent
DB_PATH = ROOT / 'data' / 'restaurants.db'
ZIP_CSV = ROOT / 'data' / 'nyc-zip-codes.csv'

SEARCH_QUERIES = [
    "restaurants with delivery",
    "pizza delivery",
    "chinese takeout delivery",
    "thai delivery",
    "indian delivery",
    "mexican takeout",
    "japanese delivery",
]

DETAIL_FIELDS = ",".join([
    # Identity
    "id", "displayName", "formattedAddress", "shortFormattedAddress",
    "nationalPhoneNumber", "websiteUri", "location",
    # Ratings & price
    "rating", "userRatingCount", "priceLevel", "priceRange",
    # Type & cuisine
    "primaryType", "types",
    # Ordering capabilities
    "delivery", "takeout", "dineIn", "curbsidePickup",
    # Hours
    "regularOpeningHours", "regularSecondaryOpeningHours",
    # Payment
    "paymentOptions",
    # Description
    "editorialSummary", "generativeSummary",
    # Reviews (5 most recent — mine for delivery mentions)
    "reviews",
    # Status
    "businessStatus",
    # Dietary & meal filters
    "servesVegetarianFood", "servesBreakfast", "servesBrunch",
    "servesLunch", "servesDinner", "servesCocktails",
    "servesDessert", "servesCoffee",
    # Vibe filters
    "outdoorSeating", "goodForGroups", "goodForChildren", "liveMusic",
])


# ── Database ──────────────────────────────────────────────────────────────────

def init_db(conn):
    conn.execute("""
    CREATE TABLE IF NOT EXISTS restaurants (
        -- Identity
        place_id            TEXT PRIMARY KEY,
        name                TEXT,
        address             TEXT,
        short_address       TEXT,
        zip_code            TEXT,
        neighborhood        TEXT,
        borough             TEXT,
        phone               TEXT,
        website             TEXT,
        lat                 REAL,
        lng                 REAL,
        -- Ratings & price
        rating              REAL,
        review_count        INTEGER,
        price_level         TEXT,
        price_low           INTEGER,
        price_high          INTEGER,
        -- Type & cuisine
        primary_type        TEXT,
        types               TEXT,   -- JSON array
        -- Ordering capabilities
        delivery            INTEGER,
        takeout             INTEGER,
        dine_in             INTEGER,
        curbside_pickup     INTEGER,
        -- Hours (JSON)
        opening_hours       TEXT,   -- regularOpeningHours weekdayDescriptions
        delivery_hours      TEXT,   -- secondary hours where type=DELIVERY
        takeout_hours       TEXT,   -- secondary hours where type=TAKEOUT
        -- Payment
        payment_cash_only   INTEGER,
        payment_options     TEXT,   -- full JSON
        -- Descriptions
        editorial_summary   TEXT,
        generative_summary  TEXT,   -- AI-generated overview
        -- Reviews (JSON array of 5)
        reviews             TEXT,
        -- Status
        business_status     TEXT,
        -- Dietary & meal
        serves_vegetarian   INTEGER,
        serves_breakfast    INTEGER,
        serves_brunch       INTEGER,
        serves_lunch        INTEGER,
        serves_dinner       INTEGER,
        serves_cocktails    INTEGER,
        serves_dessert      INTEGER,
        serves_coffee       INTEGER,
        -- Vibe
        outdoor_seating     INTEGER,
        good_for_groups     INTEGER,
        good_for_children   INTEGER,
        live_music          INTEGER,
        -- Verification fields (filled by calling pipeline)
        verified            INTEGER DEFAULT 0,
        direct_delivery     INTEGER,
        delivery_fee        TEXT,
        delivery_minimum    TEXT,
        delivery_radius     TEXT,
        ordering_method     TEXT,
        verification_notes  TEXT,
        last_verified       TEXT,
        last_updated        TEXT
    )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_zip        ON restaurants(zip_code)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_borough    ON restaurants(borough)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_delivery   ON restaurants(delivery)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_verified   ON restaurants(verified)")
    conn.commit()


# ── Google APIs ───────────────────────────────────────────────────────────────

def geocode_zip(zipcode: str) -> dict | None:
    """Return viewport bounding box for a zip code via Geocoding API."""
    url = (
        f"https://maps.googleapis.com/maps/api/geocode/json"
        f"?address={zipcode}&components=country:US|postal_code:{zipcode}"
        f"&key={API_KEY}"
    )
    with urllib.request.urlopen(urllib.request.Request(url), timeout=10) as r:
        data = json.loads(r.read())
    results = data.get("results", [])
    if not results:
        return None
    return results[0].get("geometry", {}).get("viewport")
    # {"northeast": {"lat": .., "lng": ..}, "southwest": {"lat": .., "lng": ..}}


def places_text_search(query: str, viewport: dict) -> list:
    """Text search hard-restricted to exact zip code bounding box."""
    url = "https://places.googleapis.com/v1/places:searchText"
    ne, sw = viewport["northeast"], viewport["southwest"]
    body = json.dumps({
        "textQuery": query,
        "maxResultCount": 20,
        "locationRestriction": {
            "rectangle": {
                "low":  {"latitude": sw["lat"], "longitude": sw["lng"]},
                "high": {"latitude": ne["lat"], "longitude": ne["lng"]},
            }
        }
    }).encode()
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Content-Type": "application/json",
        "X-Goog-Api-Key": API_KEY,
        "X-Goog-FieldMask": "places.id,places.delivery,places.businessStatus",
    })
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read()).get("places", [])


def place_details(place_id: str) -> dict:
    """Fetch full details for a single place."""
    url = f"https://places.googleapis.com/v1/places/{place_id}"
    req = urllib.request.Request(url, headers={
        "X-Goog-Api-Key": API_KEY,
        "X-Goog-FieldMask": DETAIL_FIELDS,
    })
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())


# ── Helpers ───────────────────────────────────────────────────────────────────

def extract_secondary_hours(data: dict, hours_type: str) -> str | None:
    for h in data.get("regularSecondaryOpeningHours", []):
        if h.get("secondaryHoursType") == hours_type:
            return json.dumps(h.get("weekdayDescriptions", []))
    return None


def extract_reviews(data: dict) -> str | None:
    reviews = data.get("reviews", [])
    if not reviews:
        return None
    simplified = [
        {
            "rating": r.get("rating"),
            "text": r.get("text", {}).get("text", ""),
            "author": r.get("authorAttribution", {}).get("displayName", ""),
            "time": r.get("relativePublishTimeDescription", ""),
        }
        for r in reviews[:5]
    ]
    return json.dumps(simplified)


def bool_field(data: dict, key: str) -> int | None:
    val = data.get(key)
    if val is None:
        return None
    return 1 if val else 0


def upsert_restaurant(conn, place: dict, zip_code: str, neighborhood: str, borough: str):
    loc = place.get("location", {})
    pr  = place.get("priceRange", {})
    po  = place.get("paymentOptions", {})
    oh  = place.get("regularOpeningHours", {})
    gs  = place.get("generativeSummary", {})

    conn.execute("""
    INSERT OR REPLACE INTO restaurants (
        place_id, name, address, short_address,
        zip_code, neighborhood, borough,
        phone, website, lat, lng,
        rating, review_count, price_level, price_low, price_high,
        primary_type, types,
        delivery, takeout, dine_in, curbside_pickup,
        opening_hours, delivery_hours, takeout_hours,
        payment_cash_only, payment_options,
        editorial_summary, generative_summary, reviews,
        business_status,
        serves_vegetarian, serves_breakfast, serves_brunch,
        serves_lunch, serves_dinner, serves_cocktails,
        serves_dessert, serves_coffee,
        outdoor_seating, good_for_groups, good_for_children, live_music,
        last_updated
    ) VALUES (
        ?,?,?,?,?,?,?,?,?,?,?,
        ?,?,?,?,?,?,?,?,?,?,?,
        ?,?,?,?,?,?,?,?,?,
        ?,?,?,?,?,?,?,?,
        ?,?,?,?,?
    )
    """, (
        place.get("id"),
        place.get("displayName", {}).get("text"),
        place.get("formattedAddress"),
        place.get("shortFormattedAddress"),
        zip_code, neighborhood, borough,
        place.get("nationalPhoneNumber"),
        place.get("websiteUri"),
        loc.get("latitude"), loc.get("longitude"),
        place.get("rating"),
        place.get("userRatingCount"),
        place.get("priceLevel"),
        pr.get("startPrice", {}).get("units"),
        pr.get("endPrice", {}).get("units"),
        place.get("primaryType"),
        json.dumps(place.get("types", [])),
        bool_field(place, "delivery"),
        bool_field(place, "takeout"),
        bool_field(place, "dineIn"),
        bool_field(place, "curbsidePickup"),
        json.dumps(oh.get("weekdayDescriptions", [])) if oh else None,
        extract_secondary_hours(place, "DELIVERY"),
        extract_secondary_hours(place, "TAKEOUT"),
        1 if po.get("acceptsCashOnly") else 0,
        json.dumps(po) if po else None,
        place.get("editorialSummary", {}).get("text"),
        gs.get("overview", {}).get("text") if gs else None,
        extract_reviews(place),
        place.get("businessStatus"),
        bool_field(place, "servesVegetarianFood"),
        bool_field(place, "servesBreakfast"),
        bool_field(place, "servesBrunch"),
        bool_field(place, "servesLunch"),
        bool_field(place, "servesDinner"),
        bool_field(place, "servesCocktails"),
        bool_field(place, "servesDessert"),
        bool_field(place, "servesCoffee"),
        bool_field(place, "outdoorSeating"),
        bool_field(place, "goodForGroups"),
        bool_field(place, "goodForChildren"),
        bool_field(place, "liveMusic"),
        datetime.now(timezone.utc).isoformat(),
    ))


# ── Main ──────────────────────────────────────────────────────────────────────

def load_zip_codes(path: Path) -> list[dict]:
    with open(path) as f:
        return list(csv.DictReader(f))


def run(zip_filter: list[str] | None = None, dry_run: bool = False):
    if not API_KEY:
        raise RuntimeError("GOOGLE_PLACES_API_KEY not set")

    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    init_db(conn)

    zip_codes = load_zip_codes(ZIP_CSV)
    if zip_filter:
        zip_codes = [z for z in zip_codes if z["ZipCode"] in zip_filter]

    total_new = 0
    total_api_calls = 0

    for row in zip_codes:
        zipcode     = row["ZipCode"].strip()
        neighborhood = row["Neighborhood"].strip()
        borough     = row["Borough"].strip()

        print(f"\n📍 {zipcode} — {neighborhood}, {borough}")

        # Geocode zip → exact bounding box
        try:
            viewport = geocode_zip(zipcode)
            total_api_calls += 1
            if not viewport:
                print(f"  ⚠️  Could not geocode {zipcode}, skipping")
                continue
            time.sleep(0.1)
        except Exception as e:
            print(f"  ⚠️  Geocode error: {e}")
            continue

        # Search within exact zip bounds
        candidate_ids: set[str] = set()
        for query in SEARCH_QUERIES:
            try:
                results = places_text_search(query, viewport)
                total_api_calls += 1
                for r in results:
                    if r.get("businessStatus") == "OPERATIONAL" and r.get("delivery"):
                        candidate_ids.add(r["id"])
                time.sleep(0.15)
            except Exception as e:
                print(f"  ⚠️  Search error ({query}): {e}")

        print(f"  {len(candidate_ids)} delivery candidates")

        # Step 3: fetch details for new candidates only
        zip_new = 0
        for place_id in candidate_ids:
            existing = conn.execute(
                "SELECT place_id FROM restaurants WHERE place_id=?", (place_id,)
            ).fetchone()
            if existing:
                continue
            try:
                detail = place_details(place_id)
                total_api_calls += 1
                if not dry_run:
                    upsert_restaurant(conn, detail, zipcode, neighborhood, borough)
                    conn.commit()
                zip_new += 1
                total_new += 1
                name = detail.get("displayName", {}).get("text", "?")
                print(f"  + {name}")
                time.sleep(0.15)
            except Exception as e:
                print(f"  ⚠️  Detail error {place_id}: {e}")

        print(f"  → {zip_new} new added")

    conn.close()
    print(f"\n✅ Done. {total_new} new restaurants | ~{total_api_calls} API calls")


if __name__ == "__main__":
    import sys
    dry_run    = "--dry-run" in sys.argv
    zip_filter = None

    # Allow passing specific zips: python build_db.py 11215 11217
    explicit_zips = [a for a in sys.argv[1:] if a.isdigit() and len(a) == 5]
    if explicit_zips:
        zip_filter = explicit_zips

    mode = f"zips: {zip_filter}" if zip_filter else "ALL 177 NYC zip codes"
    print(f"🍕 nodash — {mode} | dry_run={dry_run}\n")

    run(zip_filter=zip_filter, dry_run=dry_run)
