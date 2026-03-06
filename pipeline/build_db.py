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

SEARCH_QUERY_TEMPLATES = [
    "restaurants with delivery {zip}",
    "pizza delivery {zip}",
    "chinese takeout delivery {zip}",
    "thai delivery {zip}",
    "indian delivery {zip}",
    "mexican takeout {zip}",
    "japanese delivery {zip}",
]

DETAIL_FIELDS = ",".join([
    "id", "displayName", "formattedAddress", "shortFormattedAddress",
    "nationalPhoneNumber", "websiteUri", "location", "rating",
    "userRatingCount", "priceLevel", "priceRange", "primaryType", "types",
    "delivery", "takeout", "dineIn", "curbsidePickup",
    "regularSecondaryOpeningHours", "regularOpeningHours",
    "paymentOptions", "editorialSummary", "businessStatus",
    "servesVegetarianFood", "servesBrunch", "servesBreakfast",
    "servesLunch", "servesDinner"
])


# ── Database ──────────────────────────────────────────────────────────────────

def init_db(conn):
    conn.execute("""
    CREATE TABLE IF NOT EXISTS restaurants (
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
        rating              REAL,
        review_count        INTEGER,
        price_level         TEXT,
        price_low           INTEGER,
        price_high          INTEGER,
        primary_type        TEXT,
        delivery            INTEGER,
        takeout             INTEGER,
        dine_in             INTEGER,
        delivery_hours      TEXT,
        payment_cash_only   INTEGER,
        editorial_summary   TEXT,
        serves_vegetarian   INTEGER,
        business_status     TEXT,
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

def places_text_search(query: str) -> list:
    """Text search using zip code embedded in query for natural geographic scoping."""
    url = "https://places.googleapis.com/v1/places:searchText"
    body = json.dumps({
        "textQuery": query,
        "maxResultCount": 20,
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

def extract_delivery_hours(data: dict) -> str | None:
    for h in data.get("regularSecondaryOpeningHours", []):
        if h.get("secondaryHoursType") == "DELIVERY":
            return json.dumps(h.get("weekdayDescriptions", []))
    return None


def upsert_restaurant(conn, place: dict, zip_code: str, neighborhood: str, borough: str):
    loc = place.get("location", {})
    pr  = place.get("priceRange", {})
    po  = place.get("paymentOptions", {})
    es  = place.get("editorialSummary", {})
    conn.execute("""
    INSERT OR REPLACE INTO restaurants (
        place_id, name, address, short_address,
        zip_code, neighborhood, borough,
        phone, website, lat, lng,
        rating, review_count, price_level, price_low, price_high,
        primary_type, delivery, takeout, dine_in,
        delivery_hours, payment_cash_only, editorial_summary,
        serves_vegetarian, business_status, last_updated
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
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
        1 if place.get("delivery")  else 0,
        1 if place.get("takeout")   else 0,
        1 if place.get("dineIn")    else 0,
        extract_delivery_hours(place),
        1 if po.get("acceptsCashOnly") else 0,
        es.get("text"),
        1 if place.get("servesVegetarianFood") else 0,
        place.get("businessStatus"),
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

        # Search each query with zip code embedded for natural geographic scoping
        candidate_ids: set[str] = set()
        for template in SEARCH_QUERY_TEMPLATES:
            query = template.format(zip=zipcode)
            try:
                results = places_text_search(query)
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
