"""Clean broken/wrong online_order_url entries in the restaurants DB."""

import sqlite3
import re
import asyncio
import aiohttp
from urllib.parse import urlparse
from collections import Counter

DB_PATH = "/home/ccloud/clawd/projects/nodash/data/restaurants.db"

# Patterns in URL path that indicate non-restaurant pages
BAD_PATH_PATTERNS = [
    "/terms", "/privacy", "/about-us", "/help", "/support", "/careers",
    "/login", "/signup", "/register", "/policy", "/rewardsSignup",
    "/manifest.json", "/favicon",
]

# Platform homepages (exact match after normalization)
PLATFORM_HOMEPAGES = {
    "slicelife.com", "www.slicelife.com",
    "toasttab.com", "www.toasttab.com",
    "chownow.com", "www.chownow.com",
    "ordering.chownow.com",
    "beyondmenu.com", "www.beyondmenu.com",
    "whereyoueat.com", "www.whereyoueat.com",
    "ezordernow.com", "www.ezordernow.com",
    "getsauce.com", "www.getsauce.com",
    "checkout.menufy.com",
    "pos.toasttab.com",
    "order.toasttab.com",
}

# Chain restaurant homepages (not individual order pages)
CHAIN_HOMEPAGES = {
    "shakeshack.com", "www.shakeshack.com",
    "pizzahut.com", "www.pizzahut.com",
    "tacombi.com", "www.tacombi.com",
    "wonder.com", "www.wonder.com",
    "chipotle.com", "www.chipotle.com",
}


def is_bad_pattern(url: str) -> str | None:
    """Check if URL matches known bad patterns. Returns reason or None."""
    url_lower = url.lower()
    
    # Check bad path patterns
    for pattern in BAD_PATH_PATTERNS:
        if pattern.lower() in url_lower:
            return f"bad_pattern:{pattern}"
    
    # Check if it's just a platform homepage
    try:
        parsed = urlparse(url)
        host = parsed.hostname or ""
        path = parsed.path.rstrip("/")
        
        # Pure homepage (no meaningful path)
        if host.lower() in PLATFORM_HOMEPAGES and path in ("", "/"):
            return f"platform_homepage:{host}"
        
        # Chain homepages
        if host.lower() in CHAIN_HOMEPAGES and path in ("", "/"):
            return f"chain_homepage:{host}"
            
        # toasttab.com/local is not a real restaurant page
        if host.lower() in ("toasttab.com", "www.toasttab.com") and path == "/local":
            return "platform_homepage:toasttab/local"
            
        # checkout.menufy.com with no path
        if host.lower() == "checkout.menufy.com" and path in ("", "/"):
            return "platform_homepage:menufy"
            
        # order.chipotle.com (chain, not individual restaurant)
        if "chipotle.com" in host.lower():
            return "chain_homepage:chipotle"
            
    except Exception:
        pass
    
    return None


async def check_url(session: aiohttp.ClientSession, url: str) -> tuple[str, str]:
    """HEAD-check a URL. Returns (url, status) where status is 'ok', 'dead', or 'error'."""
    try:
        # Try HEAD first, fall back to GET if 405
        async with session.head(url, timeout=aiohttp.ClientTimeout(total=5),
                                allow_redirects=True, ssl=False) as resp:
            if resp.status == 405:
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=5),
                                       allow_redirects=True, ssl=False) as resp2:
                    if resp2.status == 200:
                        # Check if redirected to a platform homepage
                        final = str(resp2.url)
                        reason = is_bad_pattern(final)
                        if reason:
                            return (url, f"redirect_bad:{reason}")
                        return (url, "ok")
                    elif resp2.status in (404, 410, 403):
                        return (url, f"dead:{resp2.status}")
                    else:
                        return (url, f"other:{resp2.status}")
            elif resp.status == 200:
                final = str(resp.url)
                reason = is_bad_pattern(final)
                if reason:
                    return (url, f"redirect_bad:{reason}")
                return (url, "ok")
            elif resp.status in (404, 410):
                return (url, f"dead:{resp.status}")
            elif resp.status == 403:
                # Many sites block HEAD with 403 but work fine - don't kill these
                return (url, "ok_assumed")
            else:
                return (url, f"other:{resp.status}")
    except aiohttp.ClientConnectorError:
        return (url, "dns_failure")
    except asyncio.TimeoutError:
        return (url, "timeout")
    except Exception as e:
        return (url, f"error:{type(e).__name__}")


