"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface ProgressData {
  overall: {
    total: number;
    verified: number;
    contributions: number;
    percentage: number;
  };
}

export default function CommunityProgress() {
  const [data, setData] = useState<ProgressData | null>(null);

  useEffect(() => {
    fetch("/api/progress")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data || data.overall.contributions === 0) return null;

  const { overall } = data;

  return (
    <div className="max-w-5xl mx-auto px-4 py-3">
      <Link
        href="/leaderboard"
        className="block rounded-lg p-3 transition-all hover:shadow-sm"
        style={{ background: "var(--accent-light)", border: "1px solid transparent" }}
      >
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-medium" style={{ color: "var(--accent)" }}>
            🏆 Community Progress
          </span>
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            {overall.contributions} contribution{overall.contributions !== 1 ? "s" : ""} · Leaderboard →
          </span>
        </div>
        <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "var(--card-border)" }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${Math.max(overall.percentage, 1)}%`, background: "var(--accent)" }}
          />
        </div>
        <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
          {overall.percentage}% of NYC delivery details verified
        </p>
      </Link>
    </div>
  );
}
