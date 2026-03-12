"use client";

import { Map, List } from "lucide-react";

interface ViewToggleProps {
  view: "list" | "map";
  onToggle: (view: "list" | "map") => void;
}

export default function ViewToggle({ view, onToggle }: ViewToggleProps) {
  return (
    <div className="flex items-center rounded-lg p-0.5" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
      <button
        onClick={() => onToggle("list")}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all"
        style={
          view === "list"
            ? { background: "var(--accent-light)", color: "var(--accent)" }
            : { color: "var(--muted)" }
        }
      >
        <List size={14} />
        List
      </button>
      <button
        onClick={() => onToggle("map")}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all"
        style={
          view === "map"
            ? { background: "var(--accent-light)", color: "var(--accent)" }
            : { color: "var(--muted)" }
        }
      >
        <Map size={14} />
        Map
      </button>
    </div>
  );
}
