import Link from "next/link";
import { Phone, Globe, ExternalLink } from "lucide-react";
import { Restaurant, formatCuisine, formatOrderingMethod } from "@/lib/db";

export default function RestaurantCard({ r }: { r: Restaurant }) {
  const cuisine = formatCuisine(r.primary_type);
  const method = formatOrderingMethod(r.ordering_method, r.detected_platform);

  const feeDisplay = r.delivery_fee
    ? r.delivery_fee.toLowerCase() === "free"
      ? "Free delivery"
      : `${r.delivery_fee} delivery`
    : null;

  const minDisplay = r.delivery_minimum ? `${r.delivery_minimum} min` : null;

  return (
    <Link
      href={`/restaurants/${encodeURIComponent(r.place_id)}`}
      className="block bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-green-500/50 hover:bg-zinc-900/80 transition-all group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-white text-lg leading-tight group-hover:text-green-400 transition-colors truncate">
            {r.name}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-zinc-400">{r.neighborhood}</span>
            <span className="text-zinc-600">·</span>
            <span className="text-sm text-zinc-500">{cuisine}</span>
          </div>
        </div>
        <div className="flex-shrink-0">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">
            Direct ✓
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-3">
        {feeDisplay && (
          <span className="text-sm text-zinc-300 bg-zinc-800 px-2 py-0.5 rounded">
            {feeDisplay}
          </span>
        )}
        {minDisplay && (
          <span className="text-sm text-zinc-300 bg-zinc-800 px-2 py-0.5 rounded">
            {minDisplay}
          </span>
        )}
        <span className="text-sm text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">
          {method}
        </span>
      </div>

      <div className="flex items-center gap-4 mt-3 text-sm text-zinc-400">
        {r.phone && (
          <span className="flex items-center gap-1">
            <Phone className="w-3.5 h-3.5" />
            {r.phone}
          </span>
        )}
        {r.rating && (
          <span>
            ⭐ {r.rating}
            {r.review_count ? ` (${r.review_count.toLocaleString()})` : ""}
          </span>
        )}
      </div>
    </Link>
  );
}
