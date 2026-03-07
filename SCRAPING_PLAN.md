# Nodash Website Scraping Pipeline — Architecture Plan

> Designed by Opus. To be implemented in `pipeline/scrape_websites.py`.

## Philosophy

Three-stage pipeline, cheapest first. Every restaurant gets classified into:
- **extracted** — got usable data, done
- **ambiguous** — needs LLM pass (~$1-2 total)
- **call_needed** — falls through to ElevenLabs calling pipeline

The scraper's job is to REDUCE the call list, not replace it.

---

## What We Need to Extract

| Field | Example |
|-------|---------|
| `delivery_fee` | "free", "$3.99", "varies" |
| `delivery_minimum` | "$15", "$20", "none" |
| `delivery_radius` | "within 2 miles", "Park Slope only", zip codes |
| `ordering_method` | "phone", "website", "toast", "chownow", "slice" |
| `online_order_url` | direct link to order page |
| `third_party_only` | true if only DoorDash/UberEats, no own ordering |
| `delivery_hours` | delivery-specific hours if different from regular |

---

## Stage 0: URL Triage (Pre-Fetch, Free)

Before fetching anything, classify the URL by domain.

### Early-Exit (skip entirely, mark `call_needed`):

```python
SKIP_DOMAINS = {
    # Third-party marketplaces
    'doordash.com', 'ubereats.com', 'grubhub.com', 'seamless.com',
    'postmates.com', 'caviar.com',
    # Social media
    'instagram.com', 'facebook.com', 'fb.com', 'tiktok.com',
    'twitter.com', 'x.com', 'yelp.com',
    # Google auto-generated sites
    'sites.google.com', 'business.google.com',
    # Link aggregators
    'linktr.ee', 'linkin.bio',
}
```

### Platform Detection (flag + still fetch):

```python
ORDERING_PLATFORMS = {
    'toasttab.com':    'toast',
    'square.site':     'square',
    'squareup.com':    'square',
    'order.online':    'square',
    'chownow.com':     'chownow',
    'slicelife.com':   'slice',
    'order.slice.com': 'slice',
    'gloriafoods.com': 'gloria',
    'clover.com':      'clover',
    'menufy.com':      'menufy',
    'beyondmenu.com':  'beyondmenu',
    'hungrypage.com':  'hungrypage',
    'order.app':       'google',
}
```

For platform URLs: immediately set `ordering_method` and `online_order_url`. Still fetch to try for fee/minimum/radius.

### DB writes:
```sql
UPDATE restaurants SET
    scrape_stage = 'triage',
    url_category = 'skip' | 'platform' | 'custom_site',
    detected_platform = 'toast' | NULL,
    online_order_url = <url if platform>,
    scrape_status = 'skipped_third_party' | 'skipped_social' | 'pending_fetch'
WHERE place_id = ?;
```

**Expected yield:** ~15-20% triaged without a single HTTP request.

---

## Stage 1: Fetch + Extract

### Crawl Strategy: Homepage + Up to 3 Targeted Sub-Pages

1. **Fetch homepage** — async httpx, 10-20 concurrency, 15s timeout, follow redirects (up to 3 hops)
2. **After redirect**: re-check final URL against SKIP_DOMAINS (restaurants often redirect to their DoorDash page)
3. **Extract internal links** from homepage HTML (not trafilatura — do this on raw HTML)
4. **Follow up to 3 sub-pages** that match these patterns (priority order):

```python
SUBPAGE_PATTERNS = [
    r'/deliver',   # /delivery, /deliveries
    r'/order',     # /order, /order-online, /ordering
    r'/menu',      # delivery minimums often here
    r'/faq',       # "do you deliver?" FAQ
    r'/catering',  # often has delivery radius
    r'/about',     # sometimes delivery area mentioned
    r'/contact',   # phone number for ordering
]
```

5. Run **trafilatura** on each page (markdown output, ignore links/images, favor_recall=True)
6. Concatenate all page markdown into one document per restaurant

### PDF Handling

- Detect PDF links in raw HTML: `href="*.pdf"` or content-type `application/pdf`
- If a sub-page link is a PDF (usually the menu), fetch it
- Use `pdfplumber` to extract text
- Add to the concatenated document
- **Worth it** — a lot of NYC restaurants, especially older ones, have PDF menus with delivery info

