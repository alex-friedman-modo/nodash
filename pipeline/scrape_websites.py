#!/usr/bin/env python3
"""
nodash - website scrape pipeline (3-stage)

Stage 0: URL triage  — classify domains before fetching (free, instant)
Stage 1: Fetch+Extract — homepage + up to 3 sub-pages, regex extraction
Stage 2: LLM pass    — Claude Haiku for ambiguous cases (~$1-2 total)

Run after build_db.py. Idempotent: skips already-scraped unless --rescrape.

Usage:
    uv run python pipeline/scrape_websites.py              # all unscraped
    uv run python pipeline/scrape_websites.py --rescrape   # redo everything
    uv run python pipeline/scrape_websites.py Brooklyn     # one borough
    uv run python pipeline/scrape_websites.py --limit 50   # test run
    uv run python pipeline/scrape_websites.py --llm-only   # only run LLM pass
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import sqlite3
import sys
import warnings
from pathlib import Path
from urllib.parse import urljoin, urlparse

import httpx
import trafilatura

warnings.filterwarnings("ignore")  # suppress SSL noise

ROOT    = Path(__file__).parent.parent
DB_PATH = ROOT / "data" / "restaurants.db"

XAI_API_KEY = os.environ.get("XAI_API_KEY")


# ── Domain / platform classification ─────────────────────────────────────────

SKIP_DOMAINS: set[str] = {
    # Third-party marketplaces
    "doordash.com", "ubereats.com", "grubhub.com", "seamless.com",
    "postmates.com", "caviar.com",
    # Social / profiles
    "instagram.com", "facebook.com", "fb.com", "tiktok.com",
    "twitter.com", "x.com", "yelp.com", "zomato.com", "tripadvisor.com",
    # Google auto-generated
    "sites.google.com", "business.google.com", "g.page",
    # Link aggregators
    "linktr.ee", "linkin.bio", "beacons.ai",
    # Menus-only (no ordering info)
    "allmenus.com", "menupages.com",
}

ORDERING_PLATFORMS: dict[str, str] = {
    "toasttab.com":   "toast",
    "square.site":    "square",
    "squareup.com":   "square",
    "order.online":   "square",
    "chownow.com":    "chownow",
    "slicelife.com":  "slice",
    "order.slice.com":"slice",
    "gloriafoods.com":"gloria",
    "clover.com":     "clover",
    "menufy.com":     "menufy",
    "beyondmenu.com": "beyondmenu",
    "hungrypage.com": "hungrypage",
    "order.app":      "google",
    "eat24.com":      "eat24",
    # yelp.com is in SKIP_DOMAINS; don't duplicate here
}


def classify_domain(url: str) -> tuple[str, str | None]:
    """
    Returns (category, platform_name | None)
    category: 'skip' | 'platform' | 'custom'
    """
    if not url:
        return "skip", None
    try:
        host = urlparse(url).netloc.lower()
        if host.startswith("www."):
            host = host[4:]
    except Exception:
        return "skip", None

    for domain in SKIP_DOMAINS:
        if host == domain or host.endswith("." + domain):
            return "skip", None

    for domain, platform in ORDERING_PLATFORMS.items():
        if host == domain or host.endswith("." + domain):
            return "platform", platform

    return "custom", None


# ── Sub-page patterns (priority order) ───────────────────────────────────────

SUBPAGE_PATTERNS = [
    re.compile(r"/deliver", re.I),
    re.compile(r"/order",   re.I),
    re.compile(r"/menu",    re.I),
    re.compile(r"/faq",     re.I),
    re.compile(r"/catering",re.I),
    re.compile(r"/about",   re.I),
    re.compile(r"/contact", re.I),
]

PDF_LINK_RE = re.compile(r'href=["\']([^"\']+\.pdf[^"\']*)["\']', re.I)
ORDER_LINK_RE = re.compile(
    r'href=["\']([^"\']*(?:toasttab|chownow|slicelife|square\.site|squareup|menufy|beyondmenu|clover)[^"\']*)["\']',
    re.I,
)


def find_subpage_links(html: str, base_url: str) -> list[str]:
    """Extract internal links that look like delivery/order/menu sub-pages."""
    found: list[str] = []
    seen: set[str] = set()
    base_host = urlparse(base_url).netloc

    for m in re.finditer(r'href=["\']([^"\'#?]+)["\']', html, re.I):
        href = m.group(1)
        abs_url = urljoin(base_url, href)
        parsed  = urlparse(abs_url)
        if parsed.netloc != base_host:
            continue
        path = parsed.path
        if path in seen:
            continue
        for pat in SUBPAGE_PATTERNS:
            if pat.search(path):
                seen.add(path)
                found.append(abs_url)
                break

    # Prioritize: delivery/order > menu > rest
    def priority(u: str) -> int:
        p = urlparse(u).path.lower()
        if "deliver" in p: return 0
        if "order"   in p: return 1
        if "menu"    in p: return 2
        return 3

    return sorted(found, key=priority)[:5]  # top 5 candidates, will fetch up to 3


def find_external_order_links(html: str) -> list[tuple[str, str]]:
    """Return list of (url, platform) for known ordering platforms found in raw HTML."""
    results = []
    for m in ORDER_LINK_RE.finditer(html):
        url = m.group(1)
        _, platform = classify_domain(url)
        if platform:
            results.append((url, platform))
    return results


def has_third_party_links(html: str) -> bool:
    """True if raw HTML contains DoorDash/UberEats/Grubhub/etc links."""
    third_party_re = re.compile(
        r'href=["\']https?://(?:www\.)?(?:doordash|ubereats|uber\.com/eats|grubhub|seamless|postmates|caviar)\.com',
        re.I,
    )
    return bool(third_party_re.search(html))


def has_own_order_links(html: str) -> bool:
    """True if raw HTML contains links suggesting independent ordering capability."""
    own_order_re = re.compile(
        r'href=["\'][^"\']*(?:order|checkout|cart|delivery)[^"\']*["\']',
        re.I,
    )
    return bool(own_order_re.search(html))


# ── PDF extraction ────────────────────────────────────────────────────────────

def extract_pdf_text(pdf_bytes: bytes) -> str:
    try:
        import io
        import pdfplumber
        text_parts = []
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages[:5]:  # first 5 pages max
                t = page.extract_text()
                if t:
                    text_parts.append(t)
        return "\n".join(text_parts)
    except Exception:
        return ""


# ── Regex extraction ──────────────────────────────────────────────────────────

DELIVERY_PATTERNS: dict[str, list[re.Pattern]] = {
    "delivery_fee": [
        re.compile(r"free\s+delivery", re.I),
        re.compile(r"delivery\s+(?:is\s+)?free", re.I),
        re.compile(r"no\s+delivery\s+(?:fee|charge)", re.I),
        re.compile(r"delivery\s+fee[:\s]*\$?([\d.]+)", re.I),
        re.compile(r"\$([\d.]+)\s+delivery\s+(?:fee|charge)", re.I),
    ],
    "delivery_minimum": [
        re.compile(r"minimum\s+(?:order|delivery)[:\s]*\$?([\d.]+)", re.I),
        re.compile(r"\$?([\d.]+)\s+minimum", re.I),
        re.compile(r"min(?:imum)?\s+order[:\s]*\$?([\d.]+)", re.I),
        re.compile(r"orders?\s+(?:over|above|of)\s+\$?([\d.]+)", re.I),
        re.compile(r"free\s+delivery\s+on\s+orders?\s+(?:over|above|of)\s+\$?([\d.]+)", re.I),
    ],
    "delivery_radius": [
        re.compile(r"deliver(?:y|ing)?\s+within\s+([\d.]+)\s+miles?", re.I),
        re.compile(r"([\d.]+)\s+mile\s+(?:delivery\s+)?radius", re.I),
        re.compile(r"delivery\s+(?:area|zone|range)[:\s]*([^\n.]{3,60})", re.I),
        re.compile(r"zip\s+codes?[:\s]*([\d,\s]{5,40})", re.I),
    ],
    "delivery_hours": [
        re.compile(r"delivery\s+hours?[:\s]*([^\n]{5,60})", re.I),
        re.compile(r"deliver(?:y|ing)\s+(?:from|between)\s+([\d:apmAPM\s\-–]+)", re.I),
    ],
}


def extract_snippet(text: str, pattern: re.Pattern, context: int = 80) -> str:
    m = pattern.search(text)
    if not m:
        return ""
    start = max(0, m.start() - 20)
    end   = min(len(text), m.end() + context)
    return text[start:end].replace("\n", " ").strip()


def run_regex_extraction(markdown: str) -> dict:
    """
    Run all DELIVERY_PATTERNS against the combined page markdown.
    Returns extracted fields and snippets.
    """
    result: dict = {
        "delivery_fee": None,
        "delivery_minimum": None,
        "delivery_radius": None,
        "delivery_hours": None,
        "snippets": [],
    }

    text = markdown.lower()

    # delivery fee
    for pat in DELIVERY_PATTERNS["delivery_fee"]:
        m = pat.search(text)
        if m:
            if "free" in pat.pattern or "no " in pat.pattern:
                result["delivery_fee"] = "free"
            else:
                result["delivery_fee"] = f"${m.group(1)}" if m.lastindex else "has_fee"
            result["snippets"].append(extract_snippet(markdown, pat))
            break

    # delivery minimum
    for pat in DELIVERY_PATTERNS["delivery_minimum"]:
        m = pat.search(text)
        if m:
            amt = m.group(1) if m.lastindex else None
            result["delivery_minimum"] = f"${amt}" if amt else "has_minimum"
            result["snippets"].append(extract_snippet(markdown, pat))
            break

    # delivery radius
    for pat in DELIVERY_PATTERNS["delivery_radius"]:
        m = pat.search(text)
        if m:
            result["delivery_radius"] = (m.group(1) or "").strip() or "mentioned"
            result["snippets"].append(extract_snippet(markdown, pat))
            break

    # delivery hours
    for pat in DELIVERY_PATTERNS["delivery_hours"]:
        m = pat.search(text)
        if m:
            result["delivery_hours"] = (m.group(1) or "").strip()[:100]
            break

    result["snippets"] = [s for s in result["snippets"] if s][:3]
    return result


# ── HTTP fetching ─────────────────────────────────────────────────────────────

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/134.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}


async def fetch_url(
    client: httpx.AsyncClient, url: str, is_pdf: bool = False
) -> tuple[bytes | None, str | None, str | None]:
    """
    Fetch a URL. Returns (content_bytes, final_url, error_str).
    Follows redirects and returns the final URL.
    """
    try:
        resp = await client.get(url, timeout=12, follow_redirects=True)
        resp.raise_for_status()
        return resp.content, str(resp.url), None
    except httpx.TimeoutException:
        return None, None, "timeout"
    except httpx.HTTPStatusError as e:
        return None, None, f"http_{e.response.status_code}"
    except Exception as e:
        return None, None, str(e)[:50]


async def fetch_page_markdown(
    client: httpx.AsyncClient, url: str
) -> tuple[str | None, str | None, str | None]:
    """
    Fetch a URL and return (markdown, raw_html, final_url).
    Returns (None, None, None) on failure.
    """
    content, final_url, error = await fetch_url(client, url)
    if content is None:
        return None, None, None

    raw_html = content.decode("utf-8", errors="replace")

    # Check if final URL redirected to a skip domain
    if final_url:
        cat, _ = classify_domain(final_url)
        if cat == "skip":
            return None, raw_html, final_url  # raw_html still useful for link extraction

    md = await asyncio.to_thread(
        trafilatura.extract,
        raw_html,
        output_format="markdown",
        include_links=False,
        include_images=False,
        favor_recall=True,
        no_fallback=False,
    )
    return md, raw_html, final_url


# ── Stage classification ──────────────────────────────────────────────────────

def classify_result(
    regex_result: dict,
    third_party_detected: bool,
    has_own_ordering: bool,
    has_content: bool,
    platform: str | None,
) -> str:
    """
    Assign a scrape_status category after Stage 1 extraction.
    """
    if not has_content:
        return "no_content"

    # Explicit third-party only (links to apps, no own ordering system)
    if third_party_detected and not has_own_ordering and not platform:
        return "third_party_only"

    # Got something useful from regex
    has_fee_info = regex_result.get("delivery_fee") is not None
    has_min_info = regex_result.get("delivery_minimum") is not None
    has_radius   = regex_result.get("delivery_radius") is not None

    if has_fee_info or (has_min_info and has_radius):
        return "extracted_confident"

    if platform:
        return "platform_identified"

    # Has content but regex didn't extract cleanly
    return "has_text_ambiguous"


# ── Stage 2: LLM pass ────────────────────────────────────────────────────────

LLM_PROMPT = """You are extracting delivery information from a restaurant's website text.

