#!/usr/bin/env python3
"""
nodash - website scrape pass

For each restaurant with a website:
1. Fetch the HTML
2. Convert to clean markdown via trafilatura (strips nav/footer/ads)
3. Keyword scan for free delivery, third-party app mentions, ordering method
4. Store results in DB, flag for LLM pass if ambiguous

Run after build_db.py. Skips already-scraped restaurants unless --rescrape.
"""

import asyncio, json, re, sqlite3, sys, time
from pathlib import Path

import httpx
import trafilatura

ROOT    = Path(__file__).parent.parent
DB_PATH = ROOT / "data" / "restaurants.db"

# ── Keyword sets ──────────────────────────────────────────────────────────────

FREE_DELIVERY = [
    "free delivery", "no delivery fee", "no charge for delivery",
    "delivery at no", "complimentary delivery", "free shipping",
]

HAS_DELIVERY_FEE = [
    "delivery fee", "delivery charge", "$1 delivery", "$2 delivery",
    "$3 delivery", "$4 delivery", "$5 delivery",
]

THIRD_PARTY = [
    "doordash", "door dash", "ubereats", "uber eats", "grubhub",
    "seamless", "caviar", "postmates", "instacart",
]

DIRECT_ORDER_SIGNALS = [
    "call to order", "call us to order", "order by phone", "phone orders",
    "call for delivery", "we deliver", "order direct", "order online",
    "place your order", "order now",
]

MIN_ORDER = [
    "minimum order", "minimum delivery", "delivery minimum",
    "order minimum", "min order", "min delivery",
]

