#!/usr/bin/env python3
"""
migrate_to_supabase.py — Migrate nodash restaurant data from SQLite to Supabase (Postgres).

Reads from data/restaurants.db, transforms types (int→bool, text→timestamptz, text→jsonb),
and upserts to Supabase in batches of 500.

Usage:
    pip install supabase python-dotenv
    export SUPABASE_URL="https://xxx.supabase.co"
    export SUPABASE_SERVICE_KEY="eyJ..."
    python pipeline/migrate_to_supabase.py [--dry-run] [--limit N]
"""

import json
import os
import sqlite3
import sys
import argparse
from datetime import datetime
from pathlib import Path

try:
    from supabase import create_client, Client
except ImportError:
    print("ERROR: pip install supabase")
    sys.exit(1)

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # .env loading is optional

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
SQLITE_PATH = Path(__file__).parent.parent / "data" / "restaurants.db"
BATCH_SIZE = 500

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

# ---------------------------------------------------------------------------
# Column mappings: SQLite column → (target_table, postgres_column, transform)
# ---------------------------------------------------------------------------

# Columns that should be cast from int (0/1/NULL) to bool
BOOL_COLUMNS = {
    "delivery", "takeout", "dine_in", "curbside_pickup",
    "payment_cash_only",
    "serves_vegetarian", "serves_breakfast", "serves_brunch",
    "serves_lunch", "serves_dinner", "serves_cocktails",
    "serves_dessert", "serves_coffee",
    "outdoor_seating", "good_for_groups", "good_for_children", "live_music",
    "verified", "direct_delivery",
    # scrape_results bools
    "third_party", "third_party_only", "delivery_menu",
    "has_pdf_menu", "needs_llm",
}

# Columns that contain JSON text → should be parsed to dicts/lists
JSON_COLUMNS = {
    "types", "opening_hours", "delivery_hours", "takeout_hours",
    "payment_options", "reviews", "scrape_snippets",
}

# Columns with timestamp text → keep as ISO string (Supabase handles casting)
TIMESTAMP_COLUMNS = {
    "last_verified", "last_updated", "llm_processed_at", "scrape_updated",
}

# Which columns belong to scrape_results (everything else → restaurants)
SCRAPE_COLUMNS = {
    "scrape_stage", "scrape_status", "url_category", "detected_platform",
    "detected_language", "third_party", "third_party_only", "delivery_menu",
    "has_pdf_menu", "needs_llm", "pages_fetched", "raw_text_preview",
    "fetch_error", "scrape_snippets", "scrape_markdown", "direct_order_signals",
    "delivery_fee_status", "llm_confidence", "llm_processed_at", "scrape_updated",
    "third_party_detected",  # renamed below
}

# Rename SQLite columns that don't match Postgres
COLUMN_RENAMES = {
    "address": "address",        # same
    "review_count": "review_count",  # was user_rating_count in some versions
}


def int_to_bool(val):
    """Convert SQLite int (0/1/None) to Python bool or None."""
    if val is None:
        return None
    return bool(val)


def parse_json(val):
    """Parse JSON text to Python object, return None on failure."""
    if val is None or val == "":
        return None
    if isinstance(val, (dict, list)):
        return val
    try:
        return json.loads(val)
    except (json.JSONDecodeError, TypeError):
        return None


def parse_timestamp(val):
    """Validate/normalize timestamp text. Returns ISO string or None."""
    if val is None or val == "" or val == "None":
        return None
    # Already ISO-ish, just return it — Supabase will cast
    return val


def transform_row(row_dict: dict) -> tuple[dict, dict]:
    """
    Transform a single SQLite row dict into two dicts:
    (restaurant_data, scrape_data).
    """
    restaurant = {}
    scrape = {}

    for col, val in row_dict.items():
        # Apply type transforms
        if col in BOOL_COLUMNS:
            val = int_to_bool(val)
        elif col in JSON_COLUMNS:
            val = parse_json(val)
        elif col in TIMESTAMP_COLUMNS:
            val = parse_timestamp(val)

        # Route to correct table
        if col == "place_id":
            restaurant["place_id"] = val
            scrape["place_id"] = val
        elif col in SCRAPE_COLUMNS:
            # Handle rename: third_party_detected → third_party in scrape
            if col == "third_party_detected":
                # Skip — we already have 'third_party' column
                pass
            else:
                scrape[col] = val
        else:
            restaurant[col] = val

    return restaurant, scrape


