import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Phone,
  Globe,
  MapPin,
  Clock,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import { mockRestaurants } from "@/lib/mock-data";
import {
  formatOrderingMethod,
  formatDeliveryFee,
} from "@/lib/types";

export function generateStaticParams() {
  return mockRestaurants.map((r) => ({ id: r.place_id }));
}

export function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  // We need to resolve the params synchronously for metadata, but Next.js
  // handles this correctly for static generation
  return params.then(({ id }) => {
    const restaurant = mockRestaurants.find((r) => r.place_id === id);
    if (!restaurant) return { title: "Not Found — nodash" };
    return {
      title: `${restaurant.name} — nodash`,
      description: restaurant.editorial_summary
        ? `${restaurant.editorial_summary} Order direct from ${restaurant.name}.`
        : `Order direct from ${restaurant.name}. ${restaurant.neighborhood}, ${restaurant.borough}.`,
    };
  });
}

export default async function RestaurantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const restaurant = mockRestaurants.find((r) => r.place_id === id);

  if (!restaurant) {
    notFound();
  }

  const feeLabel = formatDeliveryFee(restaurant.delivery_fee);
  const methodLabel = formatOrderingMethod(restaurant.ordering_method);
  const mapsQuery = encodeURIComponent(
    restaurant.address || `${restaurant.name} ${restaurant.borough} NYC`
  );

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-white/10 px-4 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link
            href="/"
            className="text-xl font-black tracking-tight hover:opacity-80 transition-opacity"
          >
            no<span className="text-green-500">dash</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          All restaurants
        </Link>

        {/* Name + badges */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
            {restaurant.name}
          </h1>
          <span className="shrink-0 rounded-full bg-green-500/15 px-3 py-1.5 text-sm font-semibold text-green-400">
            Direct Delivery &#10003;
          </span>
        </div>

        {/* Location */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-zinc-400">
          {restaurant.short_address && (
            <span className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-zinc-600" />
              {restaurant.short_address}
            </span>
          )}
          {restaurant.neighborhood && (
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs">
              {restaurant.neighborhood}
            </span>
          )}
          {restaurant.borough && (
            <span className="text-sm text-zinc-500">{restaurant.borough}</span>
          )}
        </div>

        {restaurant.editorial_summary && (
          <p className="mt-4 text-zinc-400 leading-relaxed">
            {restaurant.editorial_summary}
          </p>
        )}

        {/* Delivery info */}
        <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-4">
            Delivery Info
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {feeLabel && (
              <div className="flex items-center gap-2">
                <span className="text-zinc-500 text-sm">Fee:</span>
                <span
                  className={
                    feeLabel === "Free delivery"
                      ? "text-green-400 font-medium"
                      : "text-white"
                  }
                >
                  {feeLabel}
                </span>
              </div>
            )}
            {restaurant.delivery_minimum && (
              <div className="flex items-center gap-2">
                <span className="text-zinc-500 text-sm">Minimum:</span>
                <span className="text-white">${restaurant.delivery_minimum}</span>
              </div>
            )}
            {restaurant.delivery_radius && (
              <div className="flex items-center gap-2">
                <span className="text-zinc-500 text-sm">Radius:</span>
                <span className="text-white">{restaurant.delivery_radius}</span>
              </div>
            )}
            {restaurant.delivery_hours && (
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-zinc-500" />
                <span className="text-white">{restaurant.delivery_hours}</span>
              </div>
            )}
            {methodLabel && (
              <div className="flex items-center gap-2">
                <span className="text-zinc-500 text-sm">Order via:</span>
                <span className="rounded bg-white/10 px-2 py-0.5 text-sm text-white">
                  {methodLabel}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          {restaurant.phone && (
            <a
              href={`tel:${restaurant.phone.replace(/\D/g, "")}`}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white/10 px-6 py-4 text-lg font-bold text-white hover:bg-white/15 transition-colors"
            >
              <Phone className="h-5 w-5" />
              {restaurant.phone}
            </a>
          )}
          {restaurant.online_order_url && (
            <a
              href={restaurant.online_order_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-500 px-6 py-4 text-lg font-bold text-black hover:bg-green-400 transition-colors"
            >
              <Globe className="h-5 w-5" />
              Order Online
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>

        {/* Map link */}
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-white/10 px-6 py-3 text-sm text-zinc-400 hover:border-white/20 hover:text-white transition-colors"
        >
          <MapPin className="h-4 w-4" />
          View on Google Maps
          <ExternalLink className="h-3.5 w-3.5" />
        </a>

        {/* Rating */}
        {restaurant.rating && (
          <div className="mt-8 flex items-center gap-4 text-sm text-zinc-500">
            <span>
              <span className="text-white font-semibold">{restaurant.rating}</span> / 5
              {restaurant.review_count && (
                <> &middot; {restaurant.review_count.toLocaleString()} reviews</>
              )}
            </span>
          </div>
        )}

        {/* Feedback */}
        <div className="mt-12 rounded-xl border border-white/5 bg-white/[0.02] p-5 text-center">
          <div className="flex items-center justify-center gap-2 text-zinc-500">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">Is this info wrong?</span>
          </div>
          <a
            href={`mailto:hello@nodash.nyc?subject=Correction: ${encodeURIComponent(restaurant.name)}&body=Restaurant: ${encodeURIComponent(restaurant.name)}%0AWhat's wrong:%0A`}
            className="mt-2 inline-block text-sm text-green-500 hover:text-green-400 transition-colors"
          >
            Let us know &rarr;
          </a>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 px-4 py-8 mt-8">
        <div className="mx-auto max-w-3xl flex items-center justify-between text-sm text-zinc-600">
          <Link href="/" className="hover:text-white transition-colors">
            no<span className="text-green-500">dash</span>
          </Link>
          <a
            href="mailto:hello@nodash.nyc"
            className="hover:text-white transition-colors"
          >
            Contact
          </a>
        </div>
      </footer>
    </div>
  );
}
