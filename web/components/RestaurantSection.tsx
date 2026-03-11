"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import type { Restaurant } from "@/lib/formatters";
import RestaurantCard from "@/components/RestaurantCard";
import ViewToggle from "@/components/ViewToggle";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

interface RestaurantSectionProps {
  restaurants: Restaurant[];
  total: number;
  borough: string;
  search: string;
  cuisine: string;
  cuisineLabel: string;
  page: number;
  totalPages: number;
  isFiltering: boolean;
}

export default function RestaurantSection({
  restaurants,
  total,
  borough,
  search,
  cuisine,
  cuisineLabel,
  page,
  totalPages,
  isFiltering,
}: RestaurantSectionProps) {
  const [view, setView] = useState<"list" | "map">("list");

  const mapPinsUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (borough && borough !== "All") params.set("borough", borough);
    if (cuisine) params.set("cuisine", cuisine);
    if (search) params.set("search", search);
    const qs = params.toString();
    return `/api/map-pins${qs ? `?${qs}` : ""}`;
  }, [borough, cuisine, search]);

  return (
    <section className="max-w-5xl mx-auto px-4 py-4">
      <div className="flex items-center justify-end mb-3">
        <div className="flex items-center gap-3">
          {isFiltering && (
            <a href="/" className="text-xs text-green-400 hover:underline">
              Clear filters
            </a>
          )}
          <ViewToggle view={view} onToggle={setView} />
        </div>
      </div>

      {view === "map" ? (
        <MapView mapPinsUrl={mapPinsUrl} />
      ) : (
        <>
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
                <a href="/" className="text-green-400 hover:underline">
                  clear all filters
                </a>
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
        </>
      )}
    </section>
  );
}