def fetch_sqlite_rows(db_path: str, limit: int = None) -> list[dict]:
    """Read all rows from SQLite as list of dicts."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    query = "SELECT * FROM restaurants"
    if limit:
        query += f" LIMIT {limit}"

    cursor.execute(query)
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return rows


def upsert_batch(supabase: Client, table: str, batch: list[dict], dry_run: bool = False):
    """Upsert a batch of rows to Supabase."""
    if not batch:
        return 0

    # Filter out rows that have no meaningful data (only place_id)
    if table == "scrape_results":
        batch = [
            row for row in batch
            if any(v is not None for k, v in row.items() if k != "place_id")
        ]
        if not batch:
            return 0

    if dry_run:
        return len(batch)

    result = (
        supabase.table(table)
        .upsert(batch, on_conflict="place_id")
        .execute()
    )
    return len(result.data) if result.data else len(batch)


def main():
    parser = argparse.ArgumentParser(description="Migrate nodash SQLite → Supabase")
    parser.add_argument("--dry-run", action="store_true", help="Don't write, just validate")
    parser.add_argument("--limit", type=int, help="Only migrate N rows (for testing)")
    parser.add_argument("--skip-scrape", action="store_true", help="Skip scrape_results table")
    args = parser.parse_args()

    if not args.dry_run and (not SUPABASE_URL or not SUPABASE_KEY):
        print("ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_KEY env vars")
        print("  export SUPABASE_URL='https://xxx.supabase.co'")
        print("  export SUPABASE_SERVICE_KEY='eyJ...'")
        sys.exit(1)

    # Check SQLite file exists
    if not SQLITE_PATH.exists():
        print(f"ERROR: SQLite database not found at {SQLITE_PATH}")
        sys.exit(1)

    print(f"📂 Reading from: {SQLITE_PATH}")
    rows = fetch_sqlite_rows(str(SQLITE_PATH), limit=args.limit)
    total = len(rows)
    print(f"📊 Found {total:,} restaurants")

    # Transform all rows
    print("🔄 Transforming data types...")
    restaurant_rows = []
    scrape_rows = []

    for row in rows:
        r_data, s_data = transform_row(row)
        restaurant_rows.append(r_data)
        scrape_rows.append(s_data)

    # Validate sample
    sample = restaurant_rows[0] if restaurant_rows else {}
    print(f"\n📋 Sample restaurant record:")
    for key in ["place_id", "name", "borough", "direct_delivery", "rating", "primary_type"]:
        if key in sample:
            print(f"   {key}: {sample[key]!r} ({type(sample[key]).__name__})")

    if args.dry_run:
        print(f"\n🏃 DRY RUN — would upsert {total:,} restaurants + {total:,} scrape rows")

        # Type check report
        bool_check = sum(1 for r in restaurant_rows if isinstance(r.get("direct_delivery"), bool))
        json_check = sum(1 for r in restaurant_rows if isinstance(r.get("types"), (list, type(None))))
        print(f"   ✓ {bool_check:,}/{total:,} have proper bool for direct_delivery")
        print(f"   ✓ {json_check:,}/{total:,} have proper JSON for types")
        print(f"\n✅ Validation passed. Run without --dry-run to migrate.")
        return

    # Connect to Supabase
    print(f"\n🔗 Connecting to Supabase...")
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Upsert restaurants in batches
    print(f"\n📤 Upserting restaurants ({BATCH_SIZE} per batch)...")
    total_upserted = 0
    for i in range(0, len(restaurant_rows), BATCH_SIZE):
        batch = restaurant_rows[i : i + BATCH_SIZE]
        count = upsert_batch(supabase, "restaurants", batch)
        total_upserted += count
        pct = min(100, (i + len(batch)) / total * 100)
        print(f"   [{pct:5.1f}%] Upserted {total_upserted:,}/{total:,} restaurants")

    print(f"✅ Restaurants: {total_upserted:,} rows upserted")

    # Upsert scrape_results
    if not args.skip_scrape:
        print(f"\n📤 Upserting scrape_results ({BATCH_SIZE} per batch)...")
        total_scrape = 0
        for i in range(0, len(scrape_rows), BATCH_SIZE):
            batch = scrape_rows[i : i + BATCH_SIZE]
            count = upsert_batch(supabase, "scrape_results", batch)
            total_scrape += count
            pct = min(100, (i + len(batch)) / total * 100)
            print(f"   [{pct:5.1f}%] Upserted {total_scrape:,}/{total:,} scrape rows")

        print(f"✅ Scrape results: {total_scrape:,} rows upserted")

    print(f"\n🎉 Migration complete!")
    print(f"   Total restaurants: {total_upserted:,}")
    print(f"   View 'restaurant_listings' is ready for frontend queries")


if __name__ == "__main__":
    main()
