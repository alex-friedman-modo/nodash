# nodash 🍕

> Find NYC restaurants that deliver directly — no DoorDash, no Grubhub, no fees.

**nodash** is a directory of NYC restaurants that do their own delivery. No app middlemen. No $5.99 fees. Just call and order.

## What It Does

1. **Discovers** delivery-capable restaurants via Google Places API
2. **Verifies** whether they deliver directly (vs. through apps) via AI-powered phone calls
3. **Surfaces** free delivery spots in a clean, mobile-first web app

## Project Structure

```
nodash/
├── pipeline/           # Data collection & verification
│   ├── build_db.py     # Pull restaurants from Google Places → SQLite
│   ├── scrape_websites.py  # Website scrape pass (delivery keywords)
│   └── verify_calls.py    # ElevenLabs AI calling pipeline
├── scripts/            # Utility scripts
│   └── export_csv.py   # Export DB to CSV for manual review
├── data/               # Generated data (gitignored)
│   └── restaurants.db  # SQLite database
├── web/                # Frontend (coming soon)
└── README.md
```

## Setup

```bash
# Install dependencies
pip install -r requirements.txt

# Set env vars
export GOOGLE_PLACES_API_KEY=your_key
export ELEVENLABS_API_KEY=your_key
export TWILIO_ACCOUNT_SID=your_sid
export TWILIO_AUTH_TOKEN=your_token
```

## Usage

### 1. Build the restaurant database

```bash
# Park Slope only (test)
python pipeline/build_db.py

# All of NYC
python pipeline/build_db.py --all
```

### 2. Scrape websites for delivery info

```bash
python pipeline/scrape_websites.py
```

### 3. Run AI verification calls

```bash
# Dry run (no actual calls)
python pipeline/verify_calls.py --dry-run

# Call unverified restaurants
python pipeline/verify_calls.py
```

### 4. Export for review

```bash
python scripts/export_csv.py
```

## Data Model

The SQLite database tracks:

| Field | Source | Notes |
|-------|--------|-------|
| `name`, `address`, `phone`, `website` | Google Places | Auto-populated |
| `delivery` | Google Places | Boolean — do they deliver at all? |
| `price_level`, `price_range` | Google Places | $–$$$$ |
| `delivery_hours` | Google Places | When delivery is available |
| `direct_delivery` | Verification call | Do THEY deliver, not DoorDash? |
| `delivery_fee` | Verification call | Free / $X |
| `delivery_minimum` | Verification call | Min order amount |
| `delivery_radius` | Verification call | How far they deliver |
| `ordering_method` | Verification call | Phone / website / both |

## Verification Pipeline

Data quality waterfall — cheapest/fastest first, escalate only when needed:

1. **Google Places** → filter `delivery: true`, get phone + website
2. **Website scrape** → keyword search for "free delivery", detect third-party app links
3. **LLM pass** → feed website HTML to model, extract structured delivery info
4. **AI phone call** → ElevenLabs agent calls restaurant, asks directly
5. **Crowdsourced updates** → users flag stale data in the app

## Target Market

Park Slope, Brooklyn — yuppies who want to support local restaurants and hate DoorDash's fees.

Then all of NYC.

## Status

- [x] Google Places pipeline built
- [x] Park Slope database seeded (62 restaurants)
- [ ] Website scrape pipeline
- [ ] ElevenLabs calling integration
- [ ] Web frontend
- [ ] NYC-wide data pull
