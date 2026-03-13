"""
Scrape delivery fee/minimum info from Toast ordering pages using Playwright.

Toast uses DoorDash Drive / Uber for delivery — fees are calculated dynamically
based on customer distance, so there's no static "delivery fee" to scrape.
Instead, we extract:
  - Whether delivery is enabled (deliveryProviders in __OO_STATE__)
  - Which provider (DoorDash, Uber)
  - Any visible fee/minimum text on the page
  - Set delivery_fee="varies" for DoorDash-powered delivery (dynamic pricing)

Usage:
  uv run python pipeline/scrape_toast_fees.py [--limit N] [--dry-run]
"""

import argparse
import asyncio
import json
import logging
import os
import re
import sqlite3
from datetime import datetime, timezone
from urllib.parse import urlparse

from playwright.async_api import async_playwright

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "restaurants.db")
CONCURRENCY = 3
PAGE_TIMEOUT = 15000  # 15s


def get_targets(limit: int | None = None) -> list[dict]:
    """Get Toast restaurants needing delivery fee/minimum data."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    query = """
        SELECT place_id, name, online_order_url FROM restaurants
        WHERE ordering_method='toast'
          AND online_order_url LIKE '%toasttab.com/%'
          AND (delivery_fee IS NULL OR delivery_fee=''
               OR delivery_minimum IS NULL OR delivery_minimum='')
    """
    if limit:
        query += f" LIMIT {limit}"
    rows = conn.execute(query).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def normalize_toast_url(url: str) -> str:
    """Convert order.toasttab.com URLs to www.toasttab.com format.
    
    order.toasttab.com is Cloudflare-protected and blocks headless browsers.
    www.toasttab.com works and has the same __OO_STATE__ data.
    """
    parsed = urlparse(url)
    path = parsed.path

    if parsed.hostname == "order.toasttab.com":
        # order.toasttab.com/online/SLUG -> www.toasttab.com/SLUG
        # order.toasttab.com/online/locations/UUID/... -> skip (can't convert)
        if "/online/locations/" in path:
            return None  # UUID-based URLs can't be converted easily
        slug = path.replace("/online/", "").strip("/")
        if slug:
            return f"https://www.toasttab.com/{slug}"
        return None

    # Already www.toasttab.com — clean up query params
    # Strip rwg_token, utm_*, etc but keep the base URL
    clean = f"{parsed.scheme}://{parsed.hostname}{parsed.path}"
    return clean


def extract_slug(url: str) -> str | None:
    """Extract the restaurant slug from a Toast URL."""
    parsed = urlparse(url)
    path = parsed.path.strip("/")
    # Remove known suffixes like /v3, /menu, /rewardsSignup, etc.
    path = re.sub(r"/(v3|menu|order|rewardsSignup)/?$", "", path)
    # Remove /local/order/ prefix
    path = re.sub(r"^local/order/", "", path)
    # Remove /r-UUID suffix
    path = re.sub(r"/r-[a-f0-9-]+$", "", path)
    return path if path else None


async def scrape_toast_page(page, url: str, name: str) -> dict:
    """Scrape a single Toast page for delivery info."""
    result = {
        "delivery_available": False,
        "delivery_fee": None,
        "delivery_minimum": None,
        "delivery_provider": None,
        "delivery_enabled_api": None,
        "error": None,
        "page_text_matches": [],
    }

    try:
        await page.goto(url, timeout=PAGE_TIMEOUT, wait_until="domcontentloaded")
        await page.wait_for_timeout(4000)  # Wait for SPA to render

        # Check for Cloudflare block
        text = await page.evaluate("() => document.body.innerText")
        if "security verification" in text.lower() or "cloudflare" in text.lower():
            result["error"] = "cloudflare_blocked"
            return result

        # Check page text for delivery mode
        has_delivery_text = False
        has_pickup_only = False
        for line in text.split("\n"):
            line = line.strip()
            if not line:
                continue
            ll = line.lower()
            if line == "Delivery":
                has_delivery_text = True
            if "pickup only" in ll:
                has_pickup_only = True
            # Look for fee/minimum in visible text
            if any(kw in ll for kw in ["delivery fee", "order minimum", "minimum order",
                                        "free delivery", "no delivery fee"]):
                result["page_text_matches"].append(line[:200])
                # Try to extract dollar amounts
                fee_match = re.search(r"delivery fee[:\s]*\$?([\d.]+)", ll)
                if fee_match:
                    result["delivery_fee"] = f"${fee_match.group(1)}"
                if "free delivery" in ll or "no delivery fee" in ll:
                    result["delivery_fee"] = "free"
                min_match = re.search(r"(?:order )?minimum[:\s]*\$?([\d.]+)", ll)
                if min_match:
                    result["delivery_minimum"] = f"${min_match.group(1)}"

        # Extract __OO_STATE__ for structured delivery data
        oo_state = await page.evaluate("""() => {
            if (!window.__OO_STATE__) return null;
            const s = JSON.stringify(window.__OO_STATE__);
            // Only return if reasonably sized
            if (s.length > 500000) return null;
            return s;
        }""")

        if oo_state:
            try:
                state = json.loads(oo_state)
                _extract_from_oo_state(state, result)
            except json.JSONDecodeError:
                pass
        else:
            # No __OO_STATE__ — check if delivery text exists
            if has_delivery_text and not has_pickup_only:
                result["delivery_available"] = True

        # If page shows "Delivery" tab but no providers found in API,
        # mark as delivery available (Toast may use its own delivery)
        if has_delivery_text and not has_pickup_only and not result["delivery_available"]:
            result["delivery_available"] = True
            if not result["delivery_fee"]:
                result["delivery_fee"] = "varies"
            if not result["delivery_provider"]:
                result["delivery_provider"] = "TOAST_NATIVE"

        # If no fee found but delivery is available via DoorDash, fee is dynamic
        if result["delivery_available"] and not result["delivery_fee"]:
            if result["delivery_provider"] in ("DOORDASH", "UBER"):
                result["delivery_fee"] = "varies"

    except Exception as e:
        result["error"] = str(e)[:200]

    return result


def _extract_from_oo_state(state: dict, result: dict):
    """Extract delivery info from Toast's __OO_STATE__ Apollo cache."""

    def search(obj, path=""):
        if isinstance(obj, dict):
            for k, v in obj.items():
                kl = k.lower()
                full_path = f"{path}.{k}"

                if k == "deliveryProviders" and isinstance(v, list):
                    for provider in v:
                        if isinstance(provider, dict) and provider.get("enabled"):
                            result["delivery_available"] = True
                            result["delivery_provider"] = provider.get("provider")
                            result["delivery_enabled_api"] = True

                if k == "deliveryServiceAvailability" and isinstance(v, dict):
                    if v.get("available"):
                        result["delivery_available"] = True

                # Look for any fee/minimum fields
                if "deliveryfee" in kl and v is not None and v != "":
                    if isinstance(v, (int, float)):
                        result["delivery_fee"] = f"${v:.2f}" if v > 0 else "free"
                    elif isinstance(v, str) and v:
                        result["delivery_fee"] = v

                if "deliveryminimum" in kl or "orderminimum" in kl or "minimumorder" in kl:
                    if isinstance(v, (int, float)) and v > 0:
                        result["delivery_minimum"] = f"${v:.2f}"
                    elif isinstance(v, str) and v:
                        result["delivery_minimum"] = v

                search(v, full_path)

            # Check for promo banners with delivery info
            if "deliveryBanners" in obj and isinstance(obj["deliveryBanners"], list):
                for banner in obj["deliveryBanners"]:
                    if isinstance(banner, dict):
                        text = banner.get("text", "") or banner.get("description", "")
                        if text:
                            result["page_text_matches"].append(f"BANNER: {text[:200]}")
                            # Parse fee from banner text
                            fee_m = re.search(r"\$(\d+\.?\d*)\s*delivery", text, re.I)
                            if fee_m:
                                result["delivery_fee"] = f"${fee_m.group(1)}"
                            if "free delivery" in text.lower():
                                result["delivery_fee"] = "free"

        elif isinstance(obj, list):
            for item in obj:
                search(item, path)

    search(state)


