import { getRestaurant } from "@/lib/db";
import { formatCuisine, formatOrderingMethod, formatPriceLevel } from "@/lib/formatters";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Phone, Globe, MapPin, ArrowLeft, ExternalLink, Clock } from "lucide-react";
import DeliveryInfoForm from "@/components/DeliveryInfoForm";

const BOROUGH_TO_SLUG: Record<string, string> = {
  Manhattan: "manhattan",
  Brooklyn: "brooklyn",
  Queens: "queens",
  Bronx: "bronx",
  "Staten Island": "staten-island",
};

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

  // Build JSON-LD structured data
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: r.name,
    url: `https://nodash.co/restaurants/${encodeURIComponent(id)}`,
  };

  if (r.address) {
    jsonLd.address = {
      "@type": "PostalAddress",
      streetAddress: r.address,
      ...(r.borough ? { addressLocality: r.borough } : {}),
      addressRegion: "NY",
      ...(r.zip_code ? { postalCode: r.zip_code } : {}),
      addressCountry: "US",
    };
  }

  if (r.lat && r.lng) {
    jsonLd.geo = {
      "@type": "GeoCoordinates",
      latitude: r.lat,
      longitude: r.lng,
    };
  }

  if (r.phone) jsonLd.telephone = r.phone;
  if (r.photo_url) jsonLd.image = r.photo_url;
  if (cuisine) jsonLd.servesCuisine = cuisine; // cuisine = formatCuisine(r.primary_type)

  if (r.rating) {
    jsonLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: String(r.rating),
      ...(r.review_count ? { reviewCount: String(r.review_count) } : {}),
    };
  }

  if (r.online_order_url) {
    jsonLd.potentialAction = {
      "@type": "OrderAction",
      target: r.online_order_url,
    };
    jsonLd.offers = {
      "@type": "Offer",
      availableDeliveryMethod:
        "http://purl.org/goodrelations/v1#DeliveryModeDirectDownload",
      description: "Direct delivery available",
    };
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[#1a1a1a]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-[var(--muted-light)] mb-8">
          <Link href="/" className="hover:text-[#1a1a1a]">Home</Link>
          <span>/</span>
          {r.borough && BOROUGH_TO_SLUG[r.borough] ? (
            <>
              <Link
                href={`/${BOROUGH_TO_SLUG[r.borough]}`}
                className="hover:text-[#1a1a1a]"
              >
                {r.borough}
              </Link>
              <span>/</span>
            </>
          ) : null}
          <span className="text-[var(--muted)] truncate max-w-[200px]">{r.name}</span>
        </div>

        {/* Photo */}
        {r.photo_url && (
          <div className="w-full h-48 md:h-64 rounded-xl overflow-hidden bg-[var(--card-border)] mb-6">
            <img
              src={r.photo_url}
              alt={r.name}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold">{r.name}</h1>
            <p className="text-[var(--muted)] mt-1">
              {cuisine} · {r.neighborhood}, {r.borough}
            </p>
          </div>
          <span className="flex-shrink-0 inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-[var(--accent-light)] text-[var(--accent)] border border-[var(--accent)]">
            Direct Delivery ✓
          </span>
        </div>

        {/* Rating */}
        {r.rating && (
          <div className="mt-3 text-sm text-[var(--muted)]">
            ⭐ {r.rating}
            {r.review_count
              ? ` · ${r.review_count.toLocaleString()} reviews`
              : ""}
            {r.price_level && ` · ${formatPriceLevel(r.price_level)}`}
          </div>
        )}

        {/* Delivery Info */}
        <div className="mt-8 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg p-6">
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
              className="flex items-center justify-center gap-2 bg-[var(--accent)] hover:bg-[#d14e2f] text-white font-semibold rounded-lg px-6 py-3 text-lg transition-colors"
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
              className="flex items-center justify-center gap-2 bg-white border border-[var(--card-border)] text-[#1a1a1a] hover:bg-[var(--accent-light)] rounded-lg px-6 py-3 transition-colors"
            >
              <ExternalLink className="w-5 h-5" />
              Menu & Order
            </a>
          )}
          {r.delivery_menu && (
            <a
              href={r.delivery_menu}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-white border border-[var(--card-border)] text-[#1a1a1a] hover:bg-[var(--accent-light)] rounded-lg px-6 py-3 transition-colors"
            >
              📋 View Menu
            </a>
          )}
          {r.website && !r.online_order_url && (
            <a
              href={r.website}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-white border border-[var(--card-border)] text-[#1a1a1a] hover:bg-[var(--accent-light)] rounded-lg px-6 py-3 transition-colors"
            >
              <Globe className="w-5 h-5" />
              Visit Website
            </a>
          )}
        </div>

        {/* Address */}
        <div className="mt-8 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg p-6">
          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 text-[var(--muted-light)] mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-[#1a1a1a]">{r.address}</p>
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[var(--accent)] hover:underline mt-1 inline-block"
              >
                Open in Google Maps →
              </a>
            </div>
          </div>
        </div>

        {/* Summary */}
        {(r.editorial_summary || r.generative_summary) && (
          <div className="mt-6 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg p-6">
            <h2 className="font-semibold text-lg mb-2">About</h2>
            <p className="text-[var(--muted)] text-sm leading-relaxed">
              {r.editorial_summary || r.generative_summary}
            </p>
          </div>
        )}

        {/* Crowdsource Delivery Info */}
        <DeliveryInfoForm
          placeId={r.place_id}
          restaurantName={r.name}
          hasDeliveryInfo={!!(r.delivery_fee || r.delivery_minimum)}
        />

        {/* Feedback */}
        <div className="mt-8 text-center">
          <a
            href={`mailto:afriedman1997@gmail.com?subject=nodash correction: ${encodeURIComponent(
              r.name
            )}&body=Restaurant: ${encodeURIComponent(r.name)}%0AWhat's wrong:%0A`}
            className="text-sm text-[var(--muted-light)] hover:text-[#1a1a1a]"
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
      <p className="text-xs text-[var(--muted-light)] uppercase tracking-wider">{label}</p>
      <p className="text-[#1a1a1a] font-medium mt-0.5">{value}</p>
    </div>
  );
}
