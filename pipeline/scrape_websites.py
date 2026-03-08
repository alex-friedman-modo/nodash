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
import logging
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

logger = logging.getLogger(__name__)

ROOT    = Path(__file__).parent.parent
DB_PATH = ROOT / "data" / "restaurants.db"

XAI_API_KEY        = os.environ.get("XAI_API_KEY")
ANTHROPIC_API_KEY  = os.environ.get("ANTHROPIC_API_KEY")
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY")

# LLM backend config — override via LLM_BACKEND env var
# Options: "grok" (default, fast/cheap) | "gemini" (smarter, for re-verification) | "sonnet"
LLM_BACKEND = os.environ.get("LLM_BACKEND", "grok")


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
    "toasttab.com":     "toast",
    "square.site":      "square",
    "squareup.com":     "square",
    "order.online":     "doordash_storefront",  # DoorDash Storefront, NOT Square
    "chownow.com":      "chownow",
    "slicelife.com":    "slice",
    "order.slice.com":  "slice",
    "gloriafoods.com":  "gloria",
    "clover.com":       "clover",
    "menufy.com":       "menufy",
    "beyondmenu.com":   "beyondmenu",
    "beyond.menu":      "beyondmenu",   # alternate domain
    "hungrypage.com":   "hungrypage",
    "order.app":        "google",
    "eat24.com":        "eat24",
    "tryotter.com":     "otter",         # Otter Direct Orders (commission-free)
    "dine.online":      "dine_online",   # direct ordering platform
    "getsauce.com":     "sauce",         # Sauce (commission-free delivery)
    "foodbooking.com":  "foodbooking",   # FoodBooking direct ordering
    "owner.com":        "owner",         # Owner.com restaurant platform
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
    r'href=["\']([^"\']*(?:toasttab|chownow|slicelife|square\.site|squareup|menufy|beyondmenu|beyond\.menu|clover|getsauce|foodbooking|tryotter|dine\.online|owner\.com/s/)[^"\']*)["\']',
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


_STATIC_EXTENSIONS = re.compile(r'\.(ico|png|jpg|jpeg|gif|svg|css|js|woff|woff2|ttf|eot|map)(\?.*)?$', re.I)

# Parked/ad domains — HTML contains these but no real restaurant content
_PARKED_INDICATORS = re.compile(
    r'parklogic\.com|sedoparking\.com|godaddy\.com/park|'
    r'hugedomains\.com|afternic\.com|domainlander|'
    r'This domain is for sale|domain has expired|'
    r'Buy this domain|cdez\.com|dan\.com|sedo\.com',
    re.I,
)

# Frameset redirect to parked/ad domain
_FRAMESET_RE = re.compile(r'<frameset[^>]*>.*?<frame[^>]+src=["\']([^"\']+)["\']', re.I | re.DOTALL)

# Cloudflare challenge page indicators
_CLOUDFLARE_CHALLENGE_RE = re.compile(
    r'<title>Just a moment\.\.\.</title>|_cf_chl_opt|challenge-platform',
    re.I,
)

# JS redirect patterns (for tiny pages that just redirect via JS)
_JS_REDIRECT_RE = re.compile(
    r'window\.(?:location\.href|location)\s*=\s*["\']([^"\']+)["\']',
    re.I,
)

# SPA indicators — page has a shell div but no server-rendered content
_SPA_SHELL_RE = re.compile(
    r'<div\s+id=["\'](?:app|root|__next|q-app|__nuxt)["\']>\s*</div>',
    re.I,
)


def is_parked_domain(html: str) -> bool:
    """Detect parked/expired domain landing pages."""
    if len(html) < 100:
        return True  # trivially small response (e.g. just "404")
    if _PARKED_INDICATORS.search(html[:5000]):
        return True
    # Detect frameset-based redirects to parked domains
    if len(html) < 1000:
        m = _FRAMESET_RE.search(html)
        if m:
            return True  # tiny page with frameset = almost always parked
    return False


def is_cloudflare_blocked(html: str) -> bool:
    """Detect Cloudflare challenge/bot-protection pages."""
    return bool(_CLOUDFLARE_CHALLENGE_RE.search(html[:3000]))


def detect_js_redirect(html: str) -> str | None:
    """Extract target URL from a JS redirect page (for small pages only)."""
    if len(html) > 2000:
        return None  # only check small pages that are likely pure redirects
    m = _JS_REDIRECT_RE.search(html)
    return m.group(1) if m else None