Given the following website content, extract these fields. Return ONLY a JSON object.
If a field cannot be determined, use null.

Fields:
- direct_delivery: boolean or null — TRUE if the restaurant does their OWN delivery (not just via DoorDash/UberEats/Grubhub). This is the most important field.
- delivery_fee: string or null — "free", "$3.99", "varies by distance"
- delivery_minimum: string or null — "$15", "$20", "none"
- delivery_radius: string or null — "2 miles", "Manhattan only", "10001-10012"
- ordering_method: "website" | "phone" | "toast" | "chownow" | "slice" | "square" | "other_platform" | null
- online_order_url: string or null — direct URL to order online (NOT a DoorDash/UberEats link)
- third_party_only: boolean — true ONLY if their ONLY delivery option is DoorDash/UberEats/Grubhub with no independent ordering
- delivery_hours: string or null — delivery-specific hours if different from regular hours
- confidence: "high" | "medium" | "low" — your overall confidence in the extraction

IMPORTANT:
- direct_delivery=true means the restaurant handles the delivery themselves (own drivers, own ordering)
- direct_delivery=false means they ONLY use third-party apps like DoorDash for delivery
- "Free delivery on orders over $20" → direct_delivery=true, delivery_fee="free", delivery_minimum="$20"
- "Order on DoorDash" with no other option → direct_delivery=false, third_party_only=true
- Phone number + "call to order" → direct_delivery=true, ordering_method="phone"
- A link to toasttab.com/chownow.com/etc → direct_delivery=true (they control ordering), capture as online_order_url
- If you see BOTH a DoorDash link AND a direct ordering option → direct_delivery=true, third_party_only=false

