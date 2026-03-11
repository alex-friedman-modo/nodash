"use client";

import { useEffect, useRef, useState } from "react";
import { formatCuisine } from "@/lib/formatters";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";

interface MapPin {
  place_id: string;
  name: string;
  lat: number;
  lng: number;
  primary_type: string | null;
  rating: number | null;
  review_count: number | null;
  phone: string | null;
  online_order_url: string | null;
  photo_url: string | null;
  neighborhood: string | null;
}

interface MapViewProps {
  mapPinsUrl: string;
}

export default function MapView({ mapPinsUrl }: MapViewProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [pinCount, setPinCount] = useState(0);

  // Initialize map once
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

    L.control.attribution({ position: "bottomright", prefix: false })
      .addAttribution('&copy; <a href="https://carto.com/">CARTO</a>')
      .addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      clusterRef.current = null;
    };
  }, []);

  // Fetch pins and update markers when URL changes
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    // Remove old cluster group
    if (clusterRef.current) {
      map.removeLayer(clusterRef.current);
      clusterRef.current = null;
    }

    setLoading(true);

    const controller = new AbortController();

    fetch(mapPinsUrl, { signal: controller.signal })
      .then((res) => res.json())
      .then((data: { pins: MapPin[] }) => {
        if (controller.signal.aborted) return;

        const pins = data.pins.filter((p) => p.lat && p.lng);
        setPinCount(pins.length);

        const cluster = L.markerClusterGroup({
          chunkedLoading: true,
          maxClusterRadius: 60,
          spiderfyOnMaxZoom: true,
          showCoverageOnHover: false,
          iconCreateFunction: (c) => {
            const count = c.getChildCount();
            let size = "small";
            if (count >= 100) size = "large";
            else if (count >= 30) size = "medium";
            return L.divIcon({
              html: `<div><span>${count}</span></div>`,
              className: `marker-cluster marker-cluster-${size}`,
              iconSize: L.point(40, 40),
            });
          },
        });

        pins.forEach((pin) => {
          const marker = L.circleMarker([pin.lat, pin.lng], {
            radius: 6,
            fillColor: "#22c55e",
            color: "#16a34a",
            weight: 1,
            opacity: 0.9,
            fillOpacity: 0.8,
          });

          const cuisine = formatCuisine(pin.primary_type);
          const ratingText = pin.rating
            ? `${pin.rating}${pin.review_count ? ` (${pin.review_count})` : ""}`
            : "";

          const photoHtml = pin.photo_url
            ? `<img src="${pin.photo_url}" style="width:100%;height:80px;object-fit:cover;border-radius:4px;margin-bottom:4px" loading="lazy" alt="" />`
            : "";

          let actionBtn = "";
          if (pin.online_order_url) {
            actionBtn = `<a href="${pin.online_order_url}" target="_blank" rel="noopener" class="map-popup-btn order">Order Online</a>`;
          } else if (pin.phone) {
            actionBtn = `<a href="tel:${pin.phone}" class="map-popup-btn call">Call ${pin.phone}</a>`;
          }

          marker.bindPopup(
            `<div class="map-popup">
              ${photoHtml}
              <a href="/restaurants/${pin.place_id}" class="map-popup-name"><strong>${pin.name}</strong></a>
              <div class="map-popup-meta">${cuisine}${ratingText ? ` · ${ratingText}` : ""}</div>
              ${pin.neighborhood ? `<div class="map-popup-addr">${pin.neighborhood}</div>` : ""}
              ${actionBtn}
            </div>`,
            { className: "dark-popup", maxWidth: 260 }
          );

          cluster.addLayer(marker);
        });

        map.addLayer(cluster);
        clusterRef.current = cluster;

        if (pins.length > 0) {
          const bounds = L.latLngBounds(pins.map((p) => [p.lat, p.lng]));
          map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
        }

        setLoading(false);
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          console.error("Failed to fetch map pins:", err);
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [mapPinsUrl]);

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
        .map-popup-name {
          color: #fff;
          text-decoration: none;
        }
        .map-popup-name:hover {
          color: #22c55e;
          text-decoration: underline;
        }
        .map-popup-meta {
          font-size: 12px;
          color: #a1a1aa;
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
        .marker-cluster-small div,
        .marker-cluster-medium div,
        .marker-cluster-large div {
          background: #22c55e;
          color: #000;
          border-radius: 50%;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 13px;
        }
        .marker-cluster-small {
          background: rgba(34, 197, 94, 0.3);
          border-radius: 50%;
        }
        .marker-cluster-medium {
          background: rgba(34, 197, 94, 0.35);
          border-radius: 50%;
        }
        .marker-cluster-large {
          background: rgba(34, 197, 94, 0.4);
          border-radius: 50%;
        }
        .marker-cluster {
          background-clip: padding-box;
        }
      `}</style>
      <div className="relative">
        {loading && (
          <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-zinc-900/70 rounded-lg">
            <div className="flex items-center gap-2 text-zinc-400">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm">Loading map pins…</span>
            </div>
          </div>
        )}
        {!loading && pinCount > 0 && (
          <div className="absolute top-2 right-2 z-[1000] bg-zinc-900/80 text-zinc-400 text-xs px-2 py-1 rounded">
            {pinCount.toLocaleString()} restaurants
          </div>
        )}
        <div
          ref={containerRef}
          className="w-full h-[60vh] md:h-[500px] rounded-lg border border-zinc-800 overflow-hidden"
        />
      </div>
    </>
  );
}
