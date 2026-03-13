import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getDb, getRestaurants } from "@/lib/db";
import RestaurantCard from "@/components/RestaurantCard";

const CUISINE_SLUGS: Record<string, string> = {
  pizza: "Pizza",
  chinese: "Chinese",
  mexican: "Mexican",
  japanese: "Japanese",
  thai: "Thai",
  indian: "Indian",
  italian: "Italian",
  american: "American",
  halal: "Halal",
  deli: "Deli",
};

const BOROUGH_SLUGS: Record<string, string> = {
  manhattan: "Manhattan",
  brooklyn: "Brooklyn",
  queens: "Queens",
  bronx: "Bronx",
  "staten-island": "Staten Island",
};

const BOROUGH_TO_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(BOROUGH_SLUGS).map(([slug, name]) => [name, slug])
);

function getCuisineName(slug: string): string | null {
  return CUISINE_SLUGS[slug] ?? null;
}

function getBoroughBreakdown(cuisine: string): { borough: string; count: number }[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT borough, COUNT(*) AS count
       FROM restaurants
       WHERE direct_delivery = 1 AND cuisine_label = ?
       GROUP BY borough
       ORDER BY count DESC`
    )
    .all(cuisine) as { borough: string; count: number }[];
}

function getCuisineTotal(cuisine: string): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count FROM restaurants
       WHERE direct_delivery = 1 AND cuisine_label = ?`
    )
    .get(cuisine) as { count: number };
  return row.count;
}

export function generateStaticParams() {
  return Object.keys(CUISINE_SLUGS).map((cuisine) => ({ cuisine }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ cuisine: string }>;
}): Promise<Metadata> {
  const { cuisine: slug } = await params;
  const name = getCuisineName(slug);
  if (!name) return {};

  return {
    title: `${name} Restaurants in NYC That Deliver Direct | nodash`,
    description: `Find ${name} restaurants across NYC with direct delivery. No DoorDash, no Uber Eats — order straight from the restaurant. Browse by borough.`,
    openGraph: {
      title: `${name} Restaurants in NYC | nodash`,
      description: `${name} delivery without the apps. Find NYC ${name.toLowerCase()} spots that deliver direct.`,
      url: `https://nodash.co/cuisine/${slug}`,
    },
  };
}

export const dynamic = "force-dynamic";

export default async function CuisinePage({
  params,
  searchParams,
}: {
  params: Promise<{ cuisine: string }>;
  searchParams: Promise<{ page?: string; borough?: string }>;
}) {
  const { cuisine: slug } = await params;
  const cuisineName = getCuisineName(slug);
  if (!cuisineName) notFound();

  const sp = await searchParams;
  const filterBorough = sp.borough || "";
  const page = parseInt(sp.page || "1");
  const limit = 24;
  const offset = (page - 1) * limit;

  const totalAll = getCuisineTotal(cuisineName);
  const boroughBreakdown = getBoroughBreakdown(cuisineName);

  const { restaurants, total } = getRestaurants({
    cuisine: cuisineName,
    borough: filterBorough || undefined,
    limit,
    offset,
  });

  const totalPages = Math.ceil(total / limit);

  function paginationUrl(p: number) {
    const params = new URLSearchParams();
    if (filterBorough) params.set("borough", filterBorough);
    params.set("page", String(p));
    const qs = params.toString();
    return `/cuisine/${slug}${qs ? `?${qs}` : ""}`;
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[#1a1a1a]">
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
            <span className="text-[#1a1a1a]">{cuisineName}</span>
          </div>
          <h1 className="text-2xl md:text-4xl font-bold tracking-tight leading-snug">
            {cuisineName} Restaurants in NYC That Deliver Direct
            <span className="text-[var(--accent)]">.</span>
          </h1>
          <p className="mt-2 text-sm md:text-base text-[var(--muted)]">
            {totalAll.toLocaleString()} {cuisineName.toLowerCase()} restaurant{totalAll !== 1 ? "s" : ""} across NYC with direct delivery — no apps, no fees.
          </p>
        </div>
      </section>

      {/* Borough Breakdown */}
      {boroughBreakdown.length > 0 && (
        <section className="max-w-5xl mx-auto px-4 py-4">
          <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">
            {cuisineName} by Borough
          </h2>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/cuisine/${slug}`}
              className={`inline-flex items-center gap-1.5 border rounded-full px-3 py-1.5 text-sm transition-colors ${
                !filterBorough
                  ? "bg-[var(--accent-light)] border-[var(--accent)]/30 text-[var(--accent)]"
                  : "bg-[var(--card-bg)] border-[var(--card-border)] hover:border-[var(--accent)]/50 hover:text-[var(--accent)]"
              }`}
            >
              All
              <span className="text-xs opacity-60">{totalAll}</span>
            </Link>
            {boroughBreakdown.map((b) => {
              const bSlug = BOROUGH_TO_SLUG[b.borough];
              return (
                <Link
                  key={b.borough}
                  href={`/cuisine/${slug}?borough=${encodeURIComponent(b.borough)}`}
                  className={`inline-flex items-center gap-1.5 border rounded-full px-3 py-1.5 text-sm transition-colors ${
                    filterBorough === b.borough
                      ? "bg-[var(--accent-light)] border-[var(--accent)]/30 text-[var(--accent)]"
                      : "bg-[var(--card-bg)] border-[var(--card-border)] hover:border-[var(--accent)]/50 hover:text-[var(--accent)]"
                  }`}
                >
                  {b.borough}
                  <span className="text-xs opacity-60">{b.count}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Results count */}
      <div className="max-w-5xl mx-auto px-4 py-2">
        <p className="text-xs text-[var(--muted)]">
          {total.toLocaleString()} result{total !== 1 ? "s" : ""}
          {filterBorough ? ` in ${filterBorough}` : ""}
        </p>
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
              Try{" "}
              <a href={`/cuisine/${slug}`} className="text-[var(--accent)] hover:underline">
                viewing all boroughs
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

      {/* Other Cuisines */}
      <section className="border-t border-[var(--card-border)]">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wider mb-3">
            Other Cuisines
          </h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(CUISINE_SLUGS)
              .filter(([s]) => s !== slug)
              .map(([s, name]) => (
                <Link
                  key={s}
                  href={`/cuisine/${s}`}
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
