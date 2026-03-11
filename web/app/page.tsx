"use client";

import { useState, useMemo } from "react";
import { Search, Zap, DollarSign, MapPin } from "lucide-react";
import { RestaurantCard } from "@/components/restaurant-card";
import { mockRestaurants } from "@/lib/mock-data";
import { Borough, BOROUGHS } from "@/lib/types";

export default function Home() {
  const [search, setSearch] = useState("");
  const [borough, setBorough] = useState<Borough>("All");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return mockRestaurants.filter((r) => {
      if (borough !== "All" && r.borough !== borough) return false;
      if (q) {
        return (
          r.name.toLowerCase().includes(q) ||
          (r.neighborhood?.toLowerCase().includes(q) ?? false) ||
          (r.short_address?.toLowerCase().includes(q) ?? false)
        );
      }
      return true;
    });
  }, [search, borough]);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-white/10 px-4 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <h1 className="text-xl font-black tracking-tight">
            no<span className="text-green-500">dash</span>
          </h1>
          <a
            href="mailto:hello@nodash.nyc?subject=Feedback"
            className="text-sm text-zinc-500 hover:text-white transition-colors"
          >
            Feedback
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="px-4 pt-16 pb-12">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
            Order direct.
            <br />
            <span className="text-green-500">Skip the cut.</span>
          </h2>
          <p className="mt-4 max-w-lg text-lg text-zinc-400">
            NYC restaurants that deliver without the middleman. No DoorDash fees.
            No UberEats markup. Just you and the restaurant.
          </p>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-white/10 px-4 py-5">
        <div className="mx-auto flex max-w-5xl flex-wrap gap-8 text-sm">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-green-500" />
            <span className="font-semibold text-white">3,017</span>
            <span className="text-zinc-500">restaurants verified</span>
          </div>
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-green-500" />
            <span className="text-zinc-500">No DoorDash fees</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-green-500" />
            <span className="text-zinc-500">All 5 boroughs</span>
          </div>
        </div>
      </section>

      {/* Search + Filters */}
      <section className="px-4 pt-8 pb-4">
        <div className="mx-auto max-w-5xl">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search by name or neighborhood..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/[0.05] py-3.5 pl-12 pr-4 text-white placeholder:text-zinc-600 focus:border-green-500/50 focus:outline-none focus:ring-1 focus:ring-green-500/50 transition-colors"
            />
          </div>

          {/* Borough tabs */}
          <div className="mt-4 flex gap-2 overflow-x-auto pb-2 scrollbar-none">
            {BOROUGHS.map((b) => (
              <button
                key={b}
                onClick={() => setBorough(b)}
                className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  borough === b
                    ? "bg-green-500 text-black"
                    : "bg-white/[0.05] text-zinc-400 hover:bg-white/10 hover:text-white"
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Restaurant List */}
      <section className="px-4 pb-12">
        <div className="mx-auto max-w-5xl">
          <p className="mb-4 text-sm text-zinc-500">
            {filtered.length} restaurant{filtered.length !== 1 ? "s" : ""}
            {borough !== "All" ? ` in ${borough}` : ""}
            {search ? ` matching "${search}"` : ""}
          </p>

          {filtered.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {filtered.map((r) => (
                <RestaurantCard key={r.place_id} restaurant={r} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 py-16 text-center">
              <p className="text-zinc-500">No restaurants found.</p>
              <p className="mt-1 text-sm text-zinc-600">
                Try a different search or borough.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Why nodash? */}
      <section className="border-t border-white/10 px-4 py-16">
        <div className="mx-auto max-w-5xl">
          <h3 className="text-2xl font-black">Why nodash?</h3>
          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            <div>
              <div className="text-green-500 font-bold text-lg">
                Apps take 15-30%
              </div>
              <p className="mt-1 text-sm text-zinc-400">
                DoorDash, UberEats, and Grubhub charge restaurants up to 30% per
                order. That money comes out of their pocket&mdash;or yours.
              </p>
            </div>
            <div>
              <div className="text-green-500 font-bold text-lg">
                Direct = cheaper
              </div>
              <p className="mt-1 text-sm text-zinc-400">
                Many restaurants offer lower prices, free delivery, or better
                deals when you order direct. You skip the service fees too.
              </p>
            </div>
            <div>
              <div className="text-green-500 font-bold text-lg">
                Support your spot
              </div>
              <p className="mt-1 text-sm text-zinc-400">
                When you order direct, 100% of what you pay goes to the
                restaurant. That&rsquo;s how neighborhood spots survive.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 px-4 py-8">
        <div className="mx-auto max-w-5xl flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-zinc-600">
          <div>
            no<span className="text-green-500">dash</span> &middot; NYC
            restaurant directory
          </div>
          <div className="flex gap-6">
            <a
              href="mailto:hello@nodash.nyc?subject=Add a restaurant"
              className="hover:text-white transition-colors"
            >
              Add a restaurant
            </a>
            <a
              href="mailto:hello@nodash.nyc"
              className="hover:text-white transition-colors"
            >
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