async def check_urls_batch(urls: list[str]) -> dict[str, str]:
    """Check a batch of URLs concurrently."""
    connector = aiohttp.TCPConnector(limit=50, ttl_dns_cache=300)
    async with aiohttp.ClientSession(
        connector=connector,
        headers={"User-Agent": "Mozilla/5.0 (compatible; nodash-checker/1.0)"}
    ) as session:
        tasks = [check_url(session, url) for url in urls]
        results = await asyncio.gather(*tasks)
    return dict(results)


def main():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    
    # Get all URLs
    rows = cur.execute(
        "SELECT place_id, online_order_url FROM restaurants WHERE direct_delivery=1 AND online_order_url IS NOT NULL"
    ).fetchall()
    
    print(f"Total restaurants with direct_delivery=1 and online_order_url: {len(rows)}")
    
    # Phase 1: Pattern-based cleanup
    pattern_nulled = []  # (id, url, reason)
    urls_to_check = []   # (id, url)
    
    for pid, url in rows:
        reason = is_bad_pattern(url)
        if reason:
            pattern_nulled.append((pid, url, reason))
        else:
            urls_to_check.append((pid, url))
    
    print(f"\nPhase 1 - Pattern-based cleanup: {len(pattern_nulled)} URLs to NULL")
    reason_counts = Counter(r for _, _, r in pattern_nulled)
    for reason, count in reason_counts.most_common():
        print(f"  {reason}: {count}")
    
    # Apply pattern-based NULLs
    if pattern_nulled:
        ids = [pid for pid, _, _ in pattern_nulled]
        placeholders = ",".join("?" * len(ids))
        cur.execute(f"UPDATE restaurants SET online_order_url = NULL WHERE place_id IN ({placeholders})", ids)
        conn.commit()
        print(f"  → NULLed {cur.rowcount} rows")
    
    # Phase 2: HTTP checks on remaining URLs
    unique_urls = list(set(url for _, url in urls_to_check))
    print(f"\nPhase 2 - HTTP checking {len(unique_urls)} unique URLs ({len(urls_to_check)} rows)...")
    
    url_status = asyncio.run(check_urls_batch(unique_urls))
    
    # Categorize results
    http_nulled = []
    verified_good = []
    uncertain = []
    
    for pid, url in urls_to_check:
        status = url_status.get(url, "unknown")
        if status.startswith("dead:") or status == "dns_failure" or status.startswith("redirect_bad:"):
            http_nulled.append((pid, url, status))
        elif status in ("ok", "ok_assumed"):
            verified_good.append((pid, url))
        else:
            uncertain.append((pid, url, status))
    
    print(f"\nPhase 2 results:")
    status_counts = Counter(url_status.values())
    for status, count in status_counts.most_common():
        print(f"  {status}: {count} unique URLs")
    
    # Apply HTTP-based NULLs
    if http_nulled:
        ids = [pid for pid, _, _ in http_nulled]
        placeholders = ",".join("?" * len(ids))
        cur.execute(f"UPDATE restaurants SET online_order_url = NULL WHERE place_id IN ({placeholders})", ids)
        conn.commit()
        print(f"\n  → NULLed {cur.rowcount} rows (dead/DNS failure/bad redirect)")
    
    # Summary
    total_nulled = len(pattern_nulled) + len(http_nulled)
    print(f"\n{'='*50}")
    print(f"SUMMARY")
    print(f"{'='*50}")
    print(f"Total checked:        {len(rows)}")
    print(f"Pattern-based NULLed: {len(pattern_nulled)}")
    print(f"HTTP-check NULLed:    {len(http_nulled)}")
    print(f"Total NULLed:         {total_nulled}")
    print(f"Verified good:        {len(verified_good)}")
    print(f"Uncertain (kept):     {len(uncertain)}")
    
    # Show some uncertain ones for reference
    if uncertain:
        print(f"\nUncertain URLs (kept, sample):")
        for pid, url, status in uncertain[:10]:
            print(f"  [{status}] {url}")
    
    conn.close()


if __name__ == "__main__":
    main()
