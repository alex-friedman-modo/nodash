import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getRestaurants, getDb } from "@/lib/db";
import RestaurantCard from "@/components/RestaurantCard";
import SearchBar from "@/components/SearchBar";

const BOROUGH_SLUGS: Record<string, string> = {
  manhattan: "Manhattan",
  brooklyn: "Brooklyn",
  queens: "Queens",
  bronx: "Bronx",
  "staten-island": "Staten Island",
};

// Reverse map for linking
const BOROUGH_TO_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(BOROUGH_SLUGS).map(([slug, name]) => [name, slug])
);

export { BOROUGH_TO_SLUG };

function getBoroughName(slug: string): string | null {
  return BOROUGH_SLUGS[slug] ?? null;
}

function getTopCuisinesInBorough(borough: string): { cuisine: string; count: number }[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT cuisine_label AS cuisine, COUNT(*) AS count
       FROM restaurants
       WHERE direct_delivery = 1 AND borough = ? AND cuisine_label IS NOT NULL
       GROUP BY cuisine_label
       ORDER BY count DESC
       LIMIT 10`
    )
    .all(borough) as { cuisine: string; count: number }[];
}

export function generateStaticParams() {
  return Object.keys(BOROUGH_SLUGS).map((borough) => ({ borough }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ borough: string }>;
}): Promise<Metadata> {
  const { borough: slug } = await params;
  const name = getBoroughName(slug);
  if (!name) return {};

  return {
    title: `Direct Delivery Restaurants in ${name} | nodash`,
    description: `Browse ${name} restaurants that deliver direct — no DoorDash, no Uber Eats, no middleman fees. Order straight from your favorite ${name} spots.`,
    openGraph: {
      title: `${name} Restaurants That Deliver Direct | nodash`,
      description: `Skip the apps. Find ${name} restaurants with direct delivery — your money goes straight to the restaurant.`,
      url: `https://nodash.co/${slug}`,
    },
  };
}

export const dynamic = "force-dynamic";

const CUISINE_TO_SLUG: Record<string, string> = {
  Pizza: "pizza",
  Mexican: "mexican",
  Chinese: "chinese",
  Japanese: "japanese",
  Thai: "thai",
  Indian: "indian",
  Italian: "italian",
  American: "american",
  Halal: "halal",
  Deli: "deli",
};

