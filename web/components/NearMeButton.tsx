"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NearMeButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (!navigator.geolocation) {
      setError("Geolocation not supported");
      return;
    }

    setLoading(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        router.push(`/?lat=${latitude.toFixed(6)}&lng=${longitude.toFixed(6)}`);
        setLoading(false);
      },
      () => {
        setError("Location access denied");
        setLoading(false);
        setTimeout(() => setError(null), 3000);
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-1 text-sm rounded-lg px-3 py-2.5 transition-all disabled:opacity-50 whitespace-nowrap font-medium"
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          color: "var(--muted)",
        }}
      >
        📍 {loading ? "Locating…" : "Near me"}
      </button>
      {error && (
        <div
          className="absolute top-full mt-1 right-0 text-xs rounded px-2 py-1 whitespace-nowrap z-20"
          style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", color: "var(--accent)" }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
