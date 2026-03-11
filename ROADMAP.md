# ROADMAP.md — Pabu's NoDash Task Tracker

**Read this every session. Update it every session. This is your brain.**

---

## 🔥 BLOCKED ON ALEX (flesh sack tasks)

- [ ] Buy domain (`nodash.nyc` or alternative)
- [ ] Decide hosting: VPS (this server + nginx) vs Vercel+Supabase
- [ ] Point DNS to server IP once domain is purchased
- [ ] Approve Twitter launch thread before posting (it's Alex's account)
- [ ] Approve Reddit posts before posting (Alex's identity)

## 🏗️ IN PROGRESS

_(nothing right now — waiting on domain/hosting from Alex)_

## 📋 TODO — Engineering

### Launch Blockers
- [ ] Set up nginx reverse proxy + pm2 for production serving
- [ ] SSL cert (Let's Encrypt / certbot)
- [x] Fix `price_level` display (shows `PRICE_LEVEL_MODERATE` instead of `$$`) ✅
- [ ] Fix `online_order_url` — some are broken links (e.g. Slice TOS page instead of restaurant)
- [ ] Add favicon + OG image
- [ ] Mobile test pass — make sure phone tap-to-call works

### Post-Launch Engineering
- [ ] Neighborhood pages (`/brooklyn/park-slope`, `/queens/astoria`, etc.)
- [ ] Borough landing pages with SEO meta from launch plan
- [x] About page with copy from `docs/launch-plan.md` ✅
- [ ] "Suggest a restaurant" form (simple mailto or Google Form)
- [x] Sitemap.xml generation for SEO ✅
- [x] robots.txt ✅
- [ ] Structured data (JSON-LD for local business listings)
- [ ] Search improvements: debounced live search, fuzzy matching
- [ ] Filter by cuisine type
- [ ] Filter by delivery fee (free / under $5 / any)

### Data Quality
- [ ] Clean up 528 `extracted_llm_uncertain` restaurants — show with "unverified" badge or hide?
- [ ] Fix broken `online_order_url` entries (some point to platform TOS/homepage instead of restaurant)
- [x] Playwright scraper for SPA sites — 50 new direct delivery found ✅
- [ ] Re-scrape `http_404` restaurants with bare domain (strip UTM/paths)
- [ ] Verify borough counts match actual data (launch plan has placeholder numbers)

### Future
- [ ] Supabase migration (schema + script ready in `supabase/` and `pipeline/`)
- [ ] Vercel deployment
- [ ] ElevenLabs + Twilio calling pipeline for remaining 1,572 `call_needed`
- [ ] Crowdsource verification — let users confirm/correct delivery info
- [ ] Blog content for SEO (e.g. "How much does DoorDash charge restaurants?")
- [ ] Restaurant claim flow — let owners update their listing

## ✅ DONE

- [x] Google Places API data pull — 7,060 restaurants, all 5 boroughs
- [x] 3-stage scraping pipeline (URL triage → fetch+regex → LLM)
- [x] Grok LLM first pass on all restaurants with websites
- [x] Gemini 3 Flash re-verification of uncertain + failed restaurants
- [x] 3,017 restaurants confirmed direct delivery
- [x] Next.js frontend — homepage, search, borough tabs, restaurant detail pages
- [x] Local SQLite serving via better-sqlite3
- [x] Launch plan: copy, SEO keywords, meta tags, Reddit/Twitter drafts (`docs/launch-plan.md`)
- [x] Supabase schema + migration script (ready but not deployed)

## 📊 KEY METRICS

- **Total restaurants in DB:** 7,060
- **Confirmed direct delivery:** 3,067 (43%)
- **Call needed:** 1,572
- **No website (need calls):** 1,559
- **Uncertain (LLM medium):** 528
- **Fetch failed:** 305

## 🧠 DECISIONS LOG

- **Brand:** Dark mode, "Order direct. Skip the cut.", honest/direct tone, NYC energy
- **Hosting:** TBD — recommending VPS first, Vercel later
- **Domain:** TBD — recommending `nodash.nyc`
- **Launch scope:** All NYC (not Park Slope first)
- **DB:** SQLite local for now, Supabase when scaling
- **Alex's role:** Flesh sack for domain/hosting/approvals, Pabu handles everything else

---

*Last updated: 2026-03-11*
