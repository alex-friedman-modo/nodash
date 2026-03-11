import { getRestaurants, getBoroughCounts, getTotalDirectDelivery, getCuisineCounts } from "@/lib/db";
import SearchBar from "@/components/SearchBar";
import BoroughTabs from "@/components/BoroughTabs";
import CuisineFilter from "@/components/CuisineFilter";
import NearMeButton from "@/components/NearMeButton";
import RestaurantSection from "@/components/RestaurantSection";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ borough?: string; search?: string; cuisine?: string; page?: string; lat?: string; lng?: string }>;
}) {
  const params = await searchParams;
  const borough = params.borough || "All";
  const search = params.search || "";
  const cuisine = params.cuisine || "";
  const page = parseInt(params.page || "1");
  const lat = params.lat ? parseFloat(params.lat) : undefined;
  const lng = params.lng ? parseFloat(params.lng) : undefined;
  const limit = 24;
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
      lat,
      lng,
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

  const isFiltering = search || borough !== "All" || cuisine || lat;
  const totalPages = Math.ceil(total / limit);

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      {/* Nav — minimal */}
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

      {/* Hero — mobile-first, tight */}
      {!isFiltering && page === 1 && (
        <section className="px-4 pb-4">
          <div className="max-w-5xl mx-auto">
            <h1 className="text-2xl md:text-4xl font-bold tracking-tight leading-snug">
              Your neighborhood delivers.
              <span className="text-green-400"> Skip the apps.</span>
            </h1>
            <p className="mt-2 text-sm md:text-base text-zinc-400">
              {totalDirect.toLocaleString()} NYC restaurants with direct delivery — no DoorDash, no fees, no middleman.
            </p>
          </div>
        </section>
      )}

      {/* Search + Filters — sticky on scroll */}
      <section className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur-sm border-b border-zinc-800/50">
        <div className="max-w-5xl mx-auto px-4 py-2.5">
          {/* Search row */}
          <div className="flex gap-2">
            <div className="flex-1">
              <SearchBar initialSearch={search} />
            </div>
            <NearMeButton />
          </div>
          {/* Filter row — horizontal scroll on mobile */}
          <div className="flex items-center gap-2 mt-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4">
            <CuisineFilter cuisines={cuisinesList} activeCuisine={cuisine} />
            <div className="h-4 w-px bg-zinc-800 flex-shrink-0" />
            <BoroughTabs
              activeBoroughs={borough}
              boroughCounts={boroughCounts}
              totalCount={totalDirect}
            />
          </div>
        </div>
      </section>

      {/* Results count + clear */}
      <div className="max-w-5xl mx-auto px-4 py-2 flex items-center justify-between">
        <p className="text-xs text-zinc-500">
          {total.toLocaleString()} result{total !== 1 ? "s" : ""}
          {borough !== "All" ? ` in ${borough}` : ""}
          {search ? ` for "${search}"` : ""}
          {lat ? " near you" : ""}
        </p>
        {isFiltering && (
          <a href="/" className="text-xs text-green-400 hover:underline">Clear all</a>
        )}
      </div>

      {/* Restaurant List / Map */}
      <RestaurantSection
        restaurants={restaurants}
        total={total}
        borough={borough}
        search={search}
        cuisine={cuisine}
        cuisineLabel={cuisine ? (cuisinesList.find(c => c.cuisine === cuisine)?.label || cuisine) : ""}
        page={page}
        totalPages={totalPages}
        isFiltering={!!isFiltering}
      />

      {/* Why section — compact on mobile */}
      {!isFiltering && page === 1 && (
        <section className="border-t border-zinc-800/50 mt-4">
          <div className="max-w-5xl mx-auto px-4 py-8 md:py-12">
            <h2 className="text-lg font-bold mb-4">Why order direct?</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="flex gap-3 md:flex-col md:gap-0 bg-zinc-900/50 border border-zinc-800/50 rounded-lg p-4">
                <span className="text-2xl md:mb-2">💰</span>
                <div>
                  <p className="font-medium text-sm text-white">Restaurant keeps 100%</p>
                  <p className="text-zinc-500 text-xs mt-0.5">
                    Apps take 15–30% per order. Order direct and your money goes to the people making your food.
                  </p>
                </div>
              </div>
              <div className="flex gap-3 md:flex-col md:gap-0 bg-zinc-900/50 border border-zinc-800/50 rounded-lg p-4">
                <span className="text-2xl md:mb-2">📞</span>
                <div>
                  <p className="font-medium text-sm text-white">No app needed</p>
                  <p className="text-zinc-500 text-xs mt-0.5">
                    No sign-ups, no tracking, no surge pricing. Just a phone number and a menu.
                  </p>
                </div>
              </div>
              <div className="flex gap-3 md:flex-col md:gap-0 bg-zinc-900/50 border border-zinc-800/50 rounded-lg p-4">
                <span className="text-2xl md:mb-2">🏘️</span>
                <div>
                  <p className="font-medium text-sm text-white">Keep your block alive</p>
                  <p className="text-zinc-500 text-xs mt-0.5">
                    That corner spot is paying 30% to DoorDash. You can fix that with one phone call.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Footer — minimal */}
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
