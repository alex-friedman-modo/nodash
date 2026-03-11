-- =============================================================================
-- nodash: NYC Restaurant Direct Delivery Directory
-- Supabase Postgres Migration — Production Schema
-- =============================================================================

-- Enable PostGIS if needed later for geo queries (optional, already on Supabase)
-- CREATE EXTENSION IF NOT EXISTS postgis;

-- =============================================================================
-- 1. RESTAURANTS — core restaurant data
-- =============================================================================
CREATE TABLE IF NOT EXISTS restaurants (
    -- Identity
    place_id            TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    address             TEXT,
    short_address       TEXT,
    zip_code            TEXT,
    neighborhood        TEXT,
    borough             TEXT,
    phone               TEXT,
    website             TEXT,
    lat                 DOUBLE PRECISION,
    lng                 DOUBLE PRECISION,

    -- Ratings & price
    rating              REAL,
    review_count        INTEGER,
    price_level         TEXT,
    price_low           INTEGER,
    price_high          INTEGER,

    -- Type & cuisine
    primary_type        TEXT,
    types               JSONB DEFAULT '[]'::jsonb,

    -- Ordering capabilities (from Google Places)
    delivery            BOOLEAN,
    takeout             BOOLEAN,
    dine_in             BOOLEAN,
    curbside_pickup     BOOLEAN,

    -- Hours
    opening_hours       JSONB,        -- weekday descriptions array
    delivery_hours      JSONB,        -- secondary hours DELIVERY
    takeout_hours       JSONB,        -- secondary hours TAKEOUT

    -- Payment
    payment_cash_only   BOOLEAN,
    payment_options     JSONB,

    -- Descriptions
    editorial_summary   TEXT,
    generative_summary  TEXT,

    -- Reviews (top 5 from Google)
    reviews             JSONB DEFAULT '[]'::jsonb,

    -- Status
    business_status     TEXT,

    -- Dietary & meal service
    serves_vegetarian   BOOLEAN,
    serves_breakfast    BOOLEAN,
    serves_brunch       BOOLEAN,
    serves_lunch        BOOLEAN,
    serves_dinner       BOOLEAN,
    serves_cocktails    BOOLEAN,
    serves_dessert      BOOLEAN,
    serves_coffee       BOOLEAN,

    -- Vibe / amenities
    outdoor_seating     BOOLEAN,
    good_for_groups     BOOLEAN,
    good_for_children   BOOLEAN,
    live_music          BOOLEAN,

    -- Delivery verification (our scrape results)
    verified            BOOLEAN DEFAULT FALSE,
    direct_delivery     BOOLEAN,          -- the money column: does this place deliver directly?
    delivery_fee        TEXT,             -- kept as text: "$3.99", "Free over $25", etc.
    delivery_minimum    TEXT,             -- "$15", "None", etc.
    delivery_radius     TEXT,
    ordering_method     TEXT,             -- "website", "app", "phone", etc.
    online_order_url    TEXT,
    verification_notes  TEXT,
    last_verified       TIMESTAMPTZ,
    last_updated        TIMESTAMPTZ DEFAULT NOW(),

    -- Timestamps
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 2. SCRAPE_RESULTS — pipeline/scraping metadata (separate table)
--    One-to-one with restaurants. Keeps the main table clean for frontend queries.
-- =============================================================================
CREATE TABLE IF NOT EXISTS scrape_results (
    place_id            TEXT PRIMARY KEY REFERENCES restaurants(place_id) ON DELETE CASCADE,

    scrape_stage        TEXT,             -- 'fetch', 'parse', 'llm', 'done'
    scrape_status       TEXT,             -- 'success', 'error', 'pending', etc.
    url_category        TEXT,             -- 'direct', 'third_party', 'menu_only', etc.
    detected_platform   TEXT,             -- 'square', 'toast', 'chownow', etc.
    detected_language   TEXT,

    -- Scrape flags
    third_party         BOOLEAN,
    third_party_only    BOOLEAN,
    delivery_menu       BOOLEAN,
    has_pdf_menu        BOOLEAN,
    needs_llm           BOOLEAN,

    -- Scrape data
    pages_fetched       INTEGER,
    raw_text_preview    TEXT,             -- first ~500 chars of scraped text
    fetch_error         TEXT,
    scrape_snippets     JSONB,           -- relevant snippets for LLM
    scrape_markdown     TEXT,            -- full markdown of scraped page
    direct_order_signals TEXT,           -- raw signals found
    delivery_fee_status TEXT,

    -- LLM processing
    llm_confidence      TEXT,             -- 'high', 'medium', 'low'
    llm_processed_at    TIMESTAMPTZ,

    -- Metadata
    scrape_updated      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 3. INDEXES — optimized for frontend listing queries
-- =============================================================================

-- Primary filter indexes
CREATE INDEX idx_restaurants_borough       ON restaurants(borough);
CREATE INDEX idx_restaurants_neighborhood  ON restaurants(neighborhood);
CREATE INDEX idx_restaurants_zip_code      ON restaurants(zip_code);
CREATE INDEX idx_restaurants_direct_delivery ON restaurants(direct_delivery);
CREATE INDEX idx_restaurants_verified      ON restaurants(verified);
CREATE INDEX idx_restaurants_primary_type  ON restaurants(primary_type);
CREATE INDEX idx_restaurants_rating        ON restaurants(rating DESC NULLS LAST);

-- Composite index for the main listing query pattern:
-- "show me verified direct-delivery restaurants in Brooklyn, sorted by rating"
CREATE INDEX idx_restaurants_listing ON restaurants(
    direct_delivery, borough, neighborhood, rating DESC NULLS LAST
) WHERE direct_delivery = TRUE;

-- Full-text search on name (for search bar)
CREATE INDEX idx_restaurants_name_trgm ON restaurants USING gin (name gin_trgm_ops);

-- Scrape pipeline indexes
CREATE INDEX idx_scrape_stage  ON scrape_results(scrape_stage);
CREATE INDEX idx_scrape_status ON scrape_results(scrape_status);
CREATE INDEX idx_scrape_needs_llm ON scrape_results(needs_llm) WHERE needs_llm = TRUE;

-- =============================================================================
-- 4. TRIGRAM EXTENSION (for fuzzy name search)
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =============================================================================
-- 5. VIEW: restaurant_listings — what the frontend queries
-- =============================================================================
CREATE OR REPLACE VIEW restaurant_listings AS
SELECT
    r.place_id,
    r.name,
    r.neighborhood,
    r.borough,
    r.short_address,
    r.phone,
    r.website,
    r.lat,
    r.lng,
    r.direct_delivery,
    r.delivery_fee,
    r.delivery_minimum,
    r.ordering_method,
    r.online_order_url,
    r.rating,
    r.review_count,
    r.price_level,
    -- Derive a human-readable cuisine from primary_type
    CASE
        WHEN r.primary_type LIKE '%chinese%'     THEN 'Chinese'
        WHEN r.primary_type LIKE '%pizza%'        THEN 'Pizza'
        WHEN r.primary_type LIKE '%mexican%'      THEN 'Mexican'
        WHEN r.primary_type LIKE '%japanese%'     THEN 'Japanese'
        WHEN r.primary_type LIKE '%thai%'         THEN 'Thai'
        WHEN r.primary_type LIKE '%indian%'       THEN 'Indian'
        WHEN r.primary_type LIKE '%sushi%'        THEN 'Sushi'
        WHEN r.primary_type LIKE '%italian%'      THEN 'Italian'
        WHEN r.primary_type LIKE '%halal%'        THEN 'Halal'
        WHEN r.primary_type LIKE '%caribbean%'    THEN 'Caribbean'
        WHEN r.primary_type LIKE '%fast_food%'    THEN 'Fast Food'
        WHEN r.primary_type LIKE '%chicken%'      THEN 'Chicken'
        WHEN r.primary_type LIKE '%taco%'         THEN 'Tacos'
        WHEN r.primary_type LIKE '%ramen%'        THEN 'Ramen'
        WHEN r.primary_type LIKE '%american%'     THEN 'American'
        WHEN r.primary_type LIKE '%hamburger%'    THEN 'Burgers'
        WHEN r.primary_type LIKE '%korean%'       THEN 'Korean'
        WHEN r.primary_type LIKE '%vietnamese%'   THEN 'Vietnamese'
        WHEN r.primary_type LIKE '%greek%'        THEN 'Greek'
        WHEN r.primary_type LIKE '%turkish%'      THEN 'Turkish'
        WHEN r.primary_type LIKE '%french%'       THEN 'French'
        WHEN r.primary_type LIKE '%bakery%'       THEN 'Bakery'
        WHEN r.primary_type LIKE '%deli%'         THEN 'Deli'
        WHEN r.primary_type LIKE '%seafood%'      THEN 'Seafood'
        WHEN r.primary_type LIKE '%breakfast%'    THEN 'Breakfast'
        WHEN r.primary_type LIKE '%vegan%'        THEN 'Vegan'
        WHEN r.primary_type LIKE '%vegetarian%'   THEN 'Vegetarian'
        WHEN r.primary_type LIKE '%sandwich%'     THEN 'Sandwiches'
        WHEN r.primary_type LIKE '%coffee%'       THEN 'Coffee'
        WHEN r.primary_type LIKE '%ice_cream%'    THEN 'Ice Cream'
        WHEN r.primary_type LIKE '%meal_takeaway%' THEN 'Takeout'
        WHEN r.primary_type LIKE '%meal_delivery%' THEN 'Delivery'
        WHEN r.primary_type = 'restaurant'        THEN 'Restaurant'
        ELSE INITCAP(REPLACE(REPLACE(r.primary_type, '_restaurant', ''), '_', ' '))
    END AS cuisine,
    r.primary_type,
    r.verified,
    r.serves_vegetarian,
    r.opening_hours,
    r.delivery_hours,
    r.editorial_summary,
    r.delivery,
    r.takeout,
    r.dine_in
FROM restaurants r
WHERE r.business_status IS NULL
   OR r.business_status = 'OPERATIONAL';

-- =============================================================================
-- 6. ROW LEVEL SECURITY
-- =============================================================================

-- Enable RLS on both tables
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_results ENABLE ROW LEVEL SECURITY;

-- Anon & authenticated users: read-only access to restaurants
CREATE POLICY "Restaurants are publicly readable"
    ON restaurants
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- Service role: full CRUD on restaurants (bypasses RLS by default, but explicit is good)
CREATE POLICY "Service role full access to restaurants"
    ON restaurants
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Scrape results: NOT readable by anon (internal pipeline data)
CREATE POLICY "Scrape results readable by authenticated users"
    ON scrape_results
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Service role full access to scrape_results"
    ON scrape_results
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- =============================================================================
-- 7. UPDATED_AT TRIGGER
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_restaurants_updated_at
    BEFORE UPDATE ON restaurants
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 8. COMMENTS (for Supabase dashboard clarity)
-- =============================================================================
COMMENT ON TABLE restaurants IS 'NYC restaurants with direct delivery verification status';
COMMENT ON TABLE scrape_results IS 'Website scraping pipeline metadata (internal)';
COMMENT ON VIEW restaurant_listings IS 'Frontend-optimized view with derived cuisine labels';
COMMENT ON COLUMN restaurants.direct_delivery IS 'TRUE = restaurant offers their own delivery (not just DoorDash/UberEats)';
COMMENT ON COLUMN restaurants.delivery_fee IS 'Free-text delivery fee: "$3.99", "Free over $25", etc.';
COMMENT ON COLUMN restaurants.ordering_method IS 'How to order: website, app, phone, etc.';
