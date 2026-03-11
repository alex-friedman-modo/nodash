"use client";

import { useRouter, useSearchParams } from "next/navigation";

const BOROUGHS = ["All", "Brooklyn", "Manhattan", "Queens", "Bronx", "Staten Island"];

export default function BoroughTabs({
  activeBoroughs,
  boroughCounts,
  totalCount,
}: {
  activeBoroughs: string;
  boroughCounts: Record<string, number>;
  totalCount: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleClick = (borough: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (borough === "All") {
      params.delete("borough");
    } else {
      params.set("borough", borough);
    }
    params.delete("page");
    router.push(`/?${params.toString()}`);
  };

  return (
    <div className="flex gap-1 mt-3 overflow-x-auto pb-1 scrollbar-hide">
      {BOROUGHS.map((b) => {
        const count = b === "All" ? totalCount : boroughCounts[b] || 0;
        const isActive = activeBoroughs === b;
        return (
          <button
            key={b}
            onClick={() => handleClick(b)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm transition-colors ${
              isActive
                ? "bg-green-500/20 text-green-400 border border-green-500/30"
                : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-zinc-600"
            }`}
          >
            {b}{" "}
            <span className={isActive ? "text-green-500/70" : "text-zinc-600"}>
              {count.toLocaleString()}
            </span>
          </button>
        );
      })}
    </div>
  );
}
