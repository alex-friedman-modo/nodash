#!/usr/bin/env python3
"""
nodash — delivery details scraper

Phase 1: Find missing online_order_url for platform-identified restaurants
Phase 2: Scrape delivery fee / minimum / radius from platform ordering pages
Phase 3: LLM re-extraction from raw_text_preview for restaurants still missing data

Usage:
    uv run python pipeline/scrape_delivery_details.py                          # Phase 1+2, all platforms
    uv run python pipeline/scrape_delivery_details.py --platform slice         # single platform
    uv run python pipeline/scrape_delivery_details.py --limit 50              # test run
    uv run python pipeline/scrape_delivery_details.py --dry-run               # preview only
    uv run python pipeline/scrape_delivery_details.py --llm                   # Phase 3: LLM extraction
    uv run python pipeline/scrape_delivery_details.py --phase 1               # URL discovery only
    uv run python pipeline/scrape_delivery_details.py --phase 2               # scrape only
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import re
import sqlite3
import sys
import time
from pathlib import Path
from urllib.parse import quote, urlparse

import aiohttp
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

ROOT    = Path(__file__).parent.parent
DB_PATH = ROOT / "data" / "restaurants.db"

XAI_API_KEY = os.environ.get("XAI_API_KEY")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate",
}

# ── Rate limiter ──────────────────────────────────────────────────────────────

class RateLimiter:
    """Token-bucket style rate limiter."""
    def __init__(self, rate: float = 5.0):
        self.rate = rate
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


# ── DB helpers ────────────────────────────────────────────────────────────────

def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def get_restaurants_missing_url(platform: str, limit: int | None = None) -> list[dict]:
    """Get restaurants with ordering_method but no online_order_url."""
    conn = get_db()
    sql = """
        SELECT place_id, name, website, ordering_method, address, borough
        FROM restaurants
        WHERE ordering_method = ?
          AND (online_order_url IS NULL OR online_order_url = '')
          AND direct_delivery = 1
    """
    if limit:
        sql += f" LIMIT {limit}"
    rows = conn.execute(sql, (platform,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_restaurants_with_url(platform: str | None, limit: int | None = None) -> list[dict]:
    """Get restaurants that have online_order_url but missing delivery details."""
    conn = get_db()
    if platform and platform != "all":
        sql = """
            SELECT place_id, name, online_order_url, ordering_method, delivery_fee, delivery_minimum
            FROM restaurants
            WHERE ordering_method = ?
              AND online_order_url IS NOT NULL AND online_order_url != ''
              AND direct_delivery = 1
              AND (delivery_fee IS NULL OR delivery_fee = ''
                   OR delivery_minimum IS NULL OR delivery_minimum = '')
        """
        params: tuple = (platform,)
    else:
        sql = """
            SELECT place_id, name, online_order_url, ordering_method, delivery_fee, delivery_minimum
            FROM restaurants
            WHERE online_order_url IS NOT NULL AND online_order_url != ''
              AND direct_delivery = 1
              AND (delivery_fee IS NULL OR delivery_fee = ''
                   OR delivery_minimum IS NULL OR delivery_minimum = '')
        """
        params = ()
    if limit:
        sql += f" LIMIT {limit}"
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_restaurants_for_llm(limit: int | None = None) -> list[dict]:
    """Get restaurants with raw_text_preview but missing delivery details."""
    conn = get_db()
    sql = """
        SELECT place_id, name, raw_text_preview, ordering_method
        FROM restaurants
        WHERE raw_text_preview IS NOT NULL AND raw_text_preview != ''
          AND direct_delivery = 1
          AND (delivery_fee IS NULL OR delivery_fee = '')
          AND (delivery_minimum IS NULL OR delivery_minimum = '')
    """
    if limit:
        sql += f" LIMIT {limit}"
    rows = conn.execute(sql).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def update_delivery_details(place_id: str, updates: dict):
    """Update delivery columns for a restaurant."""
    conn = get_db()
    sets = []
    vals = []
    for col in ("delivery_fee", "delivery_minimum", "delivery_radius", "online_order_url"):
        if col in updates and updates[col]:
            sets.append(f"{col} = ?")
            vals.append(updates[col])
    if not sets:
        conn.close()
        return
    vals.append(place_id)
    conn.execute(f"UPDATE restaurants SET {', '.join(sets)} WHERE place_id = ?", vals)
    conn.commit()
    conn.close()


# ── Phase 1: URL discovery ───────────────────────────────────────────────────

async def find_slice_url(session: aiohttp.ClientSession, r: dict, limiter: RateLimiter) -> str | None:
    """Try to find Slice ordering URL for a restaurant."""
    # First: check if the restaurant website has a slice link
    website = r.get("website")
    if website:
        await limiter.acquire()
        try:
            async with session.get(website, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                if resp.status == 200:
                    html = await resp.text(errors="replace")
                    # Look for slicelife.com links
                    matches = re.findall(r'href=["\']([^"\']*slicelife\.com[^"\']*)["\']', html, re.I)
                    if matches:
                        url = matches[0]
                        if not url.startswith("http"):
                            url = "https:" + url if url.startswith("//") else "https://" + url
                        logger.info("  Found Slice URL in website HTML: %s", r["name"])
                        return url
                    # Also check for order.slice.com
                    matches = re.findall(r'href=["\']([^"\']*order\.slice\.com[^"\']*)["\']', html, re.I)
                    if matches:
                        url = matches[0]
                        if not url.startswith("http"):
                            url = "https:" + url if url.startswith("//") else "https://" + url
                        return url
        except Exception as e:
            logger.debug("  Error fetching website for %s: %s", r["name"], e)

    return None


async def find_toast_url(session: aiohttp.ClientSession, r: dict, limiter: RateLimiter) -> str | None:
    """Try to find Toast ordering URL by checking website HTML."""
    website = r.get("website")
    if not website:
        return None
    await limiter.acquire()
    try:
        async with session.get(website, timeout=aiohttp.ClientTimeout(total=15)) as resp:
            if resp.status == 200:
                html = await resp.text(errors="replace")
                matches = re.findall(
                    r'href=["\']([^"\']*(?:order\.toasttab\.com|www\.toasttab\.com)[^"\']*)["\']',
                    html, re.I,
                )
                if matches:
                    url = matches[0]
                    if not url.startswith("http"):
                        url = "https:" + url if url.startswith("//") else "https://" + url
                    logger.info("  Found Toast URL in website: %s", r["name"])
                    return url
    except Exception as e:
        logger.debug("  Error fetching website for %s: %s", r["name"], e)
    return None


async def find_chownow_url(session: aiohttp.ClientSession, r: dict, limiter: RateLimiter) -> str | None:
    """Try to find ChowNow ordering URL by checking website HTML."""
    website = r.get("website")
    if not website:
        return None
    await limiter.acquire()
    try:
        async with session.get(website, timeout=aiohttp.ClientTimeout(total=15)) as resp:
            if resp.status == 200:
                html = await resp.text(errors="replace")
                matches = re.findall(
                    r'href=["\']([^"\']*(?:ordering\.chownow\.com|direct\.chownow\.com)[^"\']*)["\']',
                    html, re.I,
                )
                if matches:
                    url = matches[0]
                    if not url.startswith("http"):
                        url = "https:" + url if url.startswith("//") else "https://" + url
                    logger.info("  Found ChowNow URL in website: %s", r["name"])
                    return url
    except Exception as e:
        logger.debug("  Error fetching website for %s: %s", r["name"], e)
    return None


async def find_menufy_url(session: aiohttp.ClientSession, r: dict, limiter: RateLimiter) -> str | None:
    """Try to find Menufy ordering URL by checking website HTML."""
    website = r.get("website")
    if not website:
        return None
    await limiter.acquire()
    try:
        async with session.get(website, timeout=aiohttp.ClientTimeout(total=15)) as resp:
            if resp.status == 200:
                html = await resp.text(errors="replace")
                matches = re.findall(
                    r'href=["\']([^"\']*menufy\.com[^"\']*)["\']',
                    html, re.I,
                )
                if matches:
                    url = matches[0]
                    if not url.startswith("http"):
                        url = "https:" + url if url.startswith("//") else "https://" + url
                    logger.info("  Found Menufy URL in website: %s", r["name"])
                    return url
    except Exception as e:
        logger.debug("  Error fetching website for %s: %s", r["name"], e)
    return None


URL_FINDERS = {
    "slice":   find_slice_url,
    "toast":   find_toast_url,
    "chownow": find_chownow_url,
    "menufy":  find_menufy_url,
}


async def phase1_discover_urls(platforms: list[str], limit: int | None, dry_run: bool):
    """Phase 1: Find missing online_order_url for platform restaurants."""
    logger.info("═══ Phase 1: URL Discovery ═══")
    total_found = 0
    total_checked = 0

    connector = aiohttp.TCPConnector(limit=10, ssl=False)
    async with aiohttp.ClientSession(headers=HEADERS, connector=connector) as session:
        limiter = RateLimiter(rate=5.0)

        for platform in platforms:
            if platform not in URL_FINDERS:
                logger.info("  No URL finder for platform '%s', skipping Phase 1", platform)
                continue

            restaurants = get_restaurants_missing_url(platform, limit)
            if not restaurants:
                logger.info("  %s: no restaurants missing URLs", platform)
                continue

            logger.info("  %s: checking %d restaurants for URLs...", platform, len(restaurants))
            finder = URL_FINDERS[platform]
            found = 0

            for r in restaurants:
                total_checked += 1
                url = await finder(session, r, limiter)
                if url:
                    found += 1
                    total_found += 1
                    if dry_run:
                        logger.info("  [DRY-RUN] Would set URL for %s: %s", r["name"], url[:80])
                    else:
                        update_delivery_details(r["place_id"], {"online_order_url": url})
                        logger.info("  ✓ Set URL for %s", r["name"])

            logger.info("  %s: found %d/%d URLs", platform, found, len(restaurants))

    logger.info("Phase 1 complete: found %d new URLs out of %d checked", total_found, total_checked)
    return total_found


# ── Phase 2: Scrape delivery details ─────────────────────────────────────────

# Platform-specific extraction patterns

def _extract_fee(html: str, patterns: list[str]) -> str | None:
    """Try fee patterns, return fee string or None."""
    for pat in patterns:
        m = re.search(pat, html)
        if m:
            if "[Ff]ree" in pat or "free" in pat.lower():
                return "Free"
            try:
                return f"${m.group(1)}"
            except IndexError:
                return "Free"
    return None


def _extract_minimum(html: str, patterns: list[str]) -> str | None:
    """Try minimum patterns, return value or None."""
    for pat in patterns:
        m = re.search(pat, html)
        if m:
            val = m.group(1)
            try:
                fval = float(val)
                if 1 <= fval <= 200:
                    return f"${val}"
            except ValueError:
                pass
    return None


def _extract_radius(html: str) -> str | None:
    """Try radius patterns."""
    for pat in [
        r'(\d+\.?\d*)\s*(?:mile|mi)\s*(?:radius|delivery|range)',
        r'[Dd]elivery\s*(?:radius|range|area)[:\s]*(\d+\.?\d*)\s*(?:mile|mi)',
    ]:
        m = re.search(pat, html)
        if m:
            return f"{m.group(1)} miles"
    return None


def extract_from_toast(html: str) -> dict:
    """Extract delivery details from Toast ordering page."""
    result = {}

    fee = _extract_fee(html, [
        r'[Dd]elivery\s*[Ff]ee[:\s]*\$?([\d]+\.?\d*)',
        r'\$(\d+\.?\d*)\s*delivery\s*fee',
        r'"deliveryFee"[:\s]*["\']?\$?([\d]+\.?\d*)',
        r'"deliveryServiceChargeAmount"[:\s]*([\d]+\.?\d*)',
        r'[Ff]ree\s+[Dd]elivery',
    ])
    if fee:
        result["delivery_fee"] = fee

    minimum = _extract_minimum(html, [
        r'[Dd]elivery\s*[Mm]in(?:imum)?[:\s]*\$?([\d]+\.?\d*)',
        r'[Mm]in(?:imum)?\s*(?:order|delivery)[:\s]*\$?([\d]+\.?\d*)',
        r'\$(\d+\.?\d*)\s*(?:order\s*)?minimum',
        r'"deliveryMinimum"[:\s]*["\']?\$?([\d]+\.?\d*)',
        r'[Mm]inimum\s*\$(\d+\.?\d*)',
    ])
    if minimum:
        result["delivery_minimum"] = minimum

    radius = _extract_radius(html)
    if radius:
        result["delivery_radius"] = radius

    return result


def extract_from_slice(html: str) -> dict:
    """Extract delivery details from Slice ordering page."""
    result = {}

    fee = _extract_fee(html, [
        r'[Dd]elivery\s*[Ff]ee[:\s]*\$?([\d]+\.?\d*)',
        r'\$(\d+\.?\d*)\s*delivery',
        r'[Ff]ree\s+[Dd]elivery',
        r'"deliveryFee"[:\s]*["\']?\$?([\d]+\.?\d*)',
        r'[Dd]elivery\s*[Cc]harge[:\s]*\$?([\d]+\.?\d*)',
    ])
    if fee:
        result["delivery_fee"] = fee

    minimum = _extract_minimum(html, [
        r'[Mm]in(?:imum)?\s*(?:order)?[:\s]*\$?([\d]+\.?\d*)',
        r'\$(\d+\.?\d*)\s*minimum',
        r'[Oo]rder\s*[Mm]in(?:imum)?[:\s]*\$?([\d]+\.?\d*)',
    ])
    if minimum:
        result["delivery_minimum"] = minimum

    return result


def extract_from_chownow(html: str) -> dict:
    """Extract delivery details from ChowNow ordering page."""
    result = {}

    fee = _extract_fee(html, [
        r'[Dd]elivery\s*[Ff]ee[:\s]*\$?([\d]+\.?\d*)',
        r'\$(\d+\.?\d*)\s*delivery\s*fee',
        r'[Ff]ree\s+[Dd]elivery',
    ])
    if fee:
        result["delivery_fee"] = fee

    minimum = _extract_minimum(html, [
        r'[Mm]in(?:imum)?[:\s]*\$?([\d]+\.?\d*)',
        r'\$(\d+\.?\d*)\s*minimum',
        r'[Oo]rder\s*[Mm]in(?:imum)?[:\s]*\$?([\d]+\.?\d*)',
    ])
    if minimum:
        result["delivery_minimum"] = minimum

    return result


def extract_from_sauce(html: str) -> dict:
    """Extract delivery details from Sauce ordering page."""
    result = {}

    fee = _extract_fee(html, [
        r'[Dd]elivery\s*[Ff]ee[:\s]*\$?([\d]+\.?\d*)',
        r'\$(\d+\.?\d*)\s*delivery',
        r'[Ff]ree\s+[Dd]elivery',
        r'"delivery_fee"[:\s]*["\']?\$?([\d]+\.?\d*)',
    ])
    if fee:
        result["delivery_fee"] = fee

    minimum = _extract_minimum(html, [
        r'[Mm]in(?:imum)?\s*(?:order)?[:\s]*\$?([\d]+\.?\d*)',
        r'\$(\d+\.?\d*)\s*minimum',
    ])
    if minimum:
        result["delivery_minimum"] = minimum

    return result


def extract_generic(html: str) -> dict:
    """Generic extraction using broad regex patterns."""
    result = {}

    fee = _extract_fee(html, [
        r'[Dd]elivery\s*[Ff]ee[:\s]*\$?([\d]+\.?\d*)',
        r'\$(\d+\.?\d*)\s*delivery\s*fee',
        r'[Ff]ree\s+[Dd]elivery',
        r'[Dd]elivery[:\s]*[Ff]ree',
        r'"delivery_fee"[:\s]*"?\$?([\d]+\.?\d*)',
        r'"deliveryFee"[:\s]*"?\$?([\d]+\.?\d*)',
    ])
    if fee:
        result["delivery_fee"] = fee

    minimum = _extract_minimum(html, [
        r'[Dd]elivery\s*[Mm]in(?:imum)?[:\s]*\$?([\d]+\.?\d*)',
        r'[Mm]in(?:imum)?\s*(?:order|delivery)[:\s]*\$?([\d]+\.?\d*)',
        r'\$(\d+\.?\d*)\s*(?:order\s*)?minimum',
        r'"(?:delivery_?)?[Mm]inimum"[:\s]*"?\$?([\d]+\.?\d*)',
        r'[Mm]inimum\s*\$(\d+\.?\d*)',
    ])
    if minimum:
        result["delivery_minimum"] = minimum

    radius = _extract_radius(html)
    if radius:
        result["delivery_radius"] = radius

    return result


PLATFORM_EXTRACTORS = {
    "toast":   extract_from_toast,
    "slice":   extract_from_slice,
    "chownow": extract_from_chownow,
    "sauce":   extract_from_sauce,
}


def detect_platform_from_url(url: str) -> str | None:
    """Detect which platform an ordering URL belongs to."""
    if not url:
        return None
    url_lower = url.lower()
    if "toasttab.com" in url_lower:
        return "toast"
    if "slicelife.com" in url_lower or "order.slice.com" in url_lower:
        return "slice"
    if "chownow.com" in url_lower:
        return "chownow"
    if "getsauce.com" in url_lower:
        return "sauce"
    if "menufy.com" in url_lower:
        return "menufy"
    if "beyondmenu.com" in url_lower or "beyond.menu" in url_lower:
        return "beyondmenu"
    if "square" in url_lower:
        return "square"
    if "dine.online" in url_lower:
        return "dine_online"
    return None


async def scrape_one(
    session: aiohttp.ClientSession,
    r: dict,
    limiter: RateLimiter,
    dry_run: bool,
) -> dict | None:
    """Fetch one ordering URL and extract delivery details."""
    url = r["online_order_url"]
    name = r["name"]
    platform = r.get("ordering_method") or detect_platform_from_url(url)

    await limiter.acquire()
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=20), allow_redirects=True) as resp:
            if resp.status != 200:
                logger.debug("  HTTP %d for %s", resp.status, name)
                return None
            html = await resp.text(errors="replace")
    except Exception as e:
        logger.debug("  Error fetching %s: %s", name, e)
        return None

    if len(html) < 100:
        return None

    # Use platform-specific extractor, fall back to generic
    extractor = PLATFORM_EXTRACTORS.get(platform, extract_generic)
    result = extractor(html)

    # Also try generic if platform-specific found nothing
    if not result and extractor != extract_generic:
        result = extract_generic(html)

    if result:
        # Don't overwrite existing values
        if r.get("delivery_fee") and "delivery_fee" in result:
            del result["delivery_fee"]
        if r.get("delivery_minimum") and "delivery_minimum" in result:
            del result["delivery_minimum"]

        if result:  # still has something to update
            if dry_run:
                logger.info("  [DRY-RUN] %s → %s", name, result)
            else:
                update_delivery_details(r["place_id"], result)
                logger.info("  ✓ %s → %s", name, result)
            return result

    return None


async def phase2_scrape_details(platform: str | None, limit: int | None, dry_run: bool):
    """Phase 2: Scrape delivery details from ordering URLs."""
    logger.info("═══ Phase 2: Scrape Delivery Details ═══")

    restaurants = get_restaurants_with_url(platform, limit)
    if not restaurants:
        logger.info("  No restaurants with URLs needing delivery details")
        return 0

    logger.info("  Found %d restaurants to scrape", len(restaurants))

    connector = aiohttp.TCPConnector(limit=10, ssl=False)
    async with aiohttp.ClientSession(headers=HEADERS, connector=connector) as session:
        limiter = RateLimiter(rate=5.0)

        found_count = 0
        error_count = 0
        by_platform: dict[str, int] = {}

        for i, r in enumerate(restaurants, 1):
            if i % 50 == 0:
                logger.info("  Progress: %d/%d (found: %d)", i, len(restaurants), found_count)

            result = await scrape_one(session, r, limiter, dry_run)
            if result:
                found_count += 1
                plat = r.get("ordering_method", "unknown")
                by_platform[plat] = by_platform.get(plat, 0) + 1

        logger.info("Phase 2 complete: extracted details for %d/%d restaurants", found_count, len(restaurants))
        if by_platform:
            logger.info("  By platform: %s", dict(sorted(by_platform.items(), key=lambda x: -x[1])))

    return found_count


# ── Phase 3: LLM re-extraction ───────────────────────────────────────────────

LLM_PROMPT = """Extract delivery fee, delivery minimum order amount, and delivery radius from this restaurant website text.