DELIVERY_RADIUS = [
    "delivery radius", "delivery area", "we deliver to", "delivery zone",
    "mile radius", "miles away", "blocks away",
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def find_keywords(text: str, keywords: list[str]) -> list[str]:
    text_lower = text.lower()
    return [kw for kw in keywords if kw in text_lower]


def extract_snippet(text: str, keyword: str, context: int = 80) -> str:
    idx = text.lower().find(keyword.lower())
    if idx < 0:
        return ""
    start = max(0, idx - context // 2)
    end   = min(len(text), idx + len(keyword) + context // 2)
    return text[start:end].replace("\n", " ").strip()


def classify(text: str) -> dict:
    """Return a classification dict from the scraped markdown text."""
    found_free     = find_keywords(text, FREE_DELIVERY)
    found_fee      = find_keywords(text, HAS_DELIVERY_FEE)
    found_3p       = find_keywords(text, THIRD_PARTY)
    found_direct   = find_keywords(text, DIRECT_ORDER_SIGNALS)
    found_min      = find_keywords(text, MIN_ORDER)
    found_radius   = find_keywords(text, DELIVERY_RADIUS)

    # Determine delivery fee status
    if found_free:
        delivery_fee_status = "free"
    elif found_fee:
        delivery_fee_status = "has_fee"
    else:
        delivery_fee_status = "unknown"

    # Determine if they use third-party apps
    third_party_only = bool(found_3p) and not bool(found_direct) and not bool(found_free)

    # Pull best snippets
    snippets = []
    for kw in found_free + found_fee + found_min + found_radius:
        s = extract_snippet(text, kw)
        if s:
            snippets.append(s)

    return {
        "delivery_fee_status": delivery_fee_status,
        "third_party_detected": bool(found_3p),
        "third_party_apps":     found_3p,
        "third_party_only":     third_party_only,
        "direct_order_signals": found_direct,
        "min_order_keywords":   found_min,
        "radius_keywords":      found_radius,
        "snippets":             snippets[:3],
        "needs_llm":            delivery_fee_status == "unknown" and not third_party_only,
    }


async def fetch_and_extract(client: httpx.AsyncClient, url: str) -> str | None:
    """Fetch URL and return clean markdown via trafilatura."""
    try:
        resp = await client.get(url, timeout=10, follow_redirects=True)
        resp.raise_for_status()
        markdown = trafilatura.extract(
            resp.text,
            output_format="markdown",
            include_links=False,
            include_images=False,
            favor_recall=True,   # keep more content
        )
        return markdown
    except Exception:
        return None


# ── Main ──────────────────────────────────────────────────────────────────────

async def run(rescrape: bool = False, limit: int | None = None, borough: str | None = None):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    # Add scrape columns if not present
    for col, typedef in [
        ("scrape_status",         "TEXT"),
        ("scrape_markdown",       "TEXT"),
        ("delivery_fee_status",   "TEXT"),
        ("third_party_detected",  "INTEGER"),
        ("third_party_only",      "INTEGER"),
        ("direct_order_signals",  "TEXT"),
        ("scrape_snippets",       "TEXT"),
        ("needs_llm",             "INTEGER"),
        ("scrape_updated",        "TEXT"),
    ]:
        try:
            conn.execute(f"ALTER TABLE restaurants ADD COLUMN {col} {typedef}")
        except Exception:
            pass  # column already exists
    conn.commit()

    query = "SELECT place_id, name, website FROM restaurants WHERE website IS NOT NULL"
    if not rescrape:
        query += " AND scrape_status IS NULL"
    if borough:
        query += f" AND borough = '{borough}'"
    if limit:
        query += f" LIMIT {limit}"

    rows = conn.execute(query).fetchall()
    print(f"🔍 Scraping {len(rows)} restaurants...\n")

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                      "AppleWebKit/537.36 (KHTML, like Gecko) "
                      "Chrome/122.0.0.0 Safari/537.36"
    }

    counts = {"free": 0, "has_fee": 0, "unknown": 0, "third_party": 0, "error": 0}

    async with httpx.AsyncClient(headers=headers, verify=False) as client:
        for i, row in enumerate(rows, 1):
            pid, name, website = row["place_id"], row["name"], row["website"]

            markdown = await fetch_and_extract(client, website)

            if not markdown:
                conn.execute(
                    "UPDATE restaurants SET scrape_status='error', scrape_updated=datetime('now') WHERE place_id=?",
                    (pid,)
                )
                counts["error"] += 1
                if i % 10 == 0 or not markdown:
                    print(f"  [{i}/{len(rows)}] ❌ {name[:40]} — fetch error")
                conn.commit()
                await asyncio.sleep(0.2)
                continue

            result = classify(markdown)
            status = result["delivery_fee_status"]
            counts[status] = counts.get(status, 0) + 1
            if result["third_party_only"]:
                counts["third_party"] += 1

            icon = {"free": "✅", "has_fee": "💰", "unknown": "❓"}.get(status, "❓")
            tp   = " ⚠️ 3P" if result["third_party_detected"] else ""
            llm  = " 🤖" if result["needs_llm"] else ""
            print(f"  [{i}/{len(rows)}] {icon}{tp}{llm} {name[:45]}")
            if result["snippets"]:
                print(f"         → {result['snippets'][0][:90]}")

            conn.execute("""
                UPDATE restaurants SET
                    scrape_status        = ?,
                    scrape_markdown      = ?,
                    delivery_fee_status  = ?,
                    third_party_detected = ?,
                    third_party_only     = ?,
                    direct_order_signals = ?,
                    scrape_snippets      = ?,
                    needs_llm            = ?,
                    scrape_updated       = datetime('now')
                WHERE place_id = ?
            """, (
                "ok",
                markdown[:50000],  # cap at 50k chars
                status,
                1 if result["third_party_detected"] else 0,
                1 if result["third_party_only"]     else 0,
                json.dumps(result["direct_order_signals"]),
                json.dumps(result["snippets"]),
                1 if result["needs_llm"]            else 0,
                pid,
            ))
            conn.commit()
            await asyncio.sleep(0.15)  # be polite

    conn.close()
    print(f"\n✅ Done.")
    print(f"   Free delivery confirmed:  {counts['free']}")
    print(f"   Has fee (not free):       {counts['has_fee']}")
    print(f"   Unknown (needs LLM/call): {counts['unknown']}")
    print(f"   Third-party app only:     {counts['third_party']}")
    print(f"   Fetch errors:             {counts['error']}")


if __name__ == "__main__":
    import warnings
    warnings.filterwarnings("ignore")  # suppress SSL warnings

    rescrape = "--rescrape" in sys.argv
    borough  = next((a for a in sys.argv[1:] if a in
                     ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"]), None)
    limit    = next((int(a) for a in sys.argv[1:] if a.isdigit()), None)

    asyncio.run(run(rescrape=rescrape, limit=limit, borough=borough))