### Platform-Specific Extraction

**Toast (`toasttab.com`):**
- Check `<script id="__NEXT_DATA__">` JSON blob — sometimes has delivery config
- Look for JSON-LD schema markup

**Slice (`slicelife.com`):**
- Presence = they accept online delivery orders, that's confirmed
- Default `ordering_method = 'slice'`, `online_order_url = the URL`
- Fee/minimum usually requires clicking through the order flow — mark as `needs_llm`

**Square/ChowNow/others:**
- Fetch the page, trafilatura extracts what it can
- Presence confirms online ordering capability

### Keyword + Regex Extraction

Run on the combined markdown from all fetched pages:

```python
DELIVERY_PATTERNS = {
    'delivery_fee': [
        r'free\s+delivery',
        r'delivery\s+(?:is\s+)?free',
        r'no\s+delivery\s+(fee|charge)',
        r'delivery\s+fee[:\s]*\$?([\d.]+)',
        r'\$?([\d.]+)\s+delivery\s+(fee|charge)',
    ],
    'delivery_minimum': [
        r'minimum\s+(?:order|delivery)[:\s]*\$?([\d.]+)',
        r'\$?([\d.]+)\s+minimum',
        r'min(?:imum)?\s+order[:\s]*\$?([\d.]+)',
        r'orders?\s+(?:over|above|of)\s+\$?([\d.]+)',
        r'free\s+delivery\s+on\s+orders?\s+(?:over|above)\s+\$?([\d.]+)',
    ],
    'delivery_radius': [
        r'deliver(?:y|ing)?\s+within\s+([\d.]+)\s+miles?',
        r'([\d.]+)\s+mile\s+(?:delivery\s+)?radius',
        r'delivery\s+(?:area|zone|range)[:\s]*(.*?)(?:\.|$)',
        r'zip\s+codes?[:\s]*([\d,\s]+)',
    ],
    'delivery_hours': [
        r'delivery\s+hours?[:\s]*(.*?)(?:\n|$)',
    ],
    'phone_order': [
        r'(?:call|phone)\s+(?:us\s+)?(?:to\s+order|for\s+delivery)',
    ],
}

# Run on RAW HTML for link detection:
THIRD_PARTY_LINK_PATTERNS = [
    r'href=["\']https?://(?:www\.)?doordash\.com',
    r'href=["\']https?://(?:www\.)?ubereats\.com',
    r'href=["\']https?://(?:www\.)?grubhub\.com',
    r'href=["\']https?://(?:www\.)?seamless\.com',
]

ORDER_LINK_PATTERNS = [
    r'href=["\']([^"\']*(?:toasttab|chownow|slicelife|square\.site|squareup|menufy|beyondmenu|clover)[^"\']*)["\']',
]
```

### Classification After Stage 1

| Category | Criteria | Next Step |
|----------|----------|-----------|
| `extracted_confident` | Regex found delivery fee AND/OR minimum | Store, done ✅ |
| `platform_identified` | Known ordering platform detected | Maybe LLM |
| `third_party_only` | Only links to DoorDash/UberEats, no own system | Store, exclude from app ❌ |
| `has_text_ambiguous` | Has content but regex couldn't extract cleanly | → Stage 2 LLM |
| `no_content` | Empty, parking page, or JS-only with no text | → `call_needed` |
| `fetch_failed` | Timeout, 404, SSL error | → `call_needed` |

### DB writes after Stage 1:
```sql
ALTER TABLE restaurants ADD COLUMN scrape_stage TEXT;
ALTER TABLE restaurants ADD COLUMN url_category TEXT;
ALTER TABLE restaurants ADD COLUMN detected_platform TEXT;
ALTER TABLE restaurants ADD COLUMN scrape_status TEXT;
ALTER TABLE restaurants ADD COLUMN delivery_fee TEXT;
ALTER TABLE restaurants ADD COLUMN delivery_minimum TEXT;
ALTER TABLE restaurants ADD COLUMN delivery_radius TEXT;
ALTER TABLE restaurants ADD COLUMN online_order_url TEXT;
ALTER TABLE restaurants ADD COLUMN third_party_only INTEGER;
ALTER TABLE restaurants ADD COLUMN has_pdf_menu INTEGER;
ALTER TABLE restaurants ADD COLUMN detected_language TEXT;
ALTER TABLE restaurants ADD COLUMN pages_fetched INTEGER;
ALTER TABLE restaurants ADD COLUMN raw_text_preview TEXT;  -- first 3000 chars for LLM
ALTER TABLE restaurants ADD COLUMN fetch_error TEXT;
ALTER TABLE restaurants ADD COLUMN scrape_updated TEXT;
ALTER TABLE restaurants ADD COLUMN needs_llm INTEGER;
```

