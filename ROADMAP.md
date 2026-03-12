# ROADMAP.md — Pabu's NoDash Task Tracker

**Read this every session. Update it after every change. This is your brain.**

---

## 🔥 BLOCKED ON ALEX (flesh sack tasks)

- [ ] Buy domain (`nodash.nyc` or alternative) — Railway domains broken, try Namecheap/Cloudflare
- [ ] Railway: add custom domain once purchased
- [ ] Approve Twitter launch thread before posting (Alex's account)
- [ ] Approve Reddit posts before posting (Alex's identity)

## 📋 TODO — Engineering

### Launch Blockers
- [ ] Mobile test pass — verify tap-to-call, photo loading, map on real device

### Post-Launch
- [ ] Structured data (JSON-LD for local business listings)
- [ ] Search improvements: debounced live search, fuzzy matching
- [ ] Filter by delivery fee (free / under $5 / any)
- [ ] Blog content for SEO ("How much does DoorDash charge restaurants?")
- [ ] Light/dark mode toggle (currently light only)

### Data Quality — IN PROGRESS
- [ ] **Delivery details scraper** — scraping Toast/Slice/ChowNow/Sauce pages for fee/min/radius (Opus agent running)
  - Currently: 12% have delivery fee, 6% have minimums — embarrassing for a delivery directory
  - 1,507 platform restaurants, most have structured ordering pages with this data
- [ ] LLM re-extraction for delivery fee/min from raw_text_preview (2,611 restaurants)
- [ ] Find missing order URLs for platform restaurants (654 without URLs)
- [ ] 881 `extracted_llm_uncertain` restaurants — show with "unverified" badge or hide?
- [ ] Re-scrape `http_404` restaurants with bare domain (strip UTM/paths)
- [ ] AI voice calling pipeline (Bland.ai) for 1,611 `call_needed` + 1,518 no-website restaurants (~$217)

### Future
- [ ] Supabase migration (schema + script ready in `supabase/` and `pipeline/`)
- [ ] Crowdsource verification — let users confirm/correct delivery info
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

### Frontend — Core
- [x] Next.js 16 frontend — homepage, search, restaurant detail pages
- [x] SQLite served via better-sqlite3 (readonly) on Railway volume
- [x] Deployed on Railway — `https://web-production-638bc.up.railway.app`
- [x] DB delivery via GitHub release + `ensure-db.sh` (v0.1.3)

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
- [x] SVG favicon + PWA manifest

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

### Frontend — Other
- [x] About page
- [x] Feedback page at `/feedback`
- [x] Split formatters.ts (client-safe) from db.ts (server-only)

## 📊 KEY METRICS

- **Total restaurants in DB:** 7,060
- **Confirmed direct delivery:** 3,067 (43%)
- **With online order URL:** 1,054 (after cleanup)
- **With photos:** 3,062
- **Call needed:** 1,611
- **No website (need calls):** 1,518
- **Uncertain (LLM medium):** 881
- **DB version:** v0.1.3 (photos + cuisine labels)
- **Delivery fee coverage:** 397/3,067 (12%) — 198 free
- **Delivery minimum coverage:** 197/3,067 (6%)
- **Delivery radius coverage:** 519/3,067 (16%)
- **Platform breakdown:** Slice 578, Toast 398, Sauce 161, ChowNow 159, Menufy 105

## 🧠 DECISIONS LOG

- **Brand:** Warm cream + coral, "Your neighborhood delivers. Free.", honest/direct NYC energy
- **Color scheme:** #FDFBF7 bg, #E85D3A accent, #FFFFFF cards, #8C8478 muted (was dark+green, changed 3/12)
- **Hosting:** Railway — Nixpacks, persistent volume for SQLite, auto-deploy from GitHub
- **Railway URL:** `https://web-production-638bc.up.railway.app`
- **Railway project ID:** `f68e65e1-53f5-4bc4-87d6-8c6e6c3472b0`
- **Domain:** TBD — `nodash.nyc` preferred, Railway domains broken
- **Launch scope:** All NYC (not neighborhood pilot)
- **DB:** SQLite on Railway volume, downloaded from GitHub release on boot
- **Architecture:** lib/formatters.ts (client-safe) + lib/db.ts (server-only with sqlite)
- **Calling plan:** Bland.ai for phone verification (~$0.07/min, ~$217 for full dataset)

## 🔥 PABU'S MANDATE

**You are the solo founder. Ship fast. Market like hell. Update this file after every change.**

---

*Last updated: 2026-03-12 18:11 UTC*
