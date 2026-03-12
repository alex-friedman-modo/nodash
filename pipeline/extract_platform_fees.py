#!/usr/bin/env python3
"""
Extract delivery fees and minimums from platform ordering pages.
Targets structured JSON data embedded in Slice, Toast, ChowNow pages.

Usage:
    uv run python pipeline/extract_platform_fees.py                    # all platforms
    uv run python pipeline/extract_platform_fees.py --platform slice   # single platform
    uv run python pipeline/extract_platform_fees.py --limit 10         # test run
    uv run python pipeline/extract_platform_fees.py --dry-run          # preview, don't write
"""
import argparse
import asyncio
import json
import logging
import re
import sqlite3
from pathlib import Path

import aiohttp
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-5s %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger(__name__)

DB_PATH = Path(__file__).parent.parent / "data" / "restaurants.db"
HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}
SEM = asyncio.Semaphore(5)

# ─── Platform-specific extractors ───

def extract_slice(html: str) -> dict:
    """Slice embeds shop JSON with minimumOrderRange and deliveryFee data."""
    result = {"fee": None, "minimum": None, "radius": None}
    
    # Get the first minimumOrderRange max that's > 0
    mins = re.findall(r'"minimumOrderRange":\{"max":(\d+)', html)
    for m in mins:
        val = int(m)
        if val > 0:
            result["minimum"] = f"${val}.00"
            break
    if not result["minimum"] and mins and all(int(m) == 0 for m in mins):
        result["minimum"] = "No minimum"
    
    # Delivery fee - check for freeDelivery or deliveryFee amount
    if re.search(r'"freeDelivery"\s*:\s*true', html, re.I):
        result["fee"] = "Free"
    else:
        fees = re.findall(r'"deliveryFee"\s*:\s*(\d+(?:\.\d+)?)', html)
        if fees:
            fee_val = float(fees[0])
            if fee_val == 0:
                result["fee"] = "Free"
            else:
                result["fee"] = f"${fee_val:.2f}"
    
    # Also check for deliveryFeePercentageAmount
    pct = re.findall(r'"DeliveryFeePercentageAmount"\s*:\s*(\w+)', html)
    if pct and pct[0] == "null" and not result["fee"]:
        # Might be free or flat fee
        pass
    
    return result

def extract_toast(html: str) -> dict:
    """Toast pages have delivery info in various formats."""
    result = {"fee": None, "minimum": None, "radius": None}
    lower = html.lower()
    
    # Look for delivery fee patterns
    fee_match = re.search(r'delivery\s*fee[:\s]*\$?(\d+(?:\.\d{2})?)', lower)
    if fee_match:
        result["fee"] = f"${fee_match.group(1)}"
    elif "free delivery" in lower:
        result["fee"] = "Free"
    
    # Look for minimum order
    min_match = re.search(r'(?:minimum|min)\s*(?:order)?[:\s]*\$?(\d+(?:\.\d{2})?)', lower)
    if min_match:
        result["minimum"] = f"${min_match.group(1)}"
    
    # JSON data
    for m in re.finditer(r'"deliveryFee"\s*:\s*(\d+(?:\.\d+)?)', html):
        val = float(m.group(1))
        result["fee"] = "Free" if val == 0 else f"${val:.2f}"
        break
    for m in re.finditer(r'"deliveryMinimum"\s*:\s*(\d+(?:\.\d+)?)', html):
        val = float(m.group(1))
        result["minimum"] = f"${val:.2f}" if val > 0 else "No minimum"
        break
    for m in re.finditer(r'"minimumOrder"\s*:\s*(\d+(?:\.\d+)?)', html):
        val = float(m.group(1))
        result["minimum"] = f"${val:.2f}" if val > 0 else "No minimum"
        break

    return result

def extract_chownow(html: str) -> dict:
    """ChowNow embeds restaurant config as JSON."""
    result = {"fee": None, "minimum": None, "radius": None}
    
    for m in re.finditer(r'"delivery_fee"\s*:\s*"?(\d+(?:\.\d+)?)"?', html):
        val = float(m.group(1))
        result["fee"] = "Free" if val == 0 else f"${val:.2f}"
        break
    for m in re.finditer(r'"delivery_minimum"\s*:\s*"?(\d+(?:\.\d+)?)"?', html):
        val = float(m.group(1))
        result["minimum"] = f"${val:.2f}" if val > 0 else "No minimum"
        break
    for m in re.finditer(r'"delivery_radius"\s*:\s*"?(\d+(?:\.\d+)?)"?', html):
        val = float(m.group(1))
        if val > 0:
            result["radius"] = f"{val} miles"
        break
    
    # Also try text patterns
    lower = html.lower()
    if not result["fee"]:
        if "free delivery" in lower:
            result["fee"] = "Free"
        fee_m = re.search(r'delivery\s*fee[:\s]*\$?(\d+(?:\.\d{2})?)', lower)
        if fee_m:
            result["fee"] = f"${fee_m.group(1)}"
    
    return result

def extract_sauce(html: str) -> dict:
    """Sauce/getSauce pages."""
    result = {"fee": None, "minimum": None, "radius": None}
    lower = html.lower()
    
    if "free delivery" in lower:
        result["fee"] = "Free"
    fee_m = re.search(r'delivery\s*fee[:\s]*\$?(\d+(?:\.\d{2})?)', lower)
    if fee_m:
        result["fee"] = f"${fee_m.group(1)}"
    min_m = re.search(r'(?:minimum|min)\s*(?:order)?[:\s]*\$?(\d+(?:\.\d{2})?)', lower)
    if min_m:
        result["minimum"] = f"${min_m.group(1)}"
    
    # JSON patterns
    for m in re.finditer(r'"deliveryFee"\s*:\s*(\d+(?:\.\d+)?)', html):
        val = float(m.group(1))
        result["fee"] = "Free" if val == 0 else f"${val:.2f}"
        break
    for m in re.finditer(r'"minimumOrder(?:Amount)?"\s*:\s*(\d+(?:\.\d+)?)', html):
        val = float(m.group(1))
        result["minimum"] = f"${val:.2f}" if val > 0 else "No minimum"
        break
    
    return result

