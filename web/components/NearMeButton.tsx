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
        className="inline-flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg px-3 py-2 transition-colors disabled:opacity-50 border border-zinc-700 whitespace-nowrap"
      >
        📍 {loading ? "Locating…" : "Near me"}
      </button>
      {error && (
        <div className="absolute top-full mt-1 right-0 text-xs text-red-400 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 whitespace-nowrap z-20">
          {error}
        </div>
      )}
    </div>
  );
}
