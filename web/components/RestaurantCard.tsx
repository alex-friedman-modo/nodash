"use client";

import Link from "next/link";
import { Phone, ExternalLink } from "lucide-react";
import { type Restaurant, formatCuisine, formatOrderingMethod } from "@/lib/formatters";

export default function RestaurantCard({ r }: { r: Restaurant }) {
  const cuisine = formatCuisine(r.primary_type);
  const method = formatOrderingMethod(r.ordering_method, r.detected_platform);
  const description = r.editorial_summary || r.generative_summary || null;
  const truncatedDesc = description
    ? description.length > 70
      ? description.slice(0, 70).trimEnd() + "…"
      : description
    : null;

  return (
    <div
      className="rounded-xl hover:shadow-md transition-all group"
      style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
    >
      <div className="flex">
        {/* Photo */}
        {r.photo_url && (
          <Link
            href={`/restaurants/${encodeURIComponent(r.place_id)}`}
            className="flex-shrink-0 w-24 h-full min-h-[100px] md:w-28 rounded-l-xl overflow-hidden"
            style={{ background: "var(--card-border)" }}
          >
            <img
              src={r.photo_url}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </Link>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0 p-3">
          <Link href={`/restaurants/${encodeURIComponent(r.place_id)}`} className="block">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold leading-tight line-clamp-1 group-hover:opacity-70 transition-opacity">
                {r.name}
              </h3>
              {r.review_count && r.review_count >= 500 && (
                <span
                  className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded-full"
                  style={{ background: "var(--accent-light)", color: "var(--accent)" }}
                >
                  🔥
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
              <span>{cuisine}</span>
              <span>·</span>
              <span>{r.neighborhood}</span>
              {r.rating && (
                <>
                  <span>·</span>
                  <span>⭐ {r.rating}</span>
                </>
              )}
            </div>
            {truncatedDesc && (
              <p className="text-xs mt-1 line-clamp-1" style={{ color: "var(--muted)" }}>{truncatedDesc}</p>
            )}
          </Link>

          {/* CTAs */}
          <div className="flex items-center gap-2 mt-2">
            {r.online_order_url ? (
              <a
                href={r.online_order_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-white text-xs font-medium rounded-lg px-3 py-1.5 transition-opacity hover:opacity-90"
                style={{ background: "var(--accent)" }}
              >
                <ExternalLink className="w-3 h-3" />
                Order Online
              </a>
            ) : (
              <span className="text-xs px-2 py-1 rounded-lg" style={{ background: "var(--accent-light)", color: "var(--muted)" }}>
                {method}
              </span>
            )}
            {r.phone && (
              <a
                href={`tel:${r.phone}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-xs transition-opacity hover:opacity-70"
                style={{ color: "var(--muted)" }}
              >
                <Phone className="w-3 h-3" />
                <span className="hidden sm:inline">{r.phone}</span>
                <span className="sm:hidden">Call</span>
              </a>
            )}
            {r.delivery_fee && r.delivery_fee.toLowerCase() === "free" && (
              <span className="text-xs" style={{ color: "var(--accent)" }}>Free delivery</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
