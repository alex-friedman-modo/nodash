"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useCallback } from "react";
import { Search } from "lucide-react";

export default function SearchBar({ initialSearch }: { initialSearch: string }) {
  const [query, setQuery] = useState(initialSearch);
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const params = new URLSearchParams(searchParams.toString());
      if (query) {
        params.set("search", query);
      } else {
        params.delete("search");
      }
      params.delete("page");
      router.push(`/?${params.toString()}`);
    },
    [query, router, searchParams]
  );

  return (
    <form onSubmit={handleSubmit} className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by zip code, neighborhood, or restaurant name..."
        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-10 pr-4 py-3 text-base md:text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/25"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
      />
    </form>
  );
}
