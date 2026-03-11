"use client";

import { useEffect, useRef } from "react";
import type { Restaurant } from "@/lib/formatters";
import { formatCuisine } from "@/lib/formatters";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface MapViewProps {
  restaurants: Restaurant[];
}

export default function MapView({ restaurants }: MapViewProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [40.7128, -74.006],
      zoom: 11,
      zoomControl: true,
      attributionControl: false,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
      subdomains: "abcd",
    }).addTo(map);

    // Re-add attribution in a less intrusive way
    L.control.attribution({ position: "bottomright", prefix: false })
      .addAttribution('&copy; <a href="https://carto.com/">CARTO</a>')
      .addTo(map);

    mapRef.current = map;
    markersRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
    };
  }, []);

  // Update markers when restaurants change
  useEffect(() => {
    if (!mapRef.current || !markersRef.current) return;

    markersRef.current.clearLayers();

    restaurants.forEach((r) => {
      if (!r.lat || !r.lng) return;

      const marker = L.circleMarker([r.lat, r.lng], {
        radius: 6,
        fillColor: "#22c55e",
        color: "#16a34a",
        weight: 1,
        opacity: 0.9,
        fillOpacity: 0.8,
      });

      const stars = r.rating ? "⭐".repeat(Math.round(r.rating)) : "";
      const cuisine = formatCuisine(r.primary_type);
      const ratingText = r.rating ? `${r.rating}${r.review_count ? ` (${r.review_count})` : ""}` : "";

      let actionBtn = "";
      if (r.online_order_url) {
        actionBtn = `<a href="${r.online_order_url}" target="_blank" rel="noopener" class="map-popup-btn order">Order Online</a>`;
      } else if (r.phone) {
        actionBtn = `<a href="tel:${r.phone}" class="map-popup-btn call">Call ${r.phone}</a>`;
      }

      marker.bindPopup(
        `<div class="map-popup">
          <strong>${r.name}</strong>
          <div class="map-popup-meta">${cuisine}${ratingText ? ` · ${ratingText}` : ""}</div>
          ${stars ? `<div class="map-popup-stars">${stars}</div>` : ""}
          <div class="map-popup-addr">${r.short_address || r.address}</div>
          ${actionBtn}
        </div>`,
        { className: "dark-popup", maxWidth: 250 }
      );

      marker.addTo(markersRef.current!);
    });

    // Fit bounds if we have restaurants with coordinates
    const validRestaurants = restaurants.filter((r) => r.lat && r.lng);
    if (validRestaurants.length > 0) {
      const bounds = L.latLngBounds(validRestaurants.map((r) => [r.lat, r.lng]));
      mapRef.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
    }
  }, [restaurants]);

  return (
    <>
      <style jsx global>{`
        .dark-popup .leaflet-popup-content-wrapper {
          background: #18181b;
          color: #fff;
          border: 1px solid #3f3f46;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
        }
        .dark-popup .leaflet-popup-tip {
          background: #18181b;
          border: 1px solid #3f3f46;
        }
        .dark-popup .leaflet-popup-close-button {
          color: #a1a1aa;
        }
        .dark-popup .leaflet-popup-close-button:hover {
          color: #fff;
        }
        .map-popup strong {
          font-size: 14px;
          display: block;
          margin-bottom: 2px;
        }
        .map-popup-meta {
          font-size: 12px;
          color: #a1a1aa;
          margin-bottom: 2px;
        }
        .map-popup-stars {
          font-size: 11px;
          margin-bottom: 2px;
        }
        .map-popup-addr {
          font-size: 11px;
          color: #71717a;
          margin-bottom: 6px;
        }
        .map-popup-btn {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          text-decoration: none;
          transition: opacity 0.15s;
        }
        .map-popup-btn:hover {
          opacity: 0.85;
        }
        .map-popup-btn.order {
          background: #22c55e;
          color: #000;
        }
        .map-popup-btn.call {
          background: #3f3f46;
          color: #fff;
        }
      `}</style>
      <div
        ref={containerRef}
        className="w-full h-[400px] md:h-[500px] rounded-lg border border-zinc-800 overflow-hidden"
      />
    </>
  );
}