Website content:
---
{text}
---

Return JSON only, no explanation."""


async def llm_extract(text: str) -> dict | None:
    """Call Grok 4.1 fast to extract delivery info from ambiguous page text."""
    if not XAI_API_KEY:
        return None
    try:
        import httpx as _httpx
        truncated = text[:8000]  # ~2k tokens
        payload = {
            "model": "grok-4-1-fast",
            "messages": [{"role": "user", "content": LLM_PROMPT.format(text=truncated)}],
            "max_tokens": 512,
            "temperature": 0,
        }
        async with _httpx.AsyncClient() as c:
            resp = await c.post(
                "https://api.x.ai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {XAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=20,
            )
            resp.raise_for_status()
            raw = resp.json()["choices"][0]["message"]["content"].strip()

        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = re.sub(r"^```[a-z]*\n?", "", raw)
            raw = re.sub(r"\n?```$", "", raw)
        return json.loads(raw)
    except Exception as e:
        print(f"    ⚠️  LLM error: {e}")
        return None


# ── Database ──────────────────────────────────────────────────────────────────

SCRAPE_COLUMNS = [
    ("scrape_stage",          "TEXT"),
    ("url_category",          "TEXT"),
    ("detected_platform",     "TEXT"),
    ("scrape_status",         "TEXT"),
    ("delivery_fee",          "TEXT"),
    ("delivery_minimum",      "TEXT"),
    ("delivery_radius",       "TEXT"),
    ("online_order_url",      "TEXT"),
    ("ordering_method",       "TEXT"),
    ("third_party_detected",  "INTEGER"),
    ("third_party_only",      "INTEGER"),
    ("has_pdf_menu",          "INTEGER"),
    ("detected_language",     "TEXT"),
    ("pages_fetched",         "INTEGER"),
    ("raw_text_preview",      "TEXT"),  # first 3000 chars for LLM
    ("fetch_error",           "TEXT"),
    ("scrape_snippets",       "TEXT"),  # JSON array of snippets
    ("needs_llm",             "INTEGER"),
    ("llm_confidence",        "TEXT"),
    ("llm_processed_at",      "TEXT"),
    ("scrape_updated",        "TEXT"),
]


def ensure_columns(conn: sqlite3.Connection) -> None:
    for col, typedef in SCRAPE_COLUMNS:
        try:
            conn.execute(f"ALTER TABLE restaurants ADD COLUMN {col} {typedef}")
        except sqlite3.OperationalError:
            pass  # column already exists
    conn.commit()


def write_triage(conn: sqlite3.Connection, place_id: str, category: str, platform: str | None, status: str) -> None:
    conn.execute("""
        UPDATE restaurants SET
            scrape_stage = 'triage',
            url_category = ?,
            detected_platform = ?,
            scrape_status = ?,
            scrape_updated = datetime('now')
        WHERE place_id = ?
    """, (category, platform, status, place_id))


def write_stage1(
    conn: sqlite3.Connection,
    place_id: str,
    status: str,
    regex: dict,
    platform: str | None,
    online_order_url: str | None,
    third_party_detected: bool,
    third_party_only: bool,
    has_pdf: bool,
    pages_fetched: int,
    raw_text: str,
    fetch_error: str | None,
) -> None:
    needs_llm = status == "has_text_ambiguous"
    ordering_method = platform if platform else ("website" if online_order_url else None)

    conn.execute("""
        UPDATE restaurants SET
            scrape_stage         = 'fetched',
            scrape_status        = ?,
            delivery_fee         = ?,
            delivery_minimum     = ?,
            delivery_radius      = ?,
            delivery_hours       = COALESCE(delivery_hours, ?),
            ordering_method      = COALESCE(ordering_method, ?),
            online_order_url     = COALESCE(online_order_url, ?),
            third_party_detected = ?,
            third_party_only     = ?,
            has_pdf_menu         = ?,
            pages_fetched        = ?,
            raw_text_preview     = ?,
            scrape_snippets      = ?,
            fetch_error          = ?,
            needs_llm            = ?,
            scrape_updated       = datetime('now')
        WHERE place_id = ?
    """, (
        status,
        regex.get("delivery_fee"),
        regex.get("delivery_minimum"),
        regex.get("delivery_radius"),
        regex.get("delivery_hours"),
        ordering_method,
        online_order_url,
        1 if third_party_detected else 0,
        1 if third_party_only else 0,
        1 if has_pdf else 0,
        pages_fetched,
        raw_text[:3000],
        json.dumps(regex.get("snippets", [])),
        fetch_error,
        1 if needs_llm else 0,
        place_id,
    ))


def write_llm(conn: sqlite3.Connection, place_id: str, llm: dict) -> None:
    confidence = llm.get("confidence", "low")
    status = {
        "high":   "extracted_llm",
        "medium": "extracted_llm_uncertain",
        "low":    "call_needed",
    }.get(confidence, "call_needed")

    # Derive direct_delivery from LLM output
    direct_delivery = llm.get("direct_delivery")
    if direct_delivery is None and llm.get("third_party_only"):
        direct_delivery = False  # infer from third_party_only

    conn.execute("""
        UPDATE restaurants SET
            scrape_stage         = 'llm_processed',
            scrape_status        = ?,
            direct_delivery      = COALESCE(direct_delivery, ?),
            delivery_fee         = COALESCE(delivery_fee, ?),
            delivery_minimum     = COALESCE(delivery_minimum, ?),
            delivery_radius      = COALESCE(delivery_radius, ?),
            ordering_method      = COALESCE(ordering_method, ?),
            online_order_url     = COALESCE(online_order_url, ?),
            third_party_only     = COALESCE(third_party_only, ?),
            llm_confidence       = ?,
            llm_processed_at     = datetime('now'),
            scrape_updated       = datetime('now')
        WHERE place_id = ?
    """, (
        status,
        1 if direct_delivery is True else (0 if direct_delivery is False else None),
        llm.get("delivery_fee"),
        llm.get("delivery_minimum"),
        llm.get("delivery_radius"),
        llm.get("ordering_method"),
        llm.get("online_order_url"),
        1 if llm.get("third_party_only") else 0,
        confidence,
        place_id,
    ))


# ── Main pipeline ─────────────────────────────────────────────────────────────

async def process_restaurant(
    client: httpx.AsyncClient,
    sem: asyncio.Semaphore,
    conn: sqlite3.Connection,
    conn_lock: asyncio.Lock,
    row: sqlite3.Row,
    run_llm: bool,
) -> str:
    """Process a single restaurant. Returns final status string."""

    place_id = row["place_id"]
    name     = row["name"] or "?"
    website  = row["website"] or ""

    # ── Stage 0: URL triage ───────────────────────────────────────────────────
    category, platform = classify_domain(website)

    if category == "skip":
        status = (
            "skipped_third_party"
            if any(d in website for d in ["doordash", "ubereats", "grubhub", "seamless"])
            else "skipped_no_site"
        )
        async with conn_lock:
            write_triage(conn, place_id, category, None, status)
            conn.commit()
        return status

    # ── Stage 1: Fetch + Extract ──────────────────────────────────────────────
    async with sem:
        all_markdown: list[str] = []
        all_raw_html: list[str] = []
        pages_fetched = 0
        fetch_error: str | None = None
        final_url: str | None = None
        has_pdf = False
        online_order_url: str | None = None

        # If platform-identified, set online_order_url immediately
        if category == "platform":
            online_order_url = website

        # Fetch homepage
        md, raw_html, final_url_resp = await fetch_page_markdown(client, website)

        if raw_html is None:
            fetch_error = "fetch_failed"
        else:
            final_url = final_url_resp

            # Re-check if redirect landed on a skip domain
            if final_url:
                cat2, _ = classify_domain(final_url)
                if cat2 == "skip":
                    async with conn_lock:
                        write_triage(conn, place_id, "skip", None, "skipped_redirected")
                        conn.commit()
                    return "skipped_redirected"

            if md:
                all_markdown.append(md)
                pages_fetched += 1

            if raw_html:
                all_raw_html.append(raw_html)
                # Find external ordering platform links
                for url, ext_platform in find_external_order_links(raw_html):
                    if not online_order_url:
                        online_order_url = url
                        platform = ext_platform

                # Find PDF menu links
                pdf_links = PDF_LINK_RE.findall(raw_html)

                # Fetch up to 3 sub-pages
                subpage_urls = find_subpage_links(raw_html, website)
                fetched_subpages = 0
                for sp_url in subpage_urls:
                    if fetched_subpages >= 3:
                        break
                    if sp_url.lower().endswith(".pdf"):
                        # PDF sub-page — try pdfplumber
                        content, _, _ = await fetch_url(client, sp_url, is_pdf=True)
                        if content:
                            pdf_text = extract_pdf_text(content)
                            if pdf_text:
                                all_markdown.append(pdf_text)
                                has_pdf = True
                        fetched_subpages += 1
                        continue

                    sp_md, sp_html, _ = await fetch_page_markdown(client, sp_url)
                    if sp_md:
                        all_markdown.append(sp_md)
                        fetched_subpages += 1
                        pages_fetched += 1
                    if sp_html:
                        all_raw_html.append(sp_html)

                # Try PDF menu links from homepage
                for pdf_link in pdf_links[:2]:
                    pdf_url = urljoin(website, pdf_link)
                    content, _, _ = await fetch_url(client, pdf_url, is_pdf=True)
                    if content:
                        pdf_text = extract_pdf_text(content)
                        if pdf_text:
                            all_markdown.append(pdf_text)
                            has_pdf = True

        # Combine all content
        combined_markdown = "\n\n---\n\n".join(all_markdown)
        combined_html     = "\n".join(all_raw_html)

        # Regex extraction
        regex = run_regex_extraction(combined_markdown) if combined_markdown else {}

        # Third-party detection from raw HTML
        third_party_detected = has_third_party_links(combined_html)
        own_ordering         = has_own_order_links(combined_html) or bool(online_order_url)
        has_content          = bool(combined_markdown.strip())

        # Classify
        status = classify_result(
            regex, third_party_detected, own_ordering, has_content, platform
        )

        if fetch_error and not has_content:
            status = "fetch_failed"

        async with conn_lock:
            write_stage1(
                conn, place_id, status, regex, platform, online_order_url,
                third_party_detected, status == "third_party_only",
                has_pdf, pages_fetched, combined_markdown, fetch_error,
            )
            conn.commit()

        # ── Stage 2: LLM pass ─────────────────────────────────────────────────
        if run_llm and status == "has_text_ambiguous" and combined_markdown:
            await asyncio.sleep(0.05)  # tiny back-off before LLM call
            llm_result = await llm_extract(combined_markdown)
            if llm_result:
                async with conn_lock:
                    write_llm(conn, place_id, llm_result)
                    conn.commit()
                status = {
                    "high":   "extracted_llm",
                    "medium": "extracted_llm_uncertain",
                    "low":    "call_needed",
                }.get(llm_result.get("confidence", "low"), "call_needed")

        await asyncio.sleep(0.1)  # be polite to small restaurant servers

    return status


async def run(
    borough:   str | None = None,
    limit:     int | None = None,
    rescrape:  bool = False,
    llm_only:  bool = False,
    run_llm:   bool = True,
) -> None:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    ensure_columns(conn)

    # Build query
    if llm_only:
        query = "SELECT place_id, name, website, raw_text_preview FROM restaurants WHERE needs_llm = 1"
    else:
        query = "SELECT place_id, name, website FROM restaurants WHERE website IS NOT NULL"
        if not rescrape:
            query += " AND scrape_stage IS NULL"
    if borough:
        query += f" AND borough = '{borough}'"
    if limit:
        query += f" LIMIT {limit}"

    rows = conn.execute(query).fetchall()
    print(f"🔍 Processing {len(rows)} restaurants "
          f"({'LLM-only' if llm_only else 'full scrape'})...\n")

    if not rows:
        print("Nothing to process.")
        conn.close()
        return

    conn_lock = asyncio.Lock()
    sem       = asyncio.Semaphore(12)

    counts: dict[str, int] = {}
    done = 0

    async with httpx.AsyncClient(headers=HEADERS, verify=False) as client:

        if llm_only:
            # LLM-only mode: skip fetch, just run LLM on stored raw_text_preview
            for row in rows:
                text = row["raw_text_preview"] or ""
                if text:
                    llm_result = await llm_extract(text)
                    if llm_result:
                        async with conn_lock:
                            write_llm(conn, row["place_id"], llm_result)
                            conn.commit()
                        status = llm_result.get("confidence", "low")
                    else:
                        status = "llm_error"
                else:
                    status = "no_text"
                counts[status] = counts.get(status, 0) + 1
                done += 1
                if done % 50 == 0:
                    print(f"  [{done}/{len(rows)}] LLM pass in progress...")
        else:
            tasks = [
                process_restaurant(client, sem, conn, conn_lock, row, run_llm)
                for row in rows
            ]

            for coro in asyncio.as_completed(tasks):
                status = await coro
                counts[status] = counts.get(status, 0) + 1
                done += 1
                if done % 50 == 0:
                    extracted = (counts.get("extracted_confident", 0) +
                                 counts.get("extracted_llm", 0) +
                                 counts.get("extracted_llm_uncertain", 0))
                    print(
                        f"  [{done}/{len(rows)}] "
                        f"✅ {extracted} extracted | "
                        f"⚠️ {counts.get('third_party_only', 0)} 3rd-party | "
                        f"📞 {counts.get('call_needed', 0) + counts.get('fetch_failed', 0)} to call"
                    )

    conn.close()

    # Summary
    extracted = (
        counts.get("extracted_confident", 0) +
        counts.get("extracted_llm", 0) +
        counts.get("extracted_llm_uncertain", 0) +
        counts.get("platform_identified", 0)
    )
    print(f"""
