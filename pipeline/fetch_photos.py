"""Fetch restaurant photos from Google Places API (New) and store URLs in the DB."""

import argparse
import asyncio
import os
import sqlite3
import sys
import time

import aiohttp

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "restaurants.db")
API_KEY = os.environ.get("GOOGLE_PLACES_API_KEY", "")
PLACES_BASE = "https://places.googleapis.com/v1/places"
MAX_RPS = 10
SEMAPHORE_LIMIT = 10
BATCH_SIZE = 50  # write to DB every N results


def ensure_columns(db_path: str):
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cols = {row[1] for row in cur.execute("PRAGMA table_info(restaurants)").fetchall()}
    if "photo_url" not in cols:
        cur.execute("ALTER TABLE restaurants ADD COLUMN photo_url TEXT")
        print("Added photo_url column")
    conn.commit()
    conn.close()


def get_restaurants(db_path: str, limit: int | None = None, borough: str | None = None) -> list[tuple[str, str]]:
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    q = "SELECT place_id, name FROM restaurants WHERE direct_delivery=1 AND (photo_url IS NULL OR photo_url='')"
    params = []
    if borough:
        q += " AND borough=?"
        params.append(borough)
    if limit:
        q += " LIMIT ?"
        params.append(limit)
    rows = cur.execute(q, params).fetchall()
    conn.close()
    return rows


class RateLimiter:
    def __init__(self, rate: float):
        self.interval = 1.0 / rate
        self._last = 0.0
        self._lock = asyncio.Lock()

    async def acquire(self):
        async with self._lock:
            now = time.monotonic()
            wait = self._last + self.interval - now
            if wait > 0:
                await asyncio.sleep(wait)
            self._last = time.monotonic()


def save_batch(db_path: str, results: list[tuple[str, str]]):
    """Write a batch of (place_id, photo_url) to the DB."""
    if not results:
        return
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    for place_id, photo_url in results:
        cur.execute("UPDATE restaurants SET photo_url=? WHERE place_id=?", (photo_url, place_id))
    conn.commit()
    conn.close()


async def fetch_photo_url(session: aiohttp.ClientSession, place_id: str, name: str,
                          rate_limiter: RateLimiter, semaphore: asyncio.Semaphore) -> tuple[str, str | None]:
    async with semaphore:
        await rate_limiter.acquire()
        url = f"{PLACES_BASE}/{place_id}"
        headers = {
            "X-Goog-Api-Key": API_KEY,
            "X-Goog-FieldMask": "photos",
        }
        try:
            async with session.get(url, headers=headers) as resp:
                if resp.status != 200:
                    text = await resp.text()
                    print(f"  ✗ {name} ({place_id}): Places API {resp.status} - {text[:100]}")
                    return (place_id, None)
                data = await resp.json()

            photos = data.get("photos", [])
            if not photos:
                print(f"  ○ {name}: no photos")
                return (place_id, None)

            photo_name = photos[0].get("name", "")
            if not photo_name:
                return (place_id, None)

            await rate_limiter.acquire()
            media_url = f"https://places.googleapis.com/v1/{photo_name}/media?maxWidthPx=400&skipHttpRedirect=true"
            media_headers = {"X-Goog-Api-Key": API_KEY}

            async with session.get(media_url, headers=media_headers) as resp2:
                if resp2.status != 200:
                    text = await resp2.text()
                    print(f"  ✗ {name}: Media API {resp2.status} - {text[:100]}")
                    return (place_id, None)
                media_data = await resp2.json()

            photo_uri = media_data.get("photoUri", "")
            if photo_uri:
                print(f"  ✓ {name}")
                return (place_id, photo_uri)
            else:
                print(f"  ✗ {name}: no photoUri in response")
                return (place_id, None)

        except Exception as e:
            print(f"  ✗ {name} ({place_id}): {e}")
            return (place_id, None)


async def main():
    parser = argparse.ArgumentParser(description="Fetch restaurant photos from Google Places API")
    parser.add_argument("--limit", type=int, default=None, help="Max restaurants to process")
    parser.add_argument("--borough", type=str, default=None, help="Filter by borough")
    args = parser.parse_args()

    if not API_KEY:
        print("ERROR: GOOGLE_PLACES_API_KEY not set. Source .env first.")
        sys.exit(1)

    ensure_columns(DB_PATH)
    restaurants = get_restaurants(DB_PATH, limit=args.limit, borough=args.borough)
    total = len(restaurants)
    print(f"Processing {total} restaurants" + (f" (borough={args.borough})" if args.borough else ""))

    if total == 0:
        print("Nothing to do.")
        return

    rate_limiter = RateLimiter(MAX_RPS)
    semaphore = asyncio.Semaphore(SEMAPHORE_LIMIT)
    
    found = 0
    errors = 0
    pending_writes: list[tuple[str, str]] = []

    async with aiohttp.ClientSession() as session:
        # Process in chunks to allow incremental DB writes
        for i in range(0, total, BATCH_SIZE):
            chunk = restaurants[i:i + BATCH_SIZE]
            tasks = [
                fetch_photo_url(session, pid, name, rate_limiter, semaphore)
                for pid, name in chunk
            ]
            results = await asyncio.gather(*tasks)
            
            batch_writes = []
            for place_id, photo_url in results:
                if photo_url:
                    batch_writes.append((place_id, photo_url))
                    found += 1
                else:
                    errors += 1
            
            save_batch(DB_PATH, batch_writes)
            processed = min(i + BATCH_SIZE, total)
            print(f"  [{processed}/{total}] saved {len(batch_writes)} photos (total: {found} found, {errors} missing)")

    print(f"\nDone! {found}/{total} photos found, {errors} missing/errors")


if __name__ == "__main__":
    asyncio.run(main())
