import Link from "next/link";
import { Phone, Globe, ArrowRight } from "lucide-react";
import { Restaurant, formatOrderingMethod, formatDeliveryFee } from "@/lib/types";

export function RestaurantCard({ restaurant }: { restaurant: Restaurant }) {
  const feeLabel = formatDeliveryFee(restaurant.delivery_fee);
  const methodLabel = formatOrderingMethod(restaurant.ordering_method);

  return (
    <Link
      href={`/restaurant/${restaurant.place_id}`}
      className="group block rounded-xl border border-white/10 bg-white/[0.03] p-5 transition-all hover:border-green-500/40 hover:bg-white/[0.06]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-bold text-white group-hover:text-green-400 transition-colors">
            {restaurant.name}
          </h3>
          {restaurant.neighborhood && (
            <span className="mt-1 inline-block rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-zinc-400">
              {restaurant.neighborhood}
            </span>
          )}
        </div>
        <span className="shrink-0 rounded-full bg-green-500/15 px-2.5 py-1 text-xs font-semibold text-green-400">
          Direct Delivery
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-400">
        {feeLabel && (
          <span className={feeLabel === "Free delivery" ? "text-green-400" : ""}>
            {feeLabel}
          </span>
        )}
        {restaurant.delivery_minimum && (
          <span>${restaurant.delivery_minimum} min</span>
        )}
        {methodLabel && (
          <span className="rounded bg-white/10 px-2 py-0.5 text-xs">
            {methodLabel}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm text-zinc-500">
          {restaurant.phone && (
            <span className="flex items-center gap-1">
              <Phone className="h-3.5 w-3.5" />
              {restaurant.phone}
            </span>
          )}
          {restaurant.online_order_url && (
            <span className="flex items-center gap-1 text-green-500">
              <Globe className="h-3.5 w-3.5" />
              Order online
            </span>
          )}
        </div>
        <ArrowRight className="h-4 w-4 text-zinc-600 transition-transform group-hover:translate-x-1 group-hover:text-green-400" />
      </div>
    </Link>
  );
}