**Expected yield:** ~30-40% get confident extraction or clear third-party. ~25-30% go to LLM. Rest go to calls.

---

## Stage 2: LLM Pass (~$1-2 total)

For the `has_text_ambiguous` bucket.

### Model
Claude Haiku 3.5 or GPT-4o-mini. Both ~$0.25/M input tokens. At ~1,500 tokens/restaurant × ~2,000 ambiguous = ~$1-2 total.

### Input
Concatenated markdown from all fetched pages, truncated to ~3,000 tokens.

### Prompt

```
You are extracting delivery information from a restaurant's website text.

Given the following website content, extract these fields. Return ONLY a JSON object.
If a field cannot be determined, use null.

Fields:
- delivery_fee: string or null — "free", "$3.99", "varies by distance"
- delivery_minimum: string or null — "$15", "$20", "none"
- delivery_radius: string or null — "2 miles", "Manhattan only", "10001-10012"
- ordering_method: "website" | "phone" | "toast" | "chownow" | "slice" | "square" | "other_platform" | null
- online_order_url: string or null — direct URL to order online
- third_party_only: boolean — true ONLY if their ONLY delivery option is DoorDash/UberEats with no independent ordering
- delivery_hours: string or null — delivery-specific hours if different from regular hours
- confidence: "high" | "medium" | "low"

IMPORTANT:
- "Free delivery on orders over $20" → delivery_fee="free", delivery_minimum="$20"
- "Order on DoorDash" with no other option → third_party_only=true
- Phone number + "call to order" → ordering_method="phone"
- A link to toasttab.com/etc → capture as online_order_url AND set ordering_method

Website content:
---
{text}
---

Return JSON only, no explanation.
```

### Post-LLM Classification

| Confidence | Action |
|------------|--------|
| `high` | Store, mark `extracted_llm` |
| `medium` | Store, mark `extracted_llm_uncertain` |
| `low` | Move to `call_needed` |

### DB writes after Stage 2:
```sql
ALTER TABLE restaurants ADD COLUMN llm_confidence TEXT;
ALTER TABLE restaurants ADD COLUMN llm_processed_at TEXT;
```

---

## Edge Cases Summary

| Edge Case | Handling |
|-----------|----------|
| PDF menu | Fetch with pdfplumber, extract text, add to document |
| Image menu (JPG/PNG) | Skip (no OCR) → fall to call |
| JS-heavy site | trafilatura gets what it can; if empty → `call_needed` |
| Website IS DoorDash page | Stage 0 URL triage catches this |
| Instagram/Facebook | Stage 0 URL triage catches this |
| Google auto-site | Stage 0 URL triage catches this |
| Toast/Square/Slice subdomain | Platform detection + fetch |
| Delivery info inside order flow | Can't get it → `needs_llm`, then `call_needed` |
| Non-English site | Keywords miss it → LLM might catch it (multilingual capable) |
| Info in hover menus/popups | Miss it → fall to LLM/call |
| Info on /delivery subpage | Covered by subpage crawl strategy |
| Redirect to DoorDash | Re-check final URL after redirect |

---

## Implementation Notes

- Use `pdfplumber` for PDF extraction (add to pyproject.toml)
- Use `langdetect` or check for non-ASCII to detect non-English sites
- Rate limit: `asyncio.Semaphore(15)` — be polite to small restaurant servers
- Store `raw_text_preview` (first 3000 chars) in DB for LLM stage to avoid re-fetching
- Idempotent: check `scrape_stage IS NULL` before processing, support `--rescrape` flag
- Progress: print running counts (extracted/ambiguous/third-party/errors) every 100 restaurants
