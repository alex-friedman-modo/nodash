"use client";

import { Map, List } from "lucide-react";

interface ViewToggleProps {
  view: "list" | "map";
  onToggle: (view: "list" | "map") => void;
}

export default function ViewToggle({ view, onToggle }: ViewToggleProps) {
  return (
    <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
      <button
        onClick={() => onToggle("list")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
          view === "list"
            ? "bg-zinc-800 text-white"
            : "text-zinc-500 hover:text-zinc-300"
        }`}
      >
        <List size={14} />
        List
      </button>
      <button
        onClick={() => onToggle("map")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
          view === "map"
            ? "bg-zinc-800 text-white"
            : "text-zinc-500 hover:text-zinc-300"
        }`}
      >
        <Map size={14} />
        Map
      </button>
    </div>
  );
}
