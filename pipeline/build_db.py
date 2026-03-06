#!/usr/bin/env python3
"""
nodash - NYC free delivery restaurant database builder
Pulls restaurants from Google Places API, filters for direct delivery candidates,
stores in SQLite for verification pipeline.
"""

import os, json, time, sqlite3, urllib.request, urllib.error, ssl
from datetime import datetime

API_KEY = os.environ.get('GOOGLE_PLACES_API_KEY')
DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'restaurants.db')

# NYC neighborhoods with center coordinates
# (name, lat, lng, radius_m)
NYC_NEIGHBORHOODS = [
    # Brooklyn
    ("Park Slope",          40.6728, -73.9772, 1200),
    ("Williamsburg",        40.7081, -73.9571, 1200),
    ("DUMBO/Brooklyn Hts",  40.6981, -73.9887, 1000),
    ("Cobble Hill/Carroll", 40.6855, -73.9937, 1000),
    ("Prospect Heights",    40.6770, -73.9658, 1000),
    ("Crown Heights",       40.6694, -73.9442, 1200),
    ("Bed-Stuy",            40.6872, -73.9418, 1400),
    ("Fort Greene",         40.6899, -73.9748, 1000),
    ("Sunset Park",         40.6457, -74.0036, 1200),
    ("Bay Ridge",           40.6351, -74.0208, 1200),
    ("Flatbush",            40.6501, -73.9496, 1200),
    ("Bushwick",            40.6942, -73.9213, 1200),
    ("Greenpoint",          40.7290, -73.9540, 1000),
    ("Borough Park",        40.6251, -73.9980, 1200),
    ("Sheepshead Bay",      40.5923, -73.9438, 1200),
    # Manhattan
    ("Astoria",             40.7721, -73.9301, 1300),  # Queens but close
    ("Upper West Side",     40.7870, -73.9754, 1200),
    ("Upper East Side",     40.7736, -73.9566, 1200),
    ("Midtown West",        40.7549, -73.9840, 1200),
    ("Midtown East",        40.7549, -73.9680, 1200),
    ("Chelsea",             40.7465, -74.0014, 1000),
    ("Hell's Kitchen",      40.7638, -73.9918, 1000),
    ("East Village",        40.7265, -73.9815, 1000),
    ("West Village",        40.7338, -74.0059, 900),
    ("Lower East Side",     40.7157, -73.9863, 1000),
    ("Chinatown",           40.7158, -73.9970, 800),
    ("Harlem",              40.8116, -73.9465, 1400),
    ("Washington Heights",  40.8448, -73.9393, 1400),
    ("Inwood",              40.8676, -73.9218, 1000),
    ("Flushing",            40.7675, -73.8330, 1400),  # Queens
    ("Jackson Heights",     40.7557, -73.8831, 1200),  # Queens
    ("Sunnyside",           40.7437, -73.9196, 1000),  # Queens
    ("Forest Hills",        40.7196, -73.8449, 1200),  # Queens
    ("Jamaica",             40.7024, -73.7878, 1400),  # Queens
    ("Bronx",               40.8448, -73.8648, 1600),
    ("Staten Island",       40.5795, -74.1502, 1800),
]

SEARCH_QUERIES = [
    "restaurants delivery",
    "pizza chinese thai delivery",
    "indian mexican delivery food",
    "takeout food delivery restaurant",
]

FIELDS = ",".join([
    "id", "displayName", "formattedAddress", "shortFormattedAddress",
    "nationalPhoneNumber", "websiteUri", "location", "rating",
    "userRatingCount", "priceLevel", "priceRange", "primaryType", "types",
    "delivery", "takeout", "dineIn", "curbsidePickup",
    "regularSecondaryOpeningHours", "regularOpeningHours",
    "paymentOptions", "editorialSummary", "businessStatus",
    "servesVegetarianFood", "servesBrunch", "servesBreakfast",
    "servesLunch", "servesDinner"
])

