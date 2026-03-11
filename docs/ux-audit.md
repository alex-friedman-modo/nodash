# nodash UX Audit — March 11, 2026

## The Exercise: Walk Through as a Real User

### Persona: Maria, 34, lives in Astoria, tired of paying $8 delivery fees on DoorDash

---

## Step 1: Maria finds nodash (Reddit post, friend's text, Google search)

**What she sees first:** "NYC restaurants that deliver without the apps."

**How it feels:** Fine. Clear value prop. But... cold. It reads like a tech pitch deck, not like someone who gives a shit about her neighborhood Thai place. The green-on-black screams "developer project" not "community thing."

**What's missing:** A human reason to trust this. WHO made this? WHY? There's no story, no face, no neighborhood energy. It could be a VC-backed data scraper for all she knows.

**Fix ideas:**
- Warmer language: "Your neighborhood restaurants deliver. You just didn't know."
- A real origin story visible on the homepage (not buried in /about)
- Testimonial or quote from a real restaurant owner (future)

---

## Step 2: Maria wants to find food near her

**What she sees:** A search bar, cuisine filters, borough tabs

**How it feels:** Overwhelming. 12 cuisine options, 5 borough tabs, a search bar. Three different ways to filter before she's even seen a restaurant. And the default view shows 3,067 restaurants sorted by... what? She has no context.

**The real problem:** Maria doesn't think in boroughs or cuisine categories first. She thinks "I want food near me" or "what's good around here." The site makes her do work upfront.

**Fix ideas:**
- **Map view** — this is the killer feature we're missing. A map of her area with pins. She zooms into Astoria, sees what's around her. THAT'S how New Yorkers think about food.
- **Popular near [neighborhood]** — if she types Astoria, show "Popular in Astoria" as a section header, not just a flat list
- **Reduce initial choices** — hide cuisine filter by default, show it as a secondary action
- **"Near me" button** — use browser geolocation to auto-filter

---

## Step 3: Maria browses results

**What she sees:** Restaurant cards with name, neighborhood, cuisine, rating, and buttons

**How it feels:** Like a database query. Every card looks the same. No photos, no personality, no reason to pick one over another. It's a phonebook with ratings.

**What's missing:**
- **Photos** — even one photo per restaurant would transform the experience. Google Places API has photos. We should use them.
- **Social proof** — "Popular" or "New" badges, trending indicators
- **Personality** — a one-line description or review snippet would make each card feel alive
- **Distance** — if we know her location, show "0.3 mi" not just "Northwest Queens"

**Fix ideas:**
- Add Google Places photos to cards (we have the API key and photo references in the data)
- Show the `editorial_summary` on cards (we have this in the DB!)
- Add a "Popular" badge for restaurants with 500+ reviews
- Distance calculation if geolocation is available

---

## Step 4: Maria picks a restaurant

**What she sees:** Detail page with delivery info, phone, order link, Google Maps link

**How it feels:** Actually decent. The info is useful. But it's still clinical — like reading a business listing, not getting excited about food.

**What's missing:**
- Menu (even a link to their menu would help)
- Photos (again — this is the #1 thing that makes food feel real)
- Reviews or review snippets
- Hours (when can I actually order?)
- "Others also ordered from" (related restaurants)

**Fix ideas:**
- Pull Google Places photos for detail pages
- Show business hours prominently
- Add a "Similar nearby" section
- Show the description/editorial_summary more prominently

---

## Step 5: Maria orders

**What she sees:** "Order Online" button or phone number

**How it feels:** This is actually the best part. Clear CTA. No signup wall. Just... order. This is where nodash wins. The entire site should be designed to get her HERE as fast as possible.

**What could be better:**
- The "Order Online" button should be MASSIVE and sticky (always visible)
- "Call to order" should have one-tap calling
- Show what ordering method to expect (Toast? Slice? Their website?)

---

## The Map Question

Alex mentioned a map. He's right. Here's why:

**New Yorkers are spatial thinkers.** They don't think "I want food in Northwest Queens." They think "what's on 30th Ave" or "what's near the Astoria Blvd stop." A map instantly communicates:
- Where restaurants are relative to ME
- Density of options in my area
- Discovery ("oh I didn't know that place delivers")

**Implementation:**
- Leaflet.js or Mapbox GL (free tier)
- We have lat/lng for every restaurant
- Toggle between list view and map view
- Cluster pins when zoomed out
- Click pin → card popup → order

**Priority: HIGH.** This is the single biggest UX improvement we can make.

---

## The "Techbro" Problem

Alex is right that it feels techbroey. Here's why:

1. **Dark mode default** — dark mode screams developer tool, not consumer app
2. **Green accent** — Matrix vibes, not food vibes
3. **No imagery** — all text, all data, no photos, no warmth
4. **The language** — "verified", "platform fees", "directory" — these are startup words
5. **The stats** — "3,067 restaurants verified, $0 platform fees, 5 boroughs covered" reads like a pitch deck slide

**How to fix without a full rebrand:**
- Add restaurant photos (transforms the entire feel)
- Light mode option (or light mode default!)
- Warmer accent color? Or keep green but add warm imagery to balance it
- Replace startup language with human language:
  - "verified" → "we checked" or just don't say it
  - "platform fees" → "delivery app fees"  
  - "directory" → don't call it anything, it just IS
- The "Why order direct?" section is actually good copy, but the emoji+card format is still very landing-page-y

---

## Revised Roadmap Priority (feelings-driven)

### P0 — Makes it feel human
1. **Restaurant photos** from Google Places API (transforms every page)
2. **Map view** with restaurant pins (how New Yorkers actually think)
3. **Show descriptions on cards** (editorial_summary from Google)
4. **"Near me" geolocation** button

### P1 — Makes it useful  
5. **Business hours** on cards and detail pages
6. **Popular/trending badges** (500+ reviews)
7. **Light mode** toggle
8. **Better restaurant detail page** (photos, hours, similar nearby)

### P2 — Makes it grow
9. **OG image** for social sharing
10. **Borough/neighborhood landing pages** for SEO
11. **"Submit your restaurant"** flow (growth loop)
12. Reddit/Twitter launch (blocked on domain)

### P3 — Nice to have
13. Menu links
14. Delivery radius visualization on map
15. "Favorites" (localStorage, no accounts)
16. SMS/email a restaurant link to yourself

---

## Key Insight

The current site answers: "Here's a database of restaurants that deliver direct."
It should answer: "Your neighborhood is full of restaurants that deliver. Here they are."

The difference is subtle but everything. One is a tool. The other is a discovery experience.
