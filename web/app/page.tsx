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
  const limit = 50;
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

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      {/* Nav */}
      <nav className="border-b border-zinc-800 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <span className="font-bold text-lg">nodash</span>
          <div className="flex items-center gap-4">
            <a href="/feedback" className="text-sm text-zinc-400 hover:text-white">Feedback</a>
            <a href="/about" className="text-sm text-zinc-400 hover:text-white">About</a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="border-b border-zinc-800 bg-zinc-950">
        <div className="max-w-5xl mx-auto px-4 py-10 md:py-14">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
            Order direct.
            <br />
            <span className="text-green-400">Skip the cut.</span>
          </h1>
          <p className="mt-4 text-lg md:text-xl text-zinc-400 max-w-2xl">
            {totalDirect.toLocaleString()} NYC restaurants that deliver without the apps.
            Your money goes to the restaurant, not a middleman.
          </p>
          <p className="mt-6 text-sm text-zinc-500">
            Search your neighborhood, zip code, or restaurant name below 👇
          </p>
        </div>
      </section>

      {/* Search + Filters */}
      <section className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur border-b border-zinc-800">
        <div className="max-w-5xl mx-auto px-4 py-4">
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
      <section className="max-w-5xl mx-auto px-4 py-6">
        <p className="text-sm text-zinc-500 mb-4">
          {total.toLocaleString()} restaurant{total !== 1 ? "s" : ""}
          {borough !== "All" ? ` in ${borough}` : ""}
          {search ? ` matching "${search}"` : ""}
        </p>

        <div className="grid gap-3">
          {restaurants.map((r) => (
            <RestaurantCard key={r.place_id} r={r} />
          ))}
        </div>

        {restaurants.length === 0 && (
          <div className="text-center py-16 text-zinc-500">
            <p className="text-lg">No restaurants found</p>
            <p className="text-sm mt-2">Try a different search or borough</p>
          </div>
        )}

        {/* Pagination */}
        {total > limit && (
          <div className="flex justify-center gap-4 mt-8">
            {page > 1 && (
              <a
                href={`/?borough=${borough}&search=${search}&cuisine=${cuisine}&page=${page - 1}`}
                className="px-4 py-2 bg-zinc-800 rounded hover:bg-zinc-700 text-sm"
              >
                ← Previous
              </a>
            )}
            <span className="px-4 py-2 text-sm text-zinc-500">
              Page {page} of {Math.ceil(total / limit)}
            </span>
            {offset + limit < total && (
              <a
                href={`/?borough=${borough}&search=${search}&cuisine=${cuisine}&page=${page + 1}`}
                className="px-4 py-2 bg-zinc-800 rounded hover:bg-zinc-700 text-sm"
              >
                Next →
              </a>
            )}
          </div>
        )}
      </section>

      {/* Why nodash — only show when no search active */}
      {!search && borough === "All" && !cuisine && (
        <section className="border-t border-zinc-800 mt-8">
          <div className="max-w-5xl mx-auto px-4 py-12">
            <h2 className="text-2xl font-bold mb-6">Why nodash?</h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
                <p className="font-semibold text-green-400 mb-2">💰 Your money gets there</p>
                <p className="text-zinc-400 text-sm">
                  Delivery apps take 15–30% per order. When you order direct, the restaurant
                  keeps what you paid.
                </p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
                <p className="font-semibold text-green-400 mb-2">📱 No app needed</p>
                <p className="text-zinc-400 text-sm">
                  Search your neighborhood. See the fee. Call or click. That&apos;s it.
                  It&apos;s a directory, not a platform.
                </p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
                <p className="font-semibold text-green-400 mb-2">✅ Every listing verified</p>
                <p className="text-zinc-400 text-sm">
                  We checked every restaurant. Confirmed direct delivery — by phone, website,
                  Toast, Slice, or however they do it.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-8">
        <div className="max-w-5xl mx-auto px-4 text-center text-zinc-500 text-sm">
          <p className="font-semibold text-zinc-400">nodash</p>
          <p className="mt-1">Order direct. Skip the cut.</p>
          <p className="mt-4">
            Run a restaurant?{" "}
            <a href="mailto:afriedman1997@gmail.com" className="text-green-400 hover:underline">
              Get listed for free
            </a>
          </p>
        </div>
      </footer>
    </main>
  );
}