def extract_generic(html: str) -> dict:
    """Generic extraction for any platform."""
    result = {"fee": None, "minimum": None, "radius": None}
    lower = html.lower()
    
    if "free delivery" in lower:
        result["fee"] = "Free"
    
    fee_m = re.search(r'delivery\s*fee[:\s]*\$?(\d+(?:\.\d{2})?)', lower)
    if fee_m:
        result["fee"] = f"${fee_m.group(1)}"
    
    min_m = re.search(r'(?:order\s*)?minimum[:\s]*\$?(\d+(?:\.\d{2})?)', lower)
    if not min_m:
        min_m = re.search(r'minimum\s*order[:\s]*\$?(\d+(?:\.\d{2})?)', lower)
    if min_m:
        result["minimum"] = f"${min_m.group(1)}"
    
    # JSON patterns (works for many platforms)
    for m in re.finditer(r'"(?:delivery_?[Ff]ee|deliveryCharge)"\s*:\s*"?(\d+(?:\.\d+)?)"?', html):
        val = float(m.group(1))
        result["fee"] = "Free" if val == 0 else f"${val:.2f}"
        break
    for m in re.finditer(r'"(?:minimum_?[Oo]rder|delivery_?[Mm]inimum|min_?[Oo]rder)"\s*:\s*"?(\d+(?:\.\d+)?)"?', html):
        val = float(m.group(1))
        result["minimum"] = f"${val:.2f}" if val > 0 else "No minimum"
        break
    
    return result

EXTRACTORS = {
    "slice": extract_slice,
    "toast": extract_toast,
    "chownow": extract_chownow,
    "sauce": extract_sauce,
}

# ─── Main ───

async def scrape_one(session: aiohttp.ClientSession, url: str, platform: str) -> dict:
    """Fetch a URL and extract delivery details."""
    async with SEM:
        try:
            async with session.get(url, headers=HEADERS, timeout=aiohttp.ClientTimeout(total=15), allow_redirects=True) as resp:
                if resp.status != 200:
                    return {"fee": None, "minimum": None, "radius": None, "error": f"HTTP {resp.status}"}
                html = await resp.text(encoding="utf-8", errors="replace")
                extractor = EXTRACTORS.get(platform, extract_generic)
                result = extractor(html)
                result["error"] = None
                return result
        except Exception as e:
            return {"fee": None, "minimum": None, "radius": None, "error": str(e)[:80]}

async def run(args):
    conn = sqlite3.connect(DB_PATH)
    
    # Get restaurants to scrape
    platforms = [args.platform] if args.platform else list(EXTRACTORS.keys())
    placeholders = ",".join("?" * len(platforms))
    
    query = f"""
        SELECT place_id, name, online_order_url, ordering_method
        FROM restaurants
        WHERE direct_delivery = 1
          AND online_order_url IS NOT NULL
          AND ordering_method IN ({placeholders})
          AND (delivery_fee IS NULL OR delivery_fee = '')
    """
    rows = conn.execute(query, platforms).fetchall()
    
    if args.limit:
        rows = rows[:args.limit]
    
    log.info(f"Scraping {len(rows)} restaurants for delivery details")
    
    updated = {"fee": 0, "minimum": 0, "radius": 0}
    errors = 0
    
    async with aiohttp.ClientSession() as session:
        tasks = []
        for place_id, name, url, platform in rows:
            tasks.append((place_id, name, platform, scrape_one(session, url, platform)))
        
        for i, (place_id, name, platform, task) in enumerate(tasks):
            result = await task
            
            if result.get("error"):
                errors += 1
                continue
            
            has_data = any(result.get(k) for k in ["fee", "minimum", "radius"])
            if has_data and not args.dry_run:
                updates = []
                params = []
                for field in ["fee", "minimum", "radius"]:
                    if result.get(field):
                        col = f"delivery_{field}"
                        updates.append(f"{col} = ?")
                        params.append(result[field])
                        updated[field] += 1
                
                if updates:
                    params.append(place_id)
                    conn.execute(f"UPDATE restaurants SET {', '.join(updates)} WHERE place_id = ?", params)
                    if (updated["fee"] + updated["minimum"]) % 10 == 0:
                        conn.commit()
            
            if has_data:
                log.info(f"  [{platform}] {name}: fee={result.get('fee')} min={result.get('minimum')} radius={result.get('radius')}")
            
            if (i + 1) % 100 == 0:
                log.info(f"Progress: {i+1}/{len(rows)} | fees={updated['fee']} mins={updated['minimum']} errors={errors}")
    
    conn.commit()
    conn.close()
    
    log.info("═══ Done ═══")
    log.info(f"  Scraped: {len(rows)} restaurants")
    log.info(f"  Fees found: {updated['fee']}")
    log.info(f"  Minimums found: {updated['minimum']}")
    log.info(f"  Radius found: {updated['radius']}")
    log.info(f"  Errors: {errors}")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--platform", choices=list(EXTRACTORS.keys()), help="Single platform")
    parser.add_argument("--limit", type=int, help="Max restaurants to scrape")
    parser.add_argument("--dry-run", action="store_true", help="Don't write to DB")
    args = parser.parse_args()
    asyncio.run(run(args))

if __name__ == "__main__":
    main()
