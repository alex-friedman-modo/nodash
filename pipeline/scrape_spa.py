"""
Playwright-based scraper for SPA sites and retry for failed fetches.
Targets: spa_no_content, http_404 (bare domain retry), http_403 (headless browser bypass).
"""

import asyncio
import json
import logging
import os
import re
import sqlite3
from datetime import datetime, timezone

from dotenv import load_dotenv
from playwright.async_api import async_playwright

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "restaurants.db")
MAX_TEXT = 8000
CONCURRENCY = 6
PAGE_TIMEOUT = 20000  # 20s per page

# Import LLM extraction from main scraper
import sys
sys.path.insert(0, os.path.dirname(__file__))
from scrape_websites import llm_extract, LLM_BACKEND, write_llm


def get_targets() -> list[dict]:
    """Get restaurants that failed with fixable errors."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("""
        SELECT place_id, name, website, fetch_error
        FROM restaurants
        WHERE fetch_error IN ('spa_no_content', 'http_404', 'http_403', 'timeout')
          AND website IS NOT NULL
    """).fetchall()
    conn.close()

    targets = []
    for r in rows:
        url = r["website"]
        # For 404s, strip to bare domain
        if r["fetch_error"] == "http_404":
            from urllib.parse import urlparse
            parsed = urlparse(url)
            url = f"{parsed.scheme}://{parsed.netloc}/"

        targets.append({
            "place_id": r["place_id"],
            "name": r["name"],
            "website": url,
            "original_error": r["fetch_error"],
        })

    return targets


def update_restaurant(place_id: str, text: str | None, error: str | None):
    """Update raw_text_preview and fetch status in DB."""
    conn = sqlite3.connect(DB_PATH)
    now = datetime.now(timezone.utc).isoformat()

    if text and len(text) > 100:
        conn.execute("""
            UPDATE restaurants SET
                raw_text_preview = ?,
                fetch_error = NULL,
                scrape_status = 'needs_llm',
                needs_llm = 1,
                pages_fetched = 1,
                scrape_updated = ?
            WHERE place_id = ?
        """, (text[:MAX_TEXT], now, place_id))
    elif error:
        conn.execute("""
            UPDATE restaurants SET
                fetch_error = ?,
                scrape_updated = ?
            WHERE place_id = ?
        """, (error, now, place_id))

    conn.commit()
    conn.close()


async def scrape_with_playwright(page, url: str, name: str) -> tuple[str | None, str | None]:
    """Fetch a page with Playwright, return (text, error)."""
    try:
        response = await page.goto(url, wait_until="networkidle", timeout=PAGE_TIMEOUT)

        if response is None:
            return None, "no_response"

        status = response.status
        if status == 404:
            return None, "http_404"
        if status == 403:
            return None, "http_403"
        if status >= 400:
            return None, f"http_{status}"

        # Wait a beat for JS rendering
        await page.wait_for_timeout(2000)

        # Extract text content
        text = await page.evaluate("""
            () => {
                // Remove script, style, nav, footer, header
                const remove = document.querySelectorAll('script, style, nav, footer, header, .cookie-banner, .popup, [role="banner"], [role="navigation"]');
                remove.forEach(el => el.remove());
                return document.body ? document.body.innerText : '';
            }
        """)

        if not text or len(text.strip()) < 50:
            return None, "no_content"

        # Clean up whitespace
        text = re.sub(r'\n{3,}', '\n\n', text.strip())
        return text[:MAX_TEXT], None

    except Exception as e:
        error_type = type(e).__name__
        if "timeout" in str(e).lower() or "Timeout" in error_type:
            return None, "timeout"
        logger.warning("  [%s] Playwright error: %s: %s", name[:30], error_type, str(e)[:100])
        return None, f"playwright_error"


async def process_batch(targets: list[dict]):
    """Process all targets with Playwright + LLM."""
    sem = asyncio.Semaphore(CONCURRENCY)
    llm_sem = asyncio.Semaphore(3)

    stats = {"fetched": 0, "llm_run": 0, "direct_found": 0, "still_failed": 0}

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 720},
            locale="en-US",
        )

        async def process_one(target: dict):
            async with sem:
                page = await context.new_page()
                try:
                    text, error = await scrape_with_playwright(
                        page, target["website"], target["name"]
                    )

                    if text:
                        stats["fetched"] += 1
                        update_restaurant(target["place_id"], text, None)

                        # Run LLM extraction
                        async with llm_sem:
                            result = await llm_extract(text)

                        if result:
                            stats["llm_run"] += 1
                            conn = sqlite3.connect(DB_PATH)
                            write_llm(conn, target["place_id"], result)
                            conn.commit()
                            conn.close()

                            if result.get("direct_delivery"):
                                stats["direct_found"] += 1
                                logger.info("  ✅ %s — direct delivery confirmed!", target["name"])
                        else:
                            # LLM returned nothing — mark as call_needed
                            conn = sqlite3.connect(DB_PATH)
                            conn.execute(
                                "UPDATE restaurants SET scrape_status='call_needed' WHERE place_id=?",
                                (target["place_id"],)
                            )
                            conn.commit()
                            conn.close()
                    else:
                        stats["still_failed"] += 1
                        update_restaurant(target["place_id"], None, error or "playwright_failed")

                finally:
                    await page.close()

        # Process all
        logger.info("Processing %d targets with Playwright + %s LLM...", len(targets), LLM_BACKEND)
        tasks = [process_one(t) for t in targets]

        # Process in chunks to avoid overwhelming browser
        chunk_size = 20
        for i in range(0, len(tasks), chunk_size):
            chunk = tasks[i:i + chunk_size]
            await asyncio.gather(*chunk)
            done = min(i + chunk_size, len(targets))
            logger.info("Progress: %d/%d (fetched=%d, direct=%d, failed=%d)",
                       done, len(targets), stats["fetched"], stats["direct_found"], stats["still_failed"])

        await browser.close()

    return stats


async def main():
    targets = get_targets()
    logger.info("Found %d targets to retry with Playwright", len(targets))

    by_error = {}
    for t in targets:
        e = t["original_error"]
        by_error[e] = by_error.get(e, 0) + 1
    for e, c in sorted(by_error.items(), key=lambda x: -x[1]):
        logger.info("  %s: %d", e, c)

    if not targets:
        logger.info("Nothing to do!")
        return

    stats = await process_batch(targets)

    logger.info("\n=== RESULTS ===")
    logger.info("Fetched successfully: %d", stats["fetched"])
    logger.info("LLM processed: %d", stats["llm_run"])
    logger.info("Direct delivery found: %d", stats["direct_found"])
    logger.info("Still failed: %d", stats["still_failed"])


if __name__ == "__main__":
    asyncio.run(main())
