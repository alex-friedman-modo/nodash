"use client";

import { useRouter, useSearchParams } from "next/navigation";

const BOROUGHS = ["All", "Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"];

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
    <div className="flex gap-1 overflow-x-auto scrollbar-hide">
      {BOROUGHS.map((b) => {
        const isActive = activeBoroughs === b;
        return (
          <button
            key={b}
            onClick={() => handleClick(b)}
            className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs transition-colors ${
              isActive
                ? "bg-green-500/20 text-green-400"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {b === "Staten Island" ? "SI" : b}
          </button>
        );
      })}
    </div>
  );
}
