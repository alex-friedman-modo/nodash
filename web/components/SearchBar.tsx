"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useCallback } from "react";
import { Search } from "lucide-react";

export default function SearchBar({ initialSearch, basePath }: { initialSearch: string; basePath?: string }) {
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
      const base = basePath || "/";
      router.push(`${base}?${params.toString()}`);
    },
    [query, router, searchParams, basePath]
  );

  return (
    <form onSubmit={handleSubmit} className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--muted-light)" }} />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by zip code, neighborhood, or restaurant name..."
        className="w-full rounded-lg pl-10 pr-4 py-3 text-base md:text-sm focus:outline-none focus:ring-2 placeholder:opacity-50"
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          color: "var(--foreground)",
        }}
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
      />
    </form>
  );
}