✅ Scrape complete.

  Extracted (confident):      {counts.get('extracted_confident', 0)}
  Extracted (LLM high):       {counts.get('extracted_llm', 0)}
  Extracted (LLM uncertain):  {counts.get('extracted_llm_uncertain', 0)}
  Platform identified:        {counts.get('platform_identified', 0)}
  ─────────────────────────
  Total useful data:          {extracted}

  Third-party only (skip):    {counts.get('third_party_only', 0) + counts.get('skipped_third_party', 0)}
  No site / social:           {counts.get('skipped_no_site', 0) + counts.get('skipped_social', 0)}
  No content found:           {counts.get('no_content', 0)}
  Fetch failed:               {counts.get('fetch_failed', 0)}
  Call needed:                {counts.get('call_needed', 0)}
""")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="nodash website scraper")
    parser.add_argument("borough",     nargs="?",       help="Filter by borough")
    parser.add_argument("--rescrape",  action="store_true")
    parser.add_argument("--limit",     type=int)
    parser.add_argument("--llm-only",  action="store_true", help="Only run LLM pass on already-fetched ambiguous restaurants")
    parser.add_argument("--no-llm",    action="store_true", help="Skip LLM pass (faster, more goes to call list)")
    args = parser.parse_args()

    asyncio.run(run(
        borough  = args.borough,
        limit    = args.limit,
        rescrape = args.rescrape,
        llm_only = args.llm_only,
        run_llm  = not args.no_llm,
    ))
