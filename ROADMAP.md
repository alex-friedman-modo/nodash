# ROADMAP.md — Pabu's NoDash Task Tracker

**Read this every session. Update it after every change. This is your brain.**

---

## 🔥 BLOCKED ON ALEX (flesh sack tasks)

- [x] ~~Buy domain~~ — **nodash.co** purchased on Railway ✅ (2026-03-13)
- [x] ~~Railway: add custom domain~~ — **nodash.co is LIVE** ✅
- [ ] Approve Twitter launch thread before posting (Alex's account)
- [ ] Approve Reddit posts before posting (Alex's identity)
- [ ] Add `www.nodash.co` as second custom domain in Railway dashboard
- [ ] Generate new Railway API token (old one expired)

## 📋 TODO — Engineering

### Launch Blockers
- [x] ~~Mobile test pass~~ — tap-to-call ✅, photos ✅, map ✅ (tested by Alex 2026-03-14)
  - Map needs improvements but shelved for now

### Post-Launch
- [ ] Structured data (JSON-LD for local business listings)
- [ ] Search improvements: debounced live search, fuzzy matching
- [x] ~~Filter by delivery fee~~ — **Free Delivery toggle** shipped (`e88f204`), 298 restaurants
- [ ] Blog content for SEO ("How much does DoorDash charge restaurants?")
- [ ] Light/dark mode toggle (currently light only)

### Data Quality
- [x] ~~Delivery details scraper~~ — Toast Playwright scraper done (158 fees from 344 restaurants)
- [x] ~~Fix broken Slice URLs~~ — **471 fixed** by scraping restaurant websites for real slicelife.com links
- [x] ~~Scrape Slice minimums~~ — **465 minimums** extracted from Slice pages
- [ ] LLM re-extraction — already done with Gemini/Grok, diminishing returns on same data
- [ ] Playwright deep scrape on "website" restaurants (749 gap) — render JS ordering pages
- [ ] Bland.ai phone verification for ~500 phone-only restaurants (~$35-50)
- [ ] 881 `extracted_llm_uncertain` restaurants — show with "unverified" badge or hide?
- [x] ~~Re-scrape failed fetches~~ — 66 new restaurants found (3,067 → 3,133)

### Crowdsource (NEW — built 2026-03-13)
- [x] Crowdsource delivery details form — step-by-step flow on restaurant detail pages
- [x] Leaderboard page (`/leaderboard`) with top contributors + borough progress bars
- [x] `/api/submissions`, `/api/leaderboard`, `/api/progress` endpoints
- [x] Contributor tracking (localStorage UUID + optional display name)
- [x] Community progress component on homepage
- [ ] Admin review flow for submitted data (approve/reject/merge into main DB)

### Menu Links
- [x] Rename "Order Online" → "Menu & Order" (platform URLs show menus anyway)
- [x] "View Menu" button on detail pages for 78 restaurants with delivery_menu URLs
- [ ] Google Places `menuUri` re-query for more menu links (~$9 API cost)
- [ ] Scrape `/menu` paths from restaurant websites (raw_text_preview)

### Future
- [ ] Supabase migration (schema + script ready in `supabase/` and `pipeline/`)
- [ ] Restaurant claim flow — let owners update their listing
- [ ] Favorites (localStorage, no accounts)

## ✅ DONE

### Data Pipeline
- [x] Google Places API data pull — 7,060 restaurants, all 5 boroughs
- [x] 3-stage scraping pipeline (URL triage → fetch+regex → LLM)
- [x] Grok + Gemini LLM passes on all restaurants
- [x] Playwright SPA scraper — 50 new direct delivery found
- [x] 3,067 restaurants confirmed direct delivery
- [x] Cleaned 854 broken order URLs
- [x] Cuisine labels added to DB (`cuisine_label` column)
- [x] Google Places photos fetched — 3,062/3,067 have `photo_url`
- [x] **471 broken Slice URLs fixed** — scraped correct links from restaurant websites
- [x] **465 delivery minimums** extracted from Slice pages
- [x] **158 delivery fees** extracted from Toast via Playwright
- [x] Platform fee scraper (`pipeline/extract_platform_fees.py`)
- [x] Toast Playwright scraper (`pipeline/scrape_toast_fees.py`)

### Frontend — Core
- [x] Next.js 16 frontend — homepage, search, restaurant detail pages
- [x] SQLite served via better-sqlite3 (readonly) on Railway volume
- [x] **Deployed on Railway** — `https://nodash.co` ✅
- [x] DB delivery via GitHub release + `ensure-db.sh` (v0.1.5)

### Frontend — Search & Filters
- [x] Zip code search (11215 → 62 results)
- [x] Neighborhood alias search (Park Slope → 87, Williamsburg → 161, Astoria → 131)
- [x] Cuisine filter using `cuisine_label` (merged: Pizza→891, Japanese+Sushi+Ramen→303)
- [x] Borough tabs
- [x] Smart sorting — online-order-first, then rating × review_count
- [x] "Near me" geolocation button + distance-based sorting

### Frontend — Design
- [x] **Warm light theme** — cream bg (#FDFBF7), coral accent (#E85D3A), white cards
- [x] Mobile-first redesign — photo-left cards, compact hero, horizontal scroll filters
- [x] Restaurant photos on cards (thumbnails) + detail pages (hero)
- [x] Descriptions on cards (editorial_summary / generative_summary)
- [x] 🔥 Popular badges (500+ reviews)
- [x] OG image — "Your neighborhood delivers. Free." (1200x630 PNG)
- [x] Twitter card (summary_large_image)
- [x] SVG favicon (coral on cream) + PWA manifest
- [x] **Restaurant detail page** converted to warm theme (was dark)

### Frontend — Map
- [x] Interactive Leaflet map with CartoDB dark tiles + green markers
- [x] Map upgraded: `/api/map-pins` returns ALL 3,067 restaurants
- [x] Marker clustering (leaflet.markercluster)
- [x] Photos + order buttons in map popups
- [x] List/Map view toggle

### Frontend — SEO
- [x] Borough landing pages (`/manhattan`, `/brooklyn`, etc.)
- [x] Cuisine landing pages (`/cuisine/pizza`, `/cuisine/chinese`, etc.)
- [x] Dynamic sitemap.xml with all pages
- [x] Internal linking (footer, breadcrumbs, cross-links)
- [x] robots.txt
- [x] Meta tags + SEO keywords
- [x] `metadataBase` set to `https://nodash.co`

### Frontend — Community
- [x] Crowdsource delivery form (step-by-step, 2 taps = 1 contribution)
- [x] Leaderboard page with animal emoji names + optional display names
- [x] Borough progress bars ("Brooklyn: 17% verified")
- [x] Community progress on homepage
- [x] Submissions API with rate limiting + contributor tracking

### Frontend — Other
- [x] About page
- [x] Feedback page at `/feedback`
- [x] Split formatters.ts (client-safe) from db.ts (server-only)

## 📊 KEY METRICS

- **Total restaurants in DB:** 7,060
- **Confirmed direct delivery:** 3,133 (44%)
- **With online order URL:** 1,639 (after Slice URL fix + re-scraping)
- **With photos:** 3,062
- **DB version:** v0.1.6 (re-scraped failed sites + all data improvements)
- **Delivery fee coverage:** 652/3,133 (20%) — 146 confirmed free
- **Delivery minimum coverage:** 787/3,133 (25%) — was 6% on 3/12!
- **Delivery radius coverage:** 542/3,067 (17%)
- **Platform breakdown:** Slice 580 (569 with URLs), Toast 398, Sauce 161, ChowNow 159, Menufy 105
- **Domain:** nodash.co (live on Railway)
- **E2E tests:** 32/34 passing (Playwright, mobile viewport)
- **Performance:** Homepage 1.22s, detail page 0.91s

## 🧠 DECISIONS LOG

- **Brand:** Warm cream + coral, "Your neighborhood delivers. Free.", honest/direct NYC energy
- **Color scheme:** #FDFBF7 bg, #E85D3A accent, #FFFFFF cards, #8C8478 muted
- **Hosting:** Railway — Nixpacks, persistent volume for SQLite, auto-deploy from GitHub
- **Domain:** nodash.co (bought on Railway 2026-03-13)
- **Launch scope:** All NYC (not neighborhood pilot)
- **DB:** SQLite on Railway volume, downloaded from GitHub release on boot
- **Architecture:** lib/formatters.ts (client-safe) + lib/db.ts (server-only with sqlite)
- **Fee strategy:** Don't chase exact fees — they're dynamic/stale. Focus on "free delivery" flag, radius, hours. Crowdsource the rest.
- **Crowdsource UX:** One question at a time, 2 taps = 1 contribution, optional display names (arcade high score energy)
- **Calling plan:** Bland.ai for phone verification (~$35-50 for ~500 phone-only restaurants)

## 🔥 PABU'S MANDATE

**You are the solo founder. Ship fast. Market like hell. Update this file after every change.**

---

*Last updated: 2026-03-13 19:07 UTC*
