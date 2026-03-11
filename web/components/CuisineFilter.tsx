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
      className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500/50 appearance-none cursor-pointer"
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