def is_spa_shell(html: str) -> bool:
    """Detect SPA pages that have a shell div but no server-rendered content."""
    return bool(_SPA_SHELL_RE.search(html))

def find_external_order_links(html: str) -> list[tuple[str, str]]:
    """Return list of (url, platform) for known ordering platforms found in raw HTML."""
    results = []
    for m in ORDER_LINK_RE.finditer(html):
        url = m.group(1)
        # Skip static assets — favicon.ico, images, CSS, JS, etc.
        if _STATIC_EXTENSIONS.search(url):
            continue
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
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate",
    "Sec-Ch-Ua": '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"macOS"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
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
    except httpx.ConnectError as e:
        err_str = str(e).lower()
        if "ssl" in err_str or "certificate" in err_str:
            return None, None, "ssl_error"
        if "name" in err_str or "resolve" in err_str:
            return None, None, "dns_failed"
        return None, None, f"connect_error: {str(e)[:40]}"
    except Exception as e:
        return None, None, str(e)[:50]


async def fetch_page_markdown(
    client: httpx.AsyncClient, url: str, follow_js_redirect: bool = True,
) -> tuple[str | None, str | None, str | None, str | None]:
    """
    Fetch a URL and return (markdown, raw_html, final_url, error).
    Returns (None, None, None, error_str) on failure.
    """
    content, final_url, error = await fetch_url(client, url)
    if content is None:
        return None, None, None, error

    raw_html = content.decode("utf-8", errors="replace")

    # Detect Cloudflare challenge pages
    if is_cloudflare_blocked(raw_html):
        return None, raw_html, final_url, "cloudflare_blocked"

    # Check if final URL redirected to a skip domain
    if final_url:
        cat, _ = classify_domain(final_url)
        if cat == "skip":
            return None, raw_html, final_url, None  # raw_html still useful for link extraction

    # Follow JS redirects (tiny pages that use window.location)
    if follow_js_redirect:
        js_target = detect_js_redirect(raw_html)
        if js_target:
            abs_target = urljoin(url, js_target)
            return await fetch_page_markdown(client, abs_target, follow_js_redirect=False)

    md = await asyncio.to_thread(
        trafilatura.extract,
        raw_html,
        output_format="markdown",
        include_links=False,
        include_images=False,
        favor_recall=True,
        no_fallback=False,
    )
    return md, raw_html, final_url, None


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

Return ONLY a JSON object with ALL fields below. Use null if unknown — do not omit fields.

{
  "direct_delivery": true/false/null,
  "delivery_fee": "free" | "$2.99" | "10%" | "varies" | null,
  "delivery_minimum": "$15" | "$20" | "none" | null,
  "delivery_radius": "within 1 mile" | "10002-10012" | "Park Slope only" | null,
  "ordering_method": "website" | "phone" | "toast" | "chownow" | "slice" | "square" | "other_platform" | null,
  "online_order_url": "https://..." | null,
  "third_party": true/false/null,
  "delivery_menu": true/false/null,
  "delivery_hours": "11am-9pm Mon-Fri" | null,
  "confidence": "high" | "medium" | "low"
}

FIELD DEFINITIONS:
- direct_delivery: TRUE if restaurant handles their OWN delivery (own drivers, own ordering system). FALSE if ONLY via DoorDash/UberEats/Grubhub.
- delivery_fee: exact fee charged for delivery. "free" if explicitly free.
- delivery_minimum: minimum order amount required for delivery.
- delivery_radius: geographic area they deliver to (miles, zip codes, neighborhood names).
- ordering_method: HOW to place a delivery order. "phone" = call them. "website" = their own site. Named platforms = Toast/ChowNow/Slice/Square/etc.
- online_order_url: direct link to order page. Must NOT be a DoorDash/UberEats/Grubhub URL.
- third_party: TRUE if they mention DoorDash/UberEats/Grubhub/Seamless as delivery options (even if they also have direct).
- delivery_menu: TRUE if they mention a separate or limited delivery menu vs. full dine-in menu.
- delivery_hours: delivery-specific hours ONLY if different from regular restaurant hours.
- confidence: how confident you are in direct_delivery specifically. "high" = explicitly stated. "medium" = strongly implied. "low" = guessing.

