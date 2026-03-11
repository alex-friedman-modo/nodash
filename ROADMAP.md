# ROADMAP.md — Pabu's NoDash Task Tracker

**Read this every session. Update it every session. This is your brain.**

---

## 🔥 BLOCKED ON ALEX (flesh sack tasks)

- [ ] Buy domain (`nodash.nyc` or alternative)
- [ ] Railway: add custom domain once purchased
- [ ] Approve Twitter launch thread before posting (it's Alex's account)
- [ ] Approve Reddit posts before posting (Alex's identity)

## 🏗️ IN PROGRESS

- [ ] Opus agent cleaning broken `online_order_url` entries (TOS pages, dead links)
- [ ] Monitoring Railway deploy — latest push fixing server component crash

## 📋 TODO — Engineering

### Launch Blockers
- [ ] Add favicon + OG image
- [ ] Mobile test pass — make sure phone tap-to-call works
- [ ] Fix broken `online_order_url` entries (Opus agent running)

### Post-Launch Engineering
- [ ] Neighborhood pages (`/brooklyn/park-slope`, `/queens/astoria`, etc.)
- [ ] Borough landing pages with SEO meta from launch plan
- [ ] Structured data (JSON-LD for local business listings)
- [ ] Search improvements: debounced live search, fuzzy matching
- [ ] Filter by delivery fee (free / under $5 / any)
- [ ] Blog content for SEO (e.g. "How much does DoorDash charge restaurants?")

### Data Quality
- [ ] Clean up 881 `extracted_llm_uncertain` restaurants — show with "unverified" badge or hide?
- [ ] Re-scrape `http_404` restaurants with bare domain (strip UTM/paths)
- [ ] Verify borough counts match actual data

### Future
- [ ] Supabase migration (schema + script ready in `supabase/` and `pipeline/`)
- [ ] ElevenLabs + Twilio calling pipeline for remaining 1,630 `call_needed`
- [ ] Crowdsource verification — let users confirm/correct delivery info
- [ ] Restaurant claim flow — let owners update their listing

## ✅ DONE

- [x] Google Places API data pull — 7,060 restaurants, all 5 boroughs
- [x] 3-stage scraping pipeline (URL triage → fetch+regex → LLM)
- [x] Grok LLM first pass on all restaurants with websites
- [x] Gemini 3 Flash re-verification of uncertain + failed restaurants
- [x] Playwright SPA scraper — 50 new direct delivery found
- [x] 3,067 restaurants confirmed direct delivery
- [x] Next.js frontend — homepage, search, borough tabs, restaurant detail pages
- [x] Local SQLite serving via better-sqlite3
- [x] Launch plan: copy, SEO keywords, meta tags, Reddit/Twitter drafts (`docs/launch-plan.md`)
- [x] Supabase schema + migration script (ready but not deployed)
- [x] **DEPLOYED ON RAILWAY** — `https://web-production-638bc.up.railway.app` ✅
- [x] Railway: project created, GitHub connected, volume at `/data`, DB auto-downloaded
- [x] About page with launch copy
- [x] Sitemap.xml (dynamic, API route)
- [x] robots.txt
- [x] Price level display fixed (`PRICE_LEVEL_MODERATE` → `$$`)
- [x] Cuisine filter dropdown (Pizza, Chinese, Thai, etc.)
- [x] Green "Order Online" button on cards (1,908 restaurants)
- [x] Phone button as secondary CTA
- [x] Search by neighborhood name
- [x] Feedback page at `/feedback`
- [x] Nav bar with About + Feedback links
- [x] Split formatters from db.ts for client component compatibility

## 📊 KEY METRICS

- **Total restaurants in DB:** 7,060
- **Confirmed direct delivery:** 3,067 (43%)
- **With online order URL:** 1,908 (62% of confirmed)
- **Call needed:** 1,630
- **No website (need calls):** 1,559
- **Uncertain (LLM medium):** 881
- **Fetch failed:** 305

## 🧠 DECISIONS LOG

- **Brand:** Dark mode, "Order direct. Skip the cut.", honest/direct tone, NYC energy
- **Hosting:** Railway — Nixpacks, persistent volume for SQLite, auto-deploy from GitHub
- **Railway URL:** `https://web-production-638bc.up.railway.app`
- **Railway project ID:** `f68e65e1-53f5-4bc4-87d6-8c6e6c3472b0`
- **Domain:** TBD — recommending `nodash.nyc`
- **Launch scope:** All NYC (not Park Slope first)
- **DB:** SQLite on Railway volume, downloaded from GitHub release v0.1.0 on first boot
- **Alex's role:** Flesh sack for domain/approvals, Pabu handles everything else
- **Architecture:** lib/formatters.ts (client-safe) + lib/db.ts (server-only with sqlite)

## 🔥 PABU'S MANDATE

**You are the solo founder. Your job is to get this thing ready and out there. Triage bugs. Market like hell. You are the leader.**

---

*Last updated: 2026-03-11 15:18 UTC*