def init_db(conn):
    conn.execute("""
    CREATE TABLE IF NOT EXISTS restaurants (
        place_id TEXT PRIMARY KEY,
        name TEXT,
        address TEXT,
        short_address TEXT,
        neighborhood TEXT,
        phone TEXT,
        website TEXT,
        lat REAL,
        lng REAL,
        rating REAL,
        review_count INTEGER,
        price_level TEXT,
        price_low INTEGER,
        price_high INTEGER,
        primary_type TEXT,
        delivery INTEGER,
        takeout INTEGER,
        dine_in INTEGER,
        delivery_hours TEXT,
        payment_cash_only INTEGER,
        editorial_summary TEXT,
        serves_vegetarian INTEGER,
        business_status TEXT,
        -- Verification fields (filled by calling pipeline)
        verified INTEGER DEFAULT 0,
        direct_delivery INTEGER,
        delivery_fee TEXT,
        delivery_minimum TEXT,
        delivery_radius TEXT,
        ordering_method TEXT,
        verification_notes TEXT,
        last_verified TEXT,
        last_updated TEXT
    )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_neighborhood ON restaurants(neighborhood)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_delivery ON restaurants(delivery)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_verified ON restaurants(verified)")
    conn.commit()

def places_text_search(query, lat, lng, radius_m):
    url = "https://places.googleapis.com/v1/places:searchText"
    body = json.dumps({
        "textQuery": query,
        "maxResultCount": 20,
        "locationBias": {
            "circle": {
                "center": {"latitude": lat, "longitude": lng},
                "radius": float(radius_m)
            }
        }
    }).encode()
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Content-Type": "application/json",
        "X-Goog-Api-Key": API_KEY,
        "X-Goog-FieldMask": f"places.id,places.delivery,places.businessStatus,places.userRatingCount"
    })
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read()).get("places", [])

def places_details(place_id):
    url = f"https://places.googleapis.com/v1/places/{place_id}"
    req = urllib.request.Request(url, headers={
        "X-Goog-Api-Key": API_KEY,
        "X-Goog-FieldMask": FIELDS
    })
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())

def extract_delivery_hours(data):
    for h in data.get("regularSecondaryOpeningHours", []):
        if h.get("secondaryHoursType") == "DELIVERY":
            return json.dumps(h.get("weekdayDescriptions", []))
    return None

def upsert_restaurant(conn, place, neighborhood):
    loc = place.get("location", {})
    pr = place.get("priceRange", {})
    po = place.get("paymentOptions", {})
    es = place.get("editorialSummary", {})

    conn.execute("""
    INSERT OR REPLACE INTO restaurants (
        place_id, name, address, short_address, neighborhood,
        phone, website, lat, lng, rating, review_count,
        price_level, price_low, price_high, primary_type,
        delivery, takeout, dine_in, delivery_hours,
        payment_cash_only, editorial_summary, serves_vegetarian,
        business_status, last_updated
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    """, (
        place.get("id"),
        place.get("displayName", {}).get("text"),
        place.get("formattedAddress"),
        place.get("shortFormattedAddress"),
        neighborhood,
        place.get("nationalPhoneNumber"),
        place.get("websiteUri"),
        loc.get("latitude"),
        loc.get("longitude"),
        place.get("rating"),
        place.get("userRatingCount"),
        place.get("priceLevel"),
        pr.get("startPrice", {}).get("units"),
        pr.get("endPrice", {}).get("units"),
        place.get("primaryType"),
        1 if place.get("delivery") else 0,
        1 if place.get("takeout") else 0,
        1 if place.get("dineIn") else 0,
        extract_delivery_hours(place),
        1 if po.get("acceptsCashOnly") else 0,
        es.get("text"),
        1 if place.get("servesVegetarianFood") else 0,
        place.get("businessStatus"),
        datetime.utcnow().isoformat()
    ))

def run(neighborhoods=None, dry_run=False):
    conn = sqlite3.connect(DB_PATH)
    init_db(conn)

    targets = neighborhoods or NYC_NEIGHBORHOODS
    total_found = 0
    total_new = 0
    api_calls = 0

    for (name, lat, lng, radius) in targets:
        print(f"\n📍 {name}...")
        neighborhood_ids = set()

        for query in SEARCH_QUERIES:
            try:
                results = places_text_search(query, lat, lng, radius)
                api_calls += 1
                for r in results:
                    if (r.get("businessStatus") == "OPERATIONAL" and
                        r.get("delivery") == True):
                        neighborhood_ids.add(r["id"])
                time.sleep(0.2)
            except Exception as e:
                print(f"  ⚠️  Search error: {e}")

        print(f"  {len(neighborhood_ids)} delivery candidates found")

        for place_id in neighborhood_ids:
            # Check if already in DB
            existing = conn.execute(
                "SELECT place_id FROM restaurants WHERE place_id=?", (place_id,)
            ).fetchone()
            if existing:
                continue

            try:
                detail = places_details(place_id)
                api_calls += 1
                if not dry_run:
                    upsert_restaurant(conn, detail, name)
                    conn.commit()
                total_new += 1
                total_found += 1
                print(f"  + {detail.get('displayName',{}).get('text','?')} ({detail.get('priceLevel','?')})")
                time.sleep(0.15)
            except Exception as e:
                print(f"  ⚠️  Detail error for {place_id}: {e}")

    conn.close()
    print(f"\n✅ Done. {total_new} new restaurants added. ~{api_calls} API calls made.")

if __name__ == "__main__":
    import sys
    if not API_KEY:
        print("❌ GOOGLE_PLACES_API_KEY not set")
        sys.exit(1)

    # Default: just Park Slope to test
    test_mode = "--all" not in sys.argv
    neighborhoods = None if "--all" in sys.argv else [n for n in NYC_NEIGHBORHOODS if "Park Slope" in n[0]]
    dry_run = "--dry-run" in sys.argv

    print(f"🍕 nodash database builder")
    print(f"   Mode: {'ALL NYC' if not test_mode else 'Park Slope only'}")
    print(f"   Dry run: {dry_run}")
    print(f"   DB: {DB_PATH}\n")

    run(neighborhoods=neighborhoods, dry_run=dry_run)