RULES:
- "Free delivery on orders over $20" → direct_delivery=true, delivery_fee="free", delivery_minimum="$20"
- "Order on DoorDash" only → direct_delivery=false, third_party=true
- Phone number + "call to order" → direct_delivery=true, ordering_method="phone"
- Toast/ChowNow/Slice/Square link → direct_delivery=true, capture URL as online_order_url
- Both DoorDash AND direct option → direct_delivery=true, third_party=true
- If you see a delivery fee or minimum, direct_delivery is almost certainly true

Website content:
---
{text}
---

Return JSON only, no explanation."""


VALID_CONFIDENCES = {"high", "medium", "low"}

# Fields that should be str or None
from typing import Literal
from pydantic import BaseModel, field_validator, model_validator

class LLMDeliveryResult(BaseModel):
    """Validated schema for Grok LLM delivery extraction output."""
    direct_delivery:  bool | None = None
    delivery_fee:     str | None  = None
    delivery_minimum: str | None  = None
    delivery_radius:  str | None  = None
    ordering_method:  str | None  = None
    online_order_url: str | None  = None
    third_party:      bool | None = None
    third_party_only: bool | None = None
    delivery_menu:    bool | None = None
    delivery_hours:   str | None  = None
    confidence:       Literal["high", "medium", "low"] = "low"

    @field_validator("delivery_fee", "delivery_minimum", "delivery_radius",
                     "ordering_method", "online_order_url", "delivery_hours",
                     mode="before")
    @classmethod
    def coerce_str(cls, v):
        return str(v) if v is not None else None

    @field_validator("direct_delivery", "third_party", "third_party_only", "delivery_menu",
                     mode="before")
    @classmethod
    def coerce_bool(cls, v):
        if v is None:
            return None
        if isinstance(v, str):
            return v.lower() not in ("false", "no", "0", "null", "none")
        return bool(v)

    @field_validator("confidence", mode="before")
    @classmethod
    def coerce_confidence(cls, v):
        return v if v in ("high", "medium", "low") else "low"

    @model_validator(mode="after")
    def downgrade_empty_result(self):
        """If we have no useful data at all, downgrade confidence to low."""
        has_any_signal = any([
            self.direct_delivery is not None,
            self.delivery_fee is not None,
            self.delivery_minimum is not None,
            self.delivery_radius is not None,
            self.ordering_method is not None,
            self.online_order_url is not None,
        ])
        if not has_any_signal:
            self.confidence = "low"
        return self

    def to_dict(self) -> dict:
        return self.model_dump()


async def llm_extract(text: str) -> dict | None:
    """Call LLM to extract delivery info. Backend selectable via LLM_BACKEND env var."""
    truncated = text[:8000]
    content   = LLM_PROMPT.replace("{text}", truncated)

    if LLM_BACKEND == "gemini":
        # Gemini 3 Flash via OpenRouter — smarter, structured JSON output
        if not OPENROUTER_API_KEY:
            logger.warning("LLM_BACKEND=gemini but OPENROUTER_API_KEY not set")
            return None
        payload = {
            "model": "google/gemini-3-flash-preview",
            "messages": [{"role": "user", "content": content}],
            "max_tokens": 512,
            "temperature": 0,
            "response_format": {"type": "json_object"},
        }
        headers = {
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/alex-friedman-modo/nodash",
        }
        api_url = "https://openrouter.ai/api/v1/chat/completions"
        def get_content(resp_json: dict) -> str:
            return resp_json["choices"][0]["message"]["content"].strip()

    elif LLM_BACKEND == "sonnet":
        # Claude Sonnet via Anthropic API
        if not ANTHROPIC_API_KEY:
            logger.warning("LLM_BACKEND=sonnet but ANTHROPIC_API_KEY not set")
            return None
        payload = {
            "model": "claude-sonnet-4-6",
            "messages": [{"role": "user", "content": content}],
            "max_tokens": 512,
        }
        headers = {
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }
        api_url = "https://api.anthropic.com/v1/messages"
        def get_content(resp_json: dict) -> str:
            return resp_json["content"][0]["text"].strip()

    else:
        # Grok (default) — fast/cheap
        if not XAI_API_KEY:
            return None
        payload = {
            "model": "grok-4-1-fast-non-reasoning",
            "messages": [{"role": "user", "content": content}],
            "max_tokens": 512,
            "temperature": 0,
        }
        headers = {
            "Authorization": f"Bearer {XAI_API_KEY}",
            "Content-Type": "application/json",
        }
        api_url = "https://api.x.ai/v1/chat/completions"
        def get_content(resp_json: dict) -> str:
            return resp_json["choices"][0]["message"]["content"].strip()

    raw = None
    for attempt in range(3):  # retry up to 3 times on timeout/5xx
        try:
            async with httpx.AsyncClient() as c:
                resp = await c.post(
                    api_url,
                    headers=headers,
                    json=payload,
                    timeout=30,
                )
                resp.raise_for_status()
                raw = get_content(resp.json())
            break  # success — exit retry loop

        except httpx.TimeoutException:
            wait = 2 ** attempt
            logger.warning("LLM timeout (attempt %d/3), retrying in %ds", attempt + 1, wait)
            await asyncio.sleep(wait)
            continue
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:  # rate limit
                wait = 5 * (attempt + 1)
                logger.warning("LLM rate limited (429), retrying in %ds", wait)
                await asyncio.sleep(wait)
                continue
            logger.warning("LLM HTTP error %d: %s", e.response.status_code, e.response.text[:100])
            return None
        except Exception as e:
            logger.warning("LLM error [%s]: %s | raw: %s", type(e).__name__, e, (raw or "")[:200])
            return None

    if raw is None:
        logger.warning("LLM failed after 3 attempts")
        return None

    try:
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = re.sub(r"^```[a-z]*\n?", "", raw)
            raw = re.sub(r"\n?```$", "", raw)

        parsed = json.loads(raw)

        if not isinstance(parsed, dict):
            logger.warning("LLM returned non-dict (%s): %s", type(parsed).__name__, raw[:200])
            return None

        result = LLMDeliveryResult(**parsed)
        return result.to_dict()
    except Exception as e:
        logger.warning("LLM parse error [%s]: %s | raw: %s", type(e).__name__, e, (raw or "")[:200])
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
    ("third_party",           "INTEGER"),  # broader: mentions any 3rd-party app
    ("delivery_menu",         "INTEGER"),  # separate/limited delivery menu
    ("has_pdf_menu",          "INTEGER"),
    ("detected_language",     "TEXT"),
    ("pages_fetched",         "INTEGER"),
    ("raw_text_preview",      "TEXT"),  # first 8000 chars for LLM
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

    # Infer direct_delivery from stage1 signals:
    # - platform_identified: they use Toast/Slice/ChowNow/etc → they control ordering = direct
    # - extracted_confident: regex found delivery fee/minimum → clearly offering own delivery
    # - third_party_only: only DoorDash/UberEats links → not direct
    if third_party_only:
        inferred_direct = 0
    elif status in ("platform_identified", "extracted_confident"):
        inferred_direct = 1
    else:
        inferred_direct = None  # leave for LLM or call to determine

    conn.execute("""
        UPDATE restaurants SET
            scrape_stage         = 'fetched',
            scrape_status        = ?,
            direct_delivery      = COALESCE(direct_delivery, ?),
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
        inferred_direct,
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
        raw_text[:8000],
        json.dumps(regex.get("snippets", [])),
        fetch_error,
        1 if needs_llm else 0,
        place_id,
    ))


