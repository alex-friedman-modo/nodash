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
      url: `https://nodash.nyc/${slug}`,
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

  function paginationUrl(p: number) {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (cuisine) params.set("cuisine", cuisine);
    params.set("page", String(p));
    const qs = params.toString();
    return `/${slug}${qs ? `?${qs}` : ""}`;
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      {/* Nav */}
      <nav className="px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <a href="/" className="font-bold text-xl tracking-tight">
            nodash<span className="text-green-400">.</span>
          </a>
          <div className="flex items-center gap-4 text-sm">
            <a href="/feedback" className="text-zinc-500 hover:text-white transition-colors">Feedback</a>
            <a href="/about" className="text-zinc-500 hover:text-white transition-colors">About</a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-4 pb-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-2 text-sm text-zinc-500 mb-2">
            <Link href="/" className="hover:text-zinc-300">Home</Link>
            <span>/</span>
            <span className="text-zinc-300">{boroughName}</span>
          </div>
          <h1 className="text-2xl md:text-4xl font-bold tracking-tight leading-snug">
            {boroughName} Restaurants That Deliver Direct
            <span className="text-green-400">.</span>
          </h1>
          <p className="mt-2 text-sm md:text-base text-zinc-400">
            {total.toLocaleString()} restaurant{total !== 1 ? "s" : ""} in {boroughName} with direct delivery — no apps, no fees, no middleman.
          </p>
        </div>
      </section>

      {/* Search */}
      <section className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur-sm border-b border-zinc-800/50">
        <div className="max-w-5xl mx-auto px-4 py-2.5">
          <SearchBar initialSearch={search} />
        </div>
      </section>

      {/* Top Cuisines */}
      {topCuisines.length > 0 && !isFiltering && (
        <section className="max-w-5xl mx-auto px-4 py-4">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            Popular in {boroughName}
          </h2>
          <div className="flex flex-wrap gap-2">
            {topCuisines.map((c) => {
              const cuisineSlug = CUISINE_TO_SLUG[c.cuisine];
              return (
                <Link
                  key={c.cuisine}
                  href={cuisineSlug ? `/cuisine/${cuisineSlug}` : `/${slug}?cuisine=${encodeURIComponent(c.cuisine)}`}
                  className="inline-flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-full px-3 py-1.5 text-sm hover:border-green-500/50 hover:text-green-400 transition-colors"
                >
                  {c.cuisine}
                  <span className="text-zinc-600 text-xs">{c.count}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Results count */}
      <div className="max-w-5xl mx-auto px-4 py-2 flex items-center justify-between">
        <p className="text-xs text-zinc-500">
          {total.toLocaleString()} result{total !== 1 ? "s" : ""}
          {cuisine ? ` · ${cuisine}` : ""}
          {search ? ` · "${search}"` : ""}
        </p>
        {isFiltering && (
          <a href={`/${slug}`} className="text-xs text-green-400 hover:underline">Clear filters</a>
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
            <p className="text-xl text-zinc-400">No restaurants found</p>
            <p className="text-sm text-zinc-500 mt-2">
              Try a different search or{" "}
              <a href={`/${slug}`} className="text-green-400 hover:underline">
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
                className="px-4 py-2 bg-zinc-800 rounded-lg hover:bg-zinc-700 text-sm transition-colors"
              >
                ← Previous
              </a>
            )}
            <span className="px-4 py-2 text-sm text-zinc-500">
              {page} / {totalPages}
            </span>
            {page < totalPages && (
              <a
                href={paginationUrl(page + 1)}
                className="px-4 py-2 bg-zinc-800 rounded-lg hover:bg-zinc-700 text-sm transition-colors"
              >
                Next →
              </a>
            )}
          </div>
        )}
      </section>

      {/* Other Boroughs */}
      <section className="border-t border-zinc-800/50">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            Other Boroughs
          </h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(BOROUGH_SLUGS)
              .filter(([s]) => s !== slug)
              .map(([s, name]) => (
                <Link
                  key={s}
                  href={`/${s}`}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm hover:border-green-500/50 hover:text-green-400 transition-colors"
                >
                  {name}
                </Link>
              ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800/50 py-4">
        <div className="max-w-5xl mx-auto px-4 text-center text-zinc-600 text-xs">
          <p>
            <span className="text-zinc-500">nodash</span><span className="text-green-400">.</span>
            {" "}Order direct. Skip the cut.
          </p>
          <p className="mt-1">
            <a href="/about" className="hover:text-zinc-400">About</a>
            {" · "}
            <a href="/feedback" className="hover:text-zinc-400">Feedback</a>
            {" · "}
            <a href="mailto:afriedman1997@gmail.com" className="hover:text-zinc-400">List your restaurant</a>
          </p>
        </div>
      </footer>
    </main>
  );
}