Return ONLY valid JSON with these exact keys:
{
  "delivery_fee": "<fee or 'Free' or null>",
  "delivery_minimum": "<minimum or null>",
  "delivery_radius": "<radius or null>"
}

Use dollar amounts like "$5.00" for fees/minimums. Use null for values you cannot find.
Do NOT guess or make up values. Only extract what is explicitly stated.

Restaurant website text:
---
{text}
---"""


async def llm_extract_delivery(
    session: aiohttp.ClientSession,
    text: str,
    semaphore: asyncio.Semaphore,
) -> dict | None:
    """Call Grok API to extract delivery details from text."""
    if not XAI_API_KEY:
        logger.error("XAI_API_KEY not set — cannot run LLM phase")
        return None

    truncated = text[:6000]
    prompt = LLM_PROMPT.replace("{text}", truncated)

    payload = {
        "model": "grok-4-1-fast-non-reasoning",
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 256,
        "temperature": 0,
    }
    headers = {
        "Authorization": f"Bearer {XAI_API_KEY}",
        "Content-Type": "application/json",
    }

    async with semaphore:
        for attempt in range(3):
            try:
                async with session.post(
                    "https://api.x.ai/v1/chat/completions",
                    headers=headers,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=30),
                ) as resp:
                    if resp.status == 429:
                        wait = 5 * (attempt + 1)
                        logger.warning("  LLM rate limited, waiting %ds", wait)
                        await asyncio.sleep(wait)
                        continue
                    if resp.status != 200:
                        logger.warning("  LLM HTTP %d", resp.status)
                        return None
                    data = await resp.json()
                    raw = data["choices"][0]["message"]["content"].strip()

                    # Strip markdown fences
                    if raw.startswith("```"):
                        raw = re.sub(r"^```(?:json)?\s*", "", raw)
                        raw = re.sub(r"\s*```$", "", raw)

                    result = json.loads(raw)

                    # Filter out nulls
                    cleaned = {}
                    for key in ("delivery_fee", "delivery_minimum", "delivery_radius"):
                        val = result.get(key)
                        if val and val != "null" and val != "None":
                            cleaned[key] = val

                    return cleaned if cleaned else None

            except asyncio.TimeoutError:
                wait = 2 ** attempt
                logger.warning("  LLM timeout (attempt %d/3)", attempt + 1)
                await asyncio.sleep(wait)
            except (json.JSONDecodeError, KeyError) as e:
                logger.debug("  LLM parse error: %s", e)
                return None
            except Exception as e:
                logger.warning("  LLM error: %s", e)
                return None

    return None


async def phase3_llm_extraction(limit: int | None, dry_run: bool):
    """Phase 3: Use LLM to extract delivery details from raw_text_preview."""
    logger.info("═══ Phase 3: LLM Re-extraction ═══")

    if not XAI_API_KEY:
        logger.error("XAI_API_KEY not set — skipping LLM phase")
        return 0

    restaurants = get_restaurants_for_llm(limit)
    if not restaurants:
        logger.info("  No restaurants eligible for LLM extraction")
        return 0

    logger.info("  Found %d restaurants for LLM extraction", len(restaurants))

    semaphore = asyncio.Semaphore(3)
    connector = aiohttp.TCPConnector(limit=5, ssl=False)
    async with aiohttp.ClientSession(connector=connector) as session:
        found_count = 0

        for i, r in enumerate(restaurants, 1):
            if i % 25 == 0:
                logger.info("  LLM progress: %d/%d (found: %d)", i, len(restaurants), found_count)

            text = r["raw_text_preview"]
            if not text or len(text.strip()) < 50:
                continue

            result = await llm_extract_delivery(session, text, semaphore)
            if result:
                found_count += 1
                if dry_run:
                    logger.info("  [DRY-RUN] %s → %s", r["name"], result)
                else:
                    update_delivery_details(r["place_id"], result)
                    logger.info("  ✓ LLM %s → %s", r["name"], result)

        logger.info("Phase 3 complete: extracted details for %d/%d restaurants", found_count, len(restaurants))

    return found_count


# ── Summary stats ─────────────────────────────────────────────────────────────

def print_summary():
    """Print current delivery data coverage stats."""
    conn = get_db()
    total = conn.execute(
        "SELECT COUNT(*) FROM restaurants WHERE direct_delivery=1"
    ).fetchone()[0]
    has_url = conn.execute(
        "SELECT COUNT(*) FROM restaurants WHERE direct_delivery=1 AND online_order_url IS NOT NULL AND online_order_url != ''"
    ).fetchone()[0]
    has_fee = conn.execute(
        "SELECT COUNT(*) FROM restaurants WHERE direct_delivery=1 AND delivery_fee IS NOT NULL AND delivery_fee != ''"
    ).fetchone()[0]
    has_min = conn.execute(
        "SELECT COUNT(*) FROM restaurants WHERE direct_delivery=1 AND delivery_minimum IS NOT NULL AND delivery_minimum != ''"
    ).fetchone()[0]
    has_radius = conn.execute(
        "SELECT COUNT(*) FROM restaurants WHERE direct_delivery=1 AND delivery_radius IS NOT NULL AND delivery_radius != ''"
    ).fetchone()[0]

    logger.info("═══ Summary ═══")
    logger.info("  Total direct delivery restaurants: %d", total)
    logger.info("  With order URL:      %d (%d%%)", has_url, has_url * 100 // total if total else 0)
    logger.info("  With delivery fee:   %d (%d%%)", has_fee, has_fee * 100 // total if total else 0)
    logger.info("  With delivery min:   %d (%d%%)", has_min, has_min * 100 // total if total else 0)
    logger.info("  With delivery radius:%d (%d%%)", has_radius, has_radius * 100 // total if total else 0)

    # Per-platform breakdown
    rows = conn.execute("""
        SELECT ordering_method,
               COUNT(*) as total,
               SUM(CASE WHEN online_order_url IS NOT NULL AND online_order_url != '' THEN 1 ELSE 0 END) as urls,
               SUM(CASE WHEN delivery_fee IS NOT NULL AND delivery_fee != '' THEN 1 ELSE 0 END) as fees,
               SUM(CASE WHEN delivery_minimum IS NOT NULL AND delivery_minimum != '' THEN 1 ELSE 0 END) as mins
        FROM restaurants
        WHERE direct_delivery=1 AND ordering_method IS NOT NULL AND ordering_method != ''
        GROUP BY ordering_method
        ORDER BY COUNT(*) DESC
    """).fetchall()

    logger.info("  ─── By Platform ───")
    for r in rows:
        logger.info("  %-20s total=%-4d urls=%-4d fees=%-4d mins=%-4d",
                     r[0], r[1], r[2], r[3], r[4])

    conn.close()


# ── Main ──────────────────────────────────────────────────────────────────────

ALL_PLATFORMS = ["slice", "toast", "chownow", "menufy"]


async def main():
    parser = argparse.ArgumentParser(description="Scrape delivery details from platform ordering pages")
    parser.add_argument("--platform", default="all", help="Platform to target (toast|slice|chownow|menufy|sauce|all)")
    parser.add_argument("--limit", type=int, default=None, help="Max restaurants to process")
    parser.add_argument("--dry-run", action="store_true", help="Preview changes without writing to DB")
    parser.add_argument("--llm", action="store_true", help="Enable Phase 3: LLM re-extraction")
    parser.add_argument("--phase", type=int, choices=[1, 2, 3], default=None,
                        help="Run only a specific phase (1=URL discovery, 2=scrape, 3=LLM)")
    parser.add_argument("--stats", action="store_true", help="Print summary stats and exit")
    args = parser.parse_args()

    if args.stats:
        print_summary()
        return

    platforms = ALL_PLATFORMS if args.platform == "all" else [args.platform]
    run_phase1 = args.phase is None or args.phase == 1
    run_phase2 = args.phase is None or args.phase == 2
    run_phase3 = args.llm or args.phase == 3

    logger.info("Config: platforms=%s limit=%s dry_run=%s llm=%s phase=%s",
                platforms, args.limit, args.dry_run, args.llm, args.phase)

    print_summary()
    print()

    if run_phase1:
        await phase1_discover_urls(platforms, args.limit, args.dry_run)
        print()

    if run_phase2:
        await phase2_scrape_details(
            args.platform if args.platform != "all" else None,
            args.limit,
            args.dry_run,
        )
        print()

    if run_phase3:
        await phase3_llm_extraction(args.limit, args.dry_run)
        print()

    print_summary()


if __name__ == "__main__":
    asyncio.run(main())