def write_llm(conn: sqlite3.Connection, place_id: str, llm: dict) -> None:
    try:
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
                third_party          = COALESCE(third_party, ?),
                delivery_menu        = COALESCE(delivery_menu, ?),
                delivery_hours       = COALESCE(delivery_hours, ?),
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
            # third_party_only = no direct delivery at all
            1 if (llm.get("third_party") and not llm.get("direct_delivery")) else 0,
            # third_party = mentions apps even if also has direct
            1 if llm.get("third_party") else 0,
            1 if llm.get("delivery_menu") else None,
            llm.get("delivery_hours"),
            confidence,
            place_id,
        ))
    except Exception as e:
        logger.error("write_llm failed for place_id=%s: %s", place_id, e)
        try:
            conn.execute(
                "UPDATE restaurants SET scrape_status = 'llm_error' WHERE place_id = ?",
                (place_id,),
            )
        except Exception:
            pass


# ── Main pipeline ─────────────────────────────────────────────────────────────

async def process_restaurant(
    client: httpx.AsyncClient,
    sem: asyncio.Semaphore,
    llm_sem: asyncio.Semaphore,
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
        md, raw_html, final_url_resp, homepage_err = await fetch_page_markdown(client, website)

        if raw_html is None:
            fetch_error = homepage_err or "fetch_failed"
        else:
            final_url = final_url_resp
            # Capture errors even when we got raw HTML (e.g. cloudflare_blocked)
            if homepage_err:
                fetch_error = homepage_err

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

                    sp_md, sp_html, _, _ = await fetch_page_markdown(client, sp_url)
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

        # Detect parked/dead domains early
        if combined_html and not combined_markdown.strip() and is_parked_domain(combined_html):
            fetch_error = "parked_domain"

        # Detect SPA shells with no server-rendered content
        if combined_html and not combined_markdown.strip() and not fetch_error:
            if is_spa_shell(combined_html):
                fetch_error = "spa_no_content"

        # Regex extraction — try trafilatura markdown first, fall back to raw HTML
        regex = run_regex_extraction(combined_markdown) if combined_markdown else {}

        # Fallback: if trafilatura got nothing useful, try regex on raw HTML directly
        if not combined_markdown.strip() and combined_html and not fetch_error:
            # Strip HTML tags for a rough text version
            raw_text_fallback = re.sub(r'<[^>]+>', ' ', combined_html)
            raw_text_fallback = re.sub(r'\s+', ' ', raw_text_fallback)
            html_regex = run_regex_extraction(raw_text_fallback)
            if any(html_regex.get(k) for k in ("delivery_fee", "delivery_minimum", "delivery_radius")):
                regex = html_regex
                combined_markdown = raw_text_fallback[:8000]  # use as content for LLM pass

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
            async with llm_sem:  # max 3 concurrent LLM calls — avoid xAI rate limits
                await asyncio.sleep(0.1)
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
            else:
                # LLM failed (API error or parse failure) — mark call_needed
                async with conn_lock:
                    conn.execute(
                        "UPDATE restaurants SET scrape_status = 'call_needed' WHERE place_id = ?",
                        (place_id,),
                    )
                    conn.commit()
                status = "call_needed"

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
    if llm_only == "uncertain":
        # Re-run LLM on medium-confidence results with a smarter model
        query = "SELECT place_id, name, website, raw_text_preview FROM restaurants WHERE scrape_status = 'extracted_llm_uncertain'"
    elif llm_only == "failed":
        # Re-run LLM on call_needed that have stored page text
        query = "SELECT place_id, name, website, raw_text_preview FROM restaurants WHERE scrape_status = 'call_needed' AND raw_text_preview IS NOT NULL AND LENGTH(raw_text_preview) > 100"
    elif llm_only:
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
    llm_sem   = asyncio.Semaphore(3)   # max 3 concurrent xAI API calls

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
                        # LLM failed — mark call_needed
                        async with conn_lock:
                            conn.execute(
                                "UPDATE restaurants SET scrape_status = 'call_needed' WHERE place_id = ?",
                                (row["place_id"],),
                            )
                            conn.commit()
                        status = "call_needed"
                else:
                    status = "no_text"
                counts[status] = counts.get(status, 0) + 1
                done += 1
                if done % 50 == 0:
                    print(f"  [{done}/{len(rows)}] LLM pass in progress...")
        else:
            tasks = [
                process_restaurant(client, sem, llm_sem, conn, conn_lock, row, run_llm)
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
    parser.add_argument("--llm-only",         action="store_true", help="Re-run LLM on needs_llm=1 restaurants")
    parser.add_argument("--reverify-uncertain",action="store_true", help="Re-run LLM on extracted_llm_uncertain using smarter model")
    parser.add_argument("--reverify-failed",   action="store_true", help="Re-run LLM on call_needed that have stored page text")
    parser.add_argument("--no-llm",           action="store_true", help="Skip LLM pass (faster, more goes to call list)")
    args = parser.parse_args()

    llm_only = "uncertain" if args.reverify_uncertain else ("failed" if args.reverify_failed else (True if args.llm_only else False))

    asyncio.run(run(
        borough  = args.borough,
        limit    = args.limit,
        rescrape = args.rescrape,
        llm_only = llm_only,
        run_llm  = not args.no_llm,
    ))
