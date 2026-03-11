import { getRestaurants, getBoroughCounts, getTotalDirectDelivery, getCuisineCounts } from "@/lib/db";
import RestaurantCard from "@/components/RestaurantCard";
import SearchBar from "@/components/SearchBar";
import BoroughTabs from "@/components/BoroughTabs";
import CuisineFilter from "@/components/CuisineFilter";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ borough?: string; search?: string; cuisine?: string; page?: string }>;
}) {
  const params = await searchParams;
  const borough = params.borough || "All";
  const search = params.search || "";
  const cuisine = params.cuisine || "";
  const page = parseInt(params.page || "1");
  const limit = 30;
  const offset = (page - 1) * limit;

  let restaurants: Awaited<ReturnType<typeof getRestaurants>>["restaurants"] = [];
  let total = 0;
  let boroughCounts: Record<string, number> = {};
  let totalDirect = 0;
  let cuisinesList: ReturnType<typeof getCuisineCounts> = [];

  try {
    const result = getRestaurants({
      borough: borough === "All" ? undefined : borough,
      search: search || undefined,
      cuisine: cuisine || undefined,
      limit,
      offset,
    });
    restaurants = result.restaurants;
    total = result.total;
    boroughCounts = getBoroughCounts();
    totalDirect = getTotalDirectDelivery();
    cuisinesList = getCuisineCounts();
  } catch (e) {
    console.error("DB error on homepage:", e);
  }

  const isFiltering = search || borough !== "All" || cuisine;
  const totalPages = Math.ceil(total / limit);

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      {/* Nav */}
      <nav className="border-b border-zinc-800 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <a href="/" className="font-bold text-lg tracking-tight">
            nodash<span className="text-green-400">.</span>
          </a>
          <div className="flex items-center gap-4">
            <a href="/feedback" className="text-sm text-zinc-400 hover:text-white transition-colors">Feedback</a>
            <a href="/about" className="text-sm text-zinc-400 hover:text-white transition-colors">About</a>
          </div>
        </div>
      </nav>

      {/* Hero — compact, action-oriented */}
      <section className="bg-zinc-950 border-b border-zinc-800">
        <div className="max-w-5xl mx-auto px-4 pt-8 pb-6 md:pt-12 md:pb-8">
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight leading-tight">
            NYC restaurants that deliver
            <span className="text-green-400"> without the apps.</span>
          </h1>
          <p className="mt-3 text-zinc-400 max-w-xl">
            {totalDirect.toLocaleString()} verified restaurants. No DoorDash fees. No middleman.
            Search your zip code or neighborhood and order direct.
          </p>
        </div>
      </section>

      {/* Search + Filters — sticky */}
      <section className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur border-b border-zinc-800">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <SearchBar initialSearch={search} />
            </div>
            <CuisineFilter cuisines={cuisinesList} activeCuisine={cuisine} />
          </div>
          <BoroughTabs
            activeBoroughs={borough}
            boroughCounts={boroughCounts}
            totalCount={totalDirect}
          />
        </div>
      </section>

      {/* Restaurant List */}
      <section className="max-w-5xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-zinc-500">
            {total.toLocaleString()} restaurant{total !== 1 ? "s" : ""}
            {borough !== "All" ? ` in ${borough}` : ""}
            {search ? ` matching "${search}"` : ""}
            {cuisine ? ` · ${cuisinesList.find(c => c.cuisine === cuisine)?.label || cuisine}` : ""}
          </p>
          {isFiltering && (
            <a href="/" className="text-xs text-green-400 hover:underline">
              Clear filters
            </a>
          )}
        </div>

        <div className="grid gap-2">
          {restaurants.map((r) => (
            <RestaurantCard key={r.place_id} r={r} />
          ))}
        </div>

        {restaurants.length === 0 && (
          <div className="text-center py-16">
            <p className="text-xl text-zinc-400">No restaurants found</p>
            <p className="text-sm text-zinc-500 mt-2">
              Try a different zip code, neighborhood name, or{" "}
              <a href="/" className="text-green-400 hover:underline">clear all filters</a>
            </p>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-4 mt-6 mb-4">
            {page > 1 && (
              <a
                href={`/?borough=${borough}&search=${search}&cuisine=${cuisine}&page=${page - 1}`}
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
                href={`/?borough=${borough}&search=${search}&cuisine=${cuisine}&page=${page + 1}`}
                className="px-4 py-2 bg-zinc-800 rounded-lg hover:bg-zinc-700 text-sm transition-colors"
              >
                Next →
              </a>
            )}
          </div>
        )}
      </section>

      {/* Why nodash — only on default view */}
      {!isFiltering && page === 1 && (
        <section className="border-t border-zinc-800">
          <div className="max-w-5xl mx-auto px-4 py-12">
            <h2 className="text-xl font-bold mb-6">Why order direct?</h2>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
                <p className="text-2xl mb-2">💰</p>
                <p className="font-semibold text-white mb-1">Restaurant keeps 100%</p>
                <p className="text-zinc-400 text-sm">
                  Apps take 15–30% per order. When you call direct, every dollar goes to the people
                  making your food.
                </p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
                <p className="text-2xl mb-2">📞</p>
                <p className="font-semibold text-white mb-1">One call, done</p>
                <p className="text-zinc-400 text-sm">
                  No sign-ups, no tracking your data, no surge pricing. Just a phone number
                  and a menu.
                </p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
                <p className="text-2xl mb-2">🏘️</p>
                <p className="font-semibold text-white mb-1">Keep your block alive</p>
                <p className="text-zinc-400 text-sm">
                  That Thai place on the corner? They&apos;re paying 30% to DoorDash to compete with chains.
                  You can fix that with a phone call.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-6">
        <div className="max-w-5xl mx-auto px-4 text-center text-zinc-500 text-sm">
          <p>
            <span className="font-semibold text-zinc-400">nodash</span>
            <span className="text-green-400">.</span>
            {" "}Order direct. Skip the cut.
          </p>
          <p className="mt-2">
            <a href="/about" className="hover:text-zinc-300">About</a>
            {" · "}
            <a href="/feedback" className="hover:text-zinc-300">Feedback</a>
            {" · "}
            <a href="mailto:afriedman1997@gmail.com" className="hover:text-zinc-300">
              List your restaurant (free)
            </a>
          </p>
        </div>
      </footer>
    </main>
  );
}
