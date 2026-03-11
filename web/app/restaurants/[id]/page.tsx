import { getRestaurant, formatCuisine, formatOrderingMethod } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Phone, Globe, MapPin, ArrowLeft, ExternalLink, Clock } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function RestaurantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const r = getRestaurant(decodeURIComponent(id));

  if (!r) notFound();

  const cuisine = formatCuisine(r.primary_type);
  const method = formatOrderingMethod(r.ordering_method, r.detected_platform);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    r.address
  )}`;

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Back */}
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300 mb-8"
        >
          <ArrowLeft className="w-4 h-4" /> Back to directory
        </Link>

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold">{r.name}</h1>
            <p className="text-zinc-400 mt-1">
              {cuisine} · {r.neighborhood}, {r.borough}
            </p>
          </div>
          <span className="flex-shrink-0 inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-500/10 text-green-400 border border-green-500/20">
            Direct Delivery ✓
          </span>
        </div>

        {/* Rating */}
        {r.rating && (
          <div className="mt-3 text-sm text-zinc-400">
            ⭐ {r.rating}
            {r.review_count
              ? ` · ${r.review_count.toLocaleString()} reviews`
              : ""}
            {r.price_level && ` · ${r.price_level}`}
          </div>
        )}

        {/* Delivery Info */}
        <div className="mt-8 bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          <h2 className="font-semibold text-lg mb-4">Delivery Details</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <InfoBlock
              label="Delivery Fee"
              value={
                r.delivery_fee
                  ? r.delivery_fee.toLowerCase() === "free"
                    ? "Free"
                    : r.delivery_fee
                  : "Ask when ordering"
              }
            />
            <InfoBlock
              label="Minimum Order"
              value={r.delivery_minimum || "Ask when ordering"}
            />
            <InfoBlock label="How to Order" value={method} />
            {r.delivery_radius && (
              <InfoBlock label="Delivery Area" value={r.delivery_radius} />
            )}
            {r.delivery_hours && (
              <InfoBlock label="Delivery Hours" value={r.delivery_hours} />
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          {r.phone && (
            <a
              href={`tel:${r.phone}`}
              className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-lg px-6 py-3 text-lg transition-colors"
            >
              <Phone className="w-5 h-5" />
              {r.phone}
            </a>
          )}
          {r.online_order_url && (
            <a
              href={r.online_order_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg px-6 py-3 transition-colors"
            >
              <ExternalLink className="w-5 h-5" />
              Order Online
            </a>
          )}
          {r.website && !r.online_order_url && (
            <a
              href={r.website}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg px-6 py-3 transition-colors"
            >
              <Globe className="w-5 h-5" />
              Visit Website
            </a>
          )}
        </div>

        {/* Address */}
        <div className="mt-8 bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 text-zinc-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-zinc-300">{r.address}</p>
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-green-400 hover:underline mt-1 inline-block"
              >
                Open in Google Maps →
              </a>
            </div>
          </div>
        </div>

        {/* Summary */}
        {(r.editorial_summary || r.generative_summary) && (
          <div className="mt-6 bg-zinc-900 border border-zinc-800 rounded-lg p-6">
            <h2 className="font-semibold text-lg mb-2">About</h2>
            <p className="text-zinc-400 text-sm leading-relaxed">
              {r.editorial_summary || r.generative_summary}
            </p>
          </div>
        )}

        {/* Feedback */}
        <div className="mt-8 text-center">
          <a
            href={`mailto:afriedman1997@gmail.com?subject=nodash correction: ${encodeURIComponent(
              r.name
            )}&body=Restaurant: ${encodeURIComponent(r.name)}%0AWhat's wrong:%0A`}
            className="text-sm text-zinc-500 hover:text-zinc-300"
          >
            Is this info wrong? Let us know →
          </a>
        </div>
      </div>
    </main>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-zinc-500 uppercase tracking-wider">{label}</p>
      <p className="text-white font-medium mt-0.5">{value}</p>
    </div>
  );
}
