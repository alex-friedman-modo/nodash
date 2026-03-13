"use client";

import { useRouter, useSearchParams } from "next/navigation";

export default function CuisineFilter({
  cuisines,
  activeCuisine,
}: {
  cuisines: { cuisine: string; label: string; count: number }[];
  activeCuisine: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const params = new URLSearchParams(searchParams.toString());
    if (e.target.value) {
      params.set("cuisine", e.target.value);
    } else {
      params.delete("cuisine");
    }
    params.delete("page");
    router.push(`/?${params.toString()}`);
  };

  return (
    <select
      value={activeCuisine}
      onChange={handleChange}
      className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm text-[#1a1a1a] focus:outline-none focus:border-[var(--accent)] appearance-none cursor-pointer"
    >
      <option value="">All Cuisines</option>
      {cuisines.map((c) => (
        <option key={c.cuisine} value={c.cuisine}>
          {c.label} ({c.count})
        </option>
      ))}
    </select>
  );
}