def batch_update_db(results: list[tuple[str, dict]], dry_run: bool = False):
    """Batch update restaurants with scraped delivery info."""
    if dry_run or not results:
        return

    conn = sqlite3.connect(DB_PATH, timeout=30)
    try:
        for place_id, data in results:
            updates = {}
            if data.get("delivery_fee"):
                updates["delivery_fee"] = data["delivery_fee"]
            if data.get("delivery_minimum"):
                updates["delivery_minimum"] = data["delivery_minimum"]
            if data.get("delivery_available") is not None:
                updates["delivery"] = 1 if data["delivery_available"] else 0
            if data.get("delivery_provider"):
                updates["delivery_fee_status"] = f"toast_{data['delivery_provider'].lower()}"

            if updates:
                set_clause = ", ".join(f"{k} = ?" for k in updates)
                values = list(updates.values())
                conn.execute(
                    f"UPDATE restaurants SET {set_clause} WHERE place_id = ?",
                    values + [place_id],
                )
        conn.commit()
    finally:
        conn.close()


async def run(args):
    targets = get_targets(args.limit)
    logger.info(f"Found {len(targets)} Toast restaurants to scrape")

    if not targets:
        logger.info("Nothing to do!")
        return

    # Stats
    stats = {
        "total": len(targets),
        "processed": 0,
        "delivery_available": 0,
        "fee_found": 0,
        "minimum_found": 0,
        "errors": 0,
        "cloudflare_blocked": 0,
        "skipped_no_url": 0,
        "providers": {},
    }

    # Collect results for batch DB update
    db_updates: list[tuple[str, dict]] = []
    semaphore = asyncio.Semaphore(CONCURRENCY)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1920, "height": 1080},
        )

        async def process_restaurant(target):
            async with semaphore:
                name = target["name"]
                orig_url = target["online_order_url"]
                place_id = target["place_id"]

                # Normalize URL
                url = normalize_toast_url(orig_url)
                if not url:
                    stats["skipped_no_url"] += 1
                    logger.warning(f"⏭️  {name}: skipped (URL can't be normalized: {orig_url[:60]})")
                    return

                page = await context.new_page()
                try:
                    data = await scrape_toast_page(page, url, name)
                    stats["processed"] += 1

                    if data.get("error"):
                        if data["error"] == "cloudflare_blocked":
                            stats["cloudflare_blocked"] += 1
                            logger.warning(f"🛡️  {name}: Cloudflare blocked")
                        else:
                            stats["errors"] += 1
                            logger.error(f"❌ {name}: {data['error'][:80]}")
                        return

                    if data.get("delivery_available"):
                        stats["delivery_available"] += 1
                    if data.get("delivery_fee"):
                        stats["fee_found"] += 1
                    if data.get("delivery_minimum"):
                        stats["minimum_found"] += 1
                    if data.get("delivery_provider"):
                        prov = data["delivery_provider"]
                        stats["providers"][prov] = stats["providers"].get(prov, 0) + 1

                    # Build log line
                    fee = data.get("delivery_fee", "?")
                    minimum = data.get("delivery_minimum", "?")
                    provider = data.get("delivery_provider", "?")
                    avail = "✅" if data.get("delivery_available") else "❌"

                    if data.get("delivery_fee") or data.get("delivery_minimum"):
                        logger.info(f"✅ {name}: fee={fee} min={minimum} provider={provider} delivery={avail}")
                    else:
                        logger.info(f"📋 {name}: delivery={avail} provider={provider} fee={fee} min={minimum}")

                    if data.get("page_text_matches"):
                        for m in data["page_text_matches"]:
                            logger.info(f"   📝 {m}")

                    # Queue DB update
                    db_updates.append((place_id, data))

                except Exception as e:
                    stats["errors"] += 1
                    logger.error(f"❌ {name}: unexpected error: {e}")
                finally:
                    try:
                        await page.close()
                    except Exception:
                        pass

        # Process in batches of 20 to avoid memory issues and batch DB writes
        batch_size = 20
        for i in range(0, len(targets), batch_size):
            batch = targets[i : i + batch_size]
            tasks = [process_restaurant(t) for t in batch]
            await asyncio.gather(*tasks, return_exceptions=True)

            # Batch write to DB after each batch
            if db_updates:
                batch_update_db(db_updates, dry_run=args.dry_run)
                db_updates.clear()

            logger.info(f"--- Batch {i // batch_size + 1} complete ({i + len(batch)}/{len(targets)}) ---")

        await browser.close()

    # Print summary
    print("\n" + "=" * 60)
    print("TOAST DELIVERY SCRAPE SUMMARY")
    print("=" * 60)
    print(f"Total targets:        {stats['total']}")
    print(f"Processed:            {stats['processed']}")
    print(f"Delivery available:   {stats['delivery_available']}")
    print(f"Fee found:            {stats['fee_found']}")
    print(f"Minimum found:        {stats['minimum_found']}")
    print(f"Errors:               {stats['errors']}")
    print(f"Cloudflare blocked:   {stats['cloudflare_blocked']}")
    print(f"Skipped (bad URL):    {stats['skipped_no_url']}")
    print(f"Providers:            {stats['providers']}")
    if args.dry_run:
        print("\n⚠️  DRY RUN — no DB changes made")
    print("=" * 60)


def main():
    parser = argparse.ArgumentParser(description="Scrape Toast delivery fees")
    parser.add_argument("--limit", type=int, default=None, help="Max restaurants to process")
    parser.add_argument("--dry-run", action="store_true", help="Don't update DB")
    args = parser.parse_args()

    asyncio.run(run(args))


if __name__ == "__main__":
    main()
