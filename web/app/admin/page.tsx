"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface Submission {
  id: number;
  place_id: string;
  free_delivery: string | null;
  delivery_fee: string | null;
  delivery_minimum: string | null;
  delivery_radius: string | null;
  delivery_hours: string | null;
  comment: string | null;
  submitted_at: string;
  contributor_id: string | null;
  display_name: string | null;
  status: string;
  restaurant_name: string;
  restaurant_borough: string;
  restaurant_neighborhood: string;
}

export default function AdminPage() {
  const [key, setKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<"pending" | "merged" | "rejected">("pending");
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const fetchSubmissions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/submissions?status=${filter}&key=${encodeURIComponent(key)}`);
      if (res.status === 401) {
        setAuthed(false);
        return;
      }
      const data = await res.json();
      setSubmissions(data.submissions);
      setTotal(data.total);
      setAuthed(true);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [key, filter]);

  useEffect(() => {
    if (key) fetchSubmissions();
  }, [key, filter, fetchSubmissions]);

  const handleAction = async (id: number, action: "merge" | "reject") => {
    setActionLoading(id);
    try {
      const res = await fetch("/api/admin/submissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-key": key },
        body: JSON.stringify({ id, action }),
      });
      if (res.ok) {
        setSubmissions((prev) => prev.filter((s) => s.id !== id));
        setTotal((prev) => prev - 1);
      }
    } finally {
      setActionLoading(null);
    }
  };

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--background)" }}>
        <div className="p-6 rounded-xl max-w-sm w-full" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
          <h1 className="text-lg font-bold mb-4">🔐 Admin</h1>
          <input
            type="password"
            placeholder="Admin key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchSubmissions()}
            className="w-full px-3 py-2 rounded-lg text-sm mb-3"
            style={{ border: "1px solid var(--card-border)", background: "var(--background)" }}
          />
          <button
            onClick={fetchSubmissions}
            className="w-full text-white text-sm font-medium rounded-lg px-4 py-2"
            style={{ background: "var(--accent)" }}
          >
            Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8" style={{ background: "var(--background)" }}>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">📋 Submissions</h1>
          <Link href="/" className="text-sm hover:opacity-70" style={{ color: "var(--accent)" }}>
            ← Back to site
          </Link>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-6">
          {(["pending", "merged", "rejected"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className="px-4 py-1.5 rounded-full text-sm font-medium capitalize transition-colors"
              style={{
                background: filter === s ? "var(--accent)" : "var(--accent-light)",
                color: filter === s ? "white" : "var(--accent)",
              }}
            >
              {s}
            </button>
          ))}
          <span className="ml-auto text-sm self-center" style={{ color: "var(--muted)" }}>
            {total} total
          </span>
        </div>

        {loading ? (
          <p style={{ color: "var(--muted)" }}>Loading...</p>
        ) : submissions.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No {filter} submissions.</p>
        ) : (
          <div className="space-y-3">
            {submissions.map((s) => (
              <div
                key={s.id}
                className="p-4 rounded-xl"
                style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/restaurants/${encodeURIComponent(s.place_id)}`}
                      className="font-semibold hover:opacity-70"
                      style={{ color: "var(--accent)" }}
                    >
                      {s.restaurant_name}
                    </Link>
                    <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                      {s.restaurant_neighborhood}, {s.restaurant_borough}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                      {s.display_name || s.contributor_id?.slice(0, 8) || "anon"} · {new Date(s.submitted_at).toLocaleDateString()}
                    </div>
                  </div>
                  {filter === "pending" && (
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleAction(s.id, "merge")}
                        disabled={actionLoading === s.id}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg text-white transition-opacity hover:opacity-90"
                        style={{ background: "#22c55e" }}
                      >
                        ✓ Merge
                      </button>
                      <button
                        onClick={() => handleAction(s.id, "reject")}
                        disabled={actionLoading === s.id}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg transition-opacity hover:opacity-90"
                        style={{ background: "var(--accent-light)", color: "var(--accent)" }}
                      >
                        ✗ Reject
                      </button>
                    </div>
                  )}
                </div>

                {/* Submission data */}
                <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                  {s.free_delivery && (
                    <div className="px-2 py-1 rounded" style={{ background: "var(--accent-light)" }}>
                      <span style={{ color: "var(--muted)" }}>Free delivery:</span>{" "}
                      <span className="font-medium">{s.free_delivery}</span>
                    </div>
                  )}
                  {s.delivery_fee && (
                    <div className="px-2 py-1 rounded" style={{ background: "var(--accent-light)" }}>
                      <span style={{ color: "var(--muted)" }}>Fee:</span>{" "}
                      <span className="font-medium">{s.delivery_fee}</span>
                    </div>
                  )}
                  {s.delivery_minimum && (
                    <div className="px-2 py-1 rounded" style={{ background: "var(--accent-light)" }}>
                      <span style={{ color: "var(--muted)" }}>Minimum:</span>{" "}
                      <span className="font-medium">{s.delivery_minimum}</span>
                    </div>
                  )}
                  {s.delivery_radius && (
                    <div className="px-2 py-1 rounded" style={{ background: "var(--accent-light)" }}>
                      <span style={{ color: "var(--muted)" }}>Radius:</span>{" "}
                      <span className="font-medium">{s.delivery_radius}</span>
                    </div>
                  )}
                  {s.delivery_hours && (
                    <div className="px-2 py-1 rounded" style={{ background: "var(--accent-light)" }}>
                      <span style={{ color: "var(--muted)" }}>Hours:</span>{" "}
                      <span className="font-medium">{s.delivery_hours}</span>
                    </div>
                  )}
                </div>
                {s.comment && (
                  <p className="mt-2 text-xs italic" style={{ color: "var(--muted)" }}>
                    &ldquo;{s.comment}&rdquo;
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