export default async function BoroughPage({
  params,
  searchParams,
}: {
  params: Promise<{ borough: string }>;
  searchParams: Promise<{ search?: string; cuisine?: string; page?: string }>;
}) {
  const { borough: slug } = await params;
  const boroughName = getBoroughName(slug);
  if (!boroughName) notFound();

  const sp = await searchParams;
  const search = sp.search || "";
  const cuisine = sp.cuisine || "";
  const page = parseInt(sp.page || "1");
  const limit = 24;
  const offset = (page - 1) * limit;

  const { restaurants, total } = getRestaurants({
    borough: boroughName,
    search: search || undefined,
    cuisine: cuisine || undefined,
    limit,
    offset,
  });

  const topCuisines = getTopCuisinesInBorough(boroughName);
  const totalPages = Math.ceil(total / limit);
  const isFiltering = !!search || !!cuisine;

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${boroughName} Restaurants with Direct Delivery`,
    description: `${boroughName} restaurants that deliver without delivery apps — no DoorDash, no Uber Eats.`,
    numberOfItems: total,
    itemListElement: restaurants.map((r, index) => ({
      "@type": "ListItem",
      position: offset + index + 1,
      item: {
        "@type": "Restaurant",
        name: r.name,
        url: `https://nodash.co/restaurants/${encodeURIComponent(r.place_id)}`,
        ...(r.address ? { address: r.address } : {}),
        ...(r.primary_type ? { servesCuisine: r.primary_type } : {}),
        ...(r.rating ? { aggregateRating: { "@type": "AggregateRating", ratingValue: String(r.rating) } } : {}),
      },
    })),
  };

  function paginationUrl(p: number) {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (cuisine) params.set("cuisine", cuisine);
    params.set("page", String(p));
    const qs = params.toString();
    return `/${slug}${qs ? `?${qs}` : ""}`;
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[#1a1a1a]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      {/* Nav */}
      <nav className="px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <a href="/" className="font-bold text-xl tracking-tight">
            nodash<span className="text-[var(--accent)]">.</span>
          </a>
          <div className="flex items-center gap-4 text-sm">
            <a href="/feedback" className="text-[var(--muted)] hover:text-[#1a1a1a] transition-colors">Feedback</a>
            <a href="/about" className="text-[var(--muted)] hover:text-[#1a1a1a] transition-colors">About</a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-4 pb-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-2 text-sm text-[var(--muted)] mb-2">
            <Link href="/" className="hover:text-[#1a1a1a]">Home</Link>
            <span>/</span>
            <span className="text-[#1a1a1a]">{boroughName}</span>
          </div>
          <h1 className="text-2xl md:text-4xl font-bold tracking-tight leading-snug">
            {boroughName} Restaurants That Deliver Direct
            <span className="text-[var(--accent)]">.</span>
          </h1>
          <p className="mt-2 text-sm md:text-base text-[var(--muted)]">
            {total.toLocaleString()} restaurant{total !== 1 ? "s" : ""} in {boroughName} with direct delivery — no apps, no fees, no middleman.
          </p>
        </div>
      </section>

      {/* Search */}
      <section className="sticky top-0 z-10 bg-[var(--background)]/95 backdrop-blur-sm border-b border-[var(--card-border)]">
        <div className="max-w-5xl mx-auto px-4 py-2.5">
          <SearchBar initialSearch={search} basePath={`/${slug}`} />
        </div>
      </section>

      {/* Top Cuisines */}
      {topCuisines.length > 0 && !isFiltering && (
        <section className="max-w-5xl mx-auto px-4 py-4">
          <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">
            Popular in {boroughName}
          </h2>
          <div className="flex flex-wrap gap-2">
            {topCuisines.map((c) => {
              const cuisineSlug = CUISINE_TO_SLUG[c.cuisine];
              return (
                <Link
                  key={c.cuisine}
                  href={cuisineSlug ? `/cuisine/${cuisineSlug}` : `/${slug}?cuisine=${encodeURIComponent(c.cuisine)}`}
                  className="inline-flex items-center gap-1.5 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-full px-3 py-1.5 text-sm hover:border-[var(--accent)]/50 hover:text-[var(--accent)] transition-colors"
                >
                  {c.cuisine}
                  <span className="text-[var(--muted-light)] text-xs">{c.count}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Results count */}
      <div className="max-w-5xl mx-auto px-4 py-2 flex items-center justify-between">
        <p className="text-xs text-[var(--muted)]">
          {total.toLocaleString()} result{total !== 1 ? "s" : ""}
          {cuisine ? ` · ${cuisine}` : ""}
          {search ? ` · "${search}"` : ""}
        </p>
        {isFiltering && (
          <a href={`/${slug}`} className="text-xs text-[var(--accent)] hover:underline">Clear filters</a>
        )}
      </div>

      {/* Restaurant List */}
      <section className="max-w-5xl mx-auto px-4 py-4">
        <div className="grid gap-2">
          {restaurants.map((r) => (
            <RestaurantCard key={r.place_id} r={r} />
          ))}
        </div>

        {restaurants.length === 0 && (
          <div className="text-center py-16">
            <p className="text-xl text-[var(--muted)]">No restaurants found</p>
            <p className="text-sm text-[var(--muted)] mt-2">
              Try a different search or{" "}
              <a href={`/${slug}`} className="text-[var(--accent)] hover:underline">
                clear filters
              </a>
            </p>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-4 mt-6 mb-4">
            {page > 1 && (
              <a
                href={paginationUrl(page - 1)}
                className="px-4 py-2 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg hover:bg-[var(--card-border)] text-sm transition-colors"
              >
                ← Previous
              </a>
            )}
            <span className="px-4 py-2 text-sm text-[var(--muted)]">
              {page} / {totalPages}
            </span>
            {page < totalPages && (
              <a
                href={paginationUrl(page + 1)}
                className="px-4 py-2 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg hover:bg-[var(--card-border)] text-sm transition-colors"
              >
                Next →
              </a>
            )}
          </div>
        )}
      </section>

      {/* Other Boroughs */}
      <section className="border-t border-[var(--card-border)]">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">
            Other Boroughs
          </h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(BOROUGH_SLUGS)
              .filter(([s]) => s !== slug)
              .map(([s, name]) => (
                <Link
                  key={s}
                  href={`/${s}`}
                  className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg px-4 py-2 text-sm hover:border-[var(--accent)]/50 hover:text-[var(--accent)] transition-colors"
                >
                  {name}
                </Link>
              ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--card-border)] py-4">
        <div className="max-w-5xl mx-auto px-4 text-center text-[var(--muted-light)] text-xs">
          <p>
            <span className="text-[var(--muted)]">nodash</span><span className="text-[var(--accent)]">.</span>
            {" "}Order direct. Skip the cut.
          </p>
          <p className="mt-1">
            <a href="/about" className="hover:text-[var(--muted)]">About</a>
            {" · "}
            <a href="/feedback" className="hover:text-[var(--muted)]">Feedback</a>
            {" · "}
            <a href="mailto:afriedman1997@gmail.com" className="hover:text-[var(--muted)]">List your restaurant</a>
          </p>
        </div>
      </footer>
    </main>
  );
}
