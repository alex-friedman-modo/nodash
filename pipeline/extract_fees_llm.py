"""Extract delivery fees/minimums from raw_text_preview using Grok LLM."""

import argparse
import asyncio
import json
import os
import re
import sqlite3
import time

import aiohttp
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.environ["XAI_API_KEY"]
API_URL = "https://api.x.ai/v1/chat/completions"
MODEL = "grok-4-1-fast-non-reasoning"
DB_PATH = "data/restaurants.db"
SEMAPHORE_LIMIT = 5
MAX_RETRIES = 4

SYSTEM_PROMPT = "You extract delivery details from restaurant website text. Return ONLY valid JSON."

def user_prompt(name: str, text: str) -> str:
    return f"""Extract delivery fee, delivery minimum order amount, and delivery radius from this restaurant website text.
Return JSON: {{"delivery_fee": "Free" or "$X.XX" or null, "delivery_minimum": "$X.XX" or "No minimum" or null, "delivery_radius": "X miles" or null}}
Use null for values not found. Only return values you're confident about.

Restaurant: {name}
Website text:
{text[:4000]}"""


async def call_grok(session: aiohttp.ClientSession, sem: asyncio.Semaphore, name: str, text: str) -> dict | None:
    headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
    body = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt(name, text)},
        ],
        "temperature": 0,
    }

    for attempt in range(MAX_RETRIES):
        async with sem:
            try:
                async with session.post(API_URL, headers=headers, json=body, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                    if resp.status == 429:
                        wait = 5 * (attempt + 1)
                        print(f"  ⏳ Rate limited, waiting {wait}s (attempt {attempt+1})")
                        await asyncio.sleep(wait)
                        continue
                    if resp.status != 200:
                        print(f"  ❌ HTTP {resp.status} for {name}")
                        return None
                    data = await resp.json()
            except Exception as e:
                print(f"  ❌ Request error for {name}: {e}")
                if attempt < MAX_RETRIES - 1:
                    await asyncio.sleep(5 * (attempt + 1))
                    continue
                return None

        # Parse response
        try:
            content = data["choices"][0]["message"]["content"]
            # Strip markdown code fences if present
            content = re.sub(r"^```(?:json)?\s*", "", content.strip())
            content = re.sub(r"\s*```$", "", content.strip())
            parsed = json.loads(content)
            if os.environ.get("DEBUG"):
                print(f"  🔍 {name}: {content}")
            return parsed
        except (KeyError, json.JSONDecodeError) as e:
            raw = data.get("choices", [{}])[0].get("message", {}).get("content", "???")
            print(f"  ⚠️ Parse error for {name}: {e} | raw: {raw[:200]}")
            return None

    return None


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0, help="Max restaurants to process (0=all)")
    parser.add_argument("--dry-run", action="store_true", help="Don't write to DB")
    args = parser.parse_args()

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    query = """
        SELECT place_id, name, raw_text_preview FROM restaurants
        WHERE direct_delivery=1
        AND raw_text_preview IS NOT NULL AND LENGTH(raw_text_preview) > 100
        AND ((delivery_fee IS NULL OR delivery_fee='')
             OR (delivery_minimum IS NULL OR delivery_minimum=''))
        AND (raw_text_preview LIKE '%deliver%'
             AND (raw_text_preview LIKE '%$%' OR raw_text_preview LIKE '%fee%'
                  OR raw_text_preview LIKE '%free%' OR raw_text_preview LIKE '%minimum%'
                  OR raw_text_preview LIKE '%mile%' OR raw_text_preview LIKE '%radius%'))
    """
    if args.limit:
        query += f" LIMIT {args.limit}"
    rows = conn.execute(query).fetchall()
    print(f"📋 Processing {len(rows)} restaurants {'(dry run)' if args.dry_run else ''}", flush=True)

    sem = asyncio.Semaphore(SEMAPHORE_LIMIT)
    stats = {"total": len(rows), "fees_found": 0, "minimums_found": 0, "radius_found": 0, "any_data": 0, "errors": 0}
    BATCH = 20

    async with aiohttp.ClientSession() as session:
        for batch_start in range(0, len(rows), BATCH):
            batch = rows[batch_start:batch_start + BATCH]
            coros = [call_grok(session, sem, r["name"], r["raw_text_preview"]) for r in batch]
            results = await asyncio.gather(*coros)

            for row, result in zip(batch, results):
                if result is None:
                    stats["errors"] += 1
                    continue

                fee = result.get("delivery_fee")
                minimum = result.get("delivery_minimum")
                radius = result.get("delivery_radius")
                has_any = False

                if fee:
                    stats["fees_found"] += 1
                    has_any = True
                if minimum:
                    stats["minimums_found"] += 1
                    has_any = True
                if radius:
                    stats["radius_found"] += 1
                    has_any = True

                if has_any:
                    stats["any_data"] += 1
                    print(f"  ✅ {row['name']}: fee={fee}, min={minimum}, radius={radius}", flush=True)

                    if not args.dry_run:
                        updates, params = [], []
                        if fee:
                            updates.append("delivery_fee=?"); params.append(fee)
                        if minimum:
                            updates.append("delivery_minimum=?"); params.append(minimum)
                        if radius:
                            updates.append("delivery_radius=?"); params.append(radius)
                        if updates:
                            params.append(row["place_id"])
                            conn.execute(f"UPDATE restaurants SET {', '.join(updates)} WHERE place_id=?", params)

            done = min(batch_start + BATCH, len(rows))
            if done % 100 == 0 or done == len(rows):
                print(f"  📊 Progress: {done}/{len(rows)} | found: {stats['any_data']}", flush=True)
            if not args.dry_run:
                conn.commit()

    if not args.dry_run:
        conn.commit()
    conn.close()

    pct = (stats["any_data"] / stats["total"] * 100) if stats["total"] else 0
    print(f"\n{'='*50}")
    print(f"📊 RESULTS")
    print(f"{'='*50}")
    print(f"Total processed: {stats['total']}")
    print(f"Fees found:      {stats['fees_found']}")
    print(f"Minimums found:  {stats['minimums_found']}")
    print(f"Radius found:    {stats['radius_found']}")
    print(f"Any data found:  {stats['any_data']} ({pct:.1f}%)")
    print(f"Errors:          {stats['errors']}")


if __name__ == "__main__":
    asyncio.run(main())
