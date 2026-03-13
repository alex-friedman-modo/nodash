"use client";

import Link from "next/link";
import { ArrowLeft, Send } from "lucide-react";
import { useState } from "react";

export default function FeedbackPage() {
  const [submitted, setSubmitted] = useState(false);
  const [type, setType] = useState("correction");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);

    // mailto fallback — simple and works without backend
    const subject = `nodash feedback: ${data.get("type")}`;
    const body = [
      `Type: ${data.get("type")}`,
      `Restaurant: ${data.get("restaurant") || "N/A"}`,
      `Message: ${data.get("message")}`,
      `From: ${data.get("email") || "anonymous"}`,
    ].join("\n\n");

    window.location.href = `mailto:afriedman1997@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <main className="min-h-screen bg-[var(--background)] text-[#1a1a1a] flex items-center justify-center">
        <div className="text-center">
          <p className="text-2xl font-bold text-[var(--accent)]">Thanks! 🙏</p>
          <p className="text-[var(--muted)] mt-2">We&apos;ll look into it.</p>
          <Link href="/" className="text-sm text-[var(--accent)] hover:underline mt-4 inline-block">
            ← Back to directory
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[#1a1a1a]">
      <div className="max-w-xl mx-auto px-4 py-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[#1a1a1a] mb-8"
        >
          <ArrowLeft className="w-4 h-4" /> Back to directory
        </Link>

        <h1 className="text-3xl font-bold mb-2">Tell us what&apos;s up</h1>
        <p className="text-[var(--muted)] mb-8">
          Wrong info? Missing restaurant? Feature request? We&apos;re all ears.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-[var(--muted)] mb-1">What kind of feedback?</label>
            <select
              name="type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-[#1a1a1a] focus:outline-none focus:border-[var(--accent)]"
            >
              <option value="correction">Wrong delivery info</option>
              <option value="missing">Add a restaurant</option>
              <option value="closed">Restaurant is closed</option>
              <option value="no-delivery">Restaurant doesn&apos;t actually deliver</option>
              <option value="feature">Feature request</option>
              <option value="other">Other</option>
            </select>
          </div>

          {(type === "correction" || type === "missing" || type === "closed" || type === "no-delivery") && (
            <div>
              <label className="block text-sm text-[var(--muted)] mb-1">Restaurant name</label>
              <input
                name="restaurant"
                type="text"
                placeholder="e.g. Joe's Pizza"
                className="w-full bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-[#1a1a1a] placeholder:text-[var(--muted-light)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
          )}

          <div>
            <label className="block text-sm text-[var(--muted)] mb-1">Details</label>
            <textarea
              name="message"
              rows={4}
              required
              placeholder="What should we know?"
              className="w-full bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-[#1a1a1a] placeholder:text-[var(--muted-light)] focus:outline-none focus:border-[var(--accent)] resize-none"
            />
          </div>

          <div>
            <label className="block text-sm text-[var(--muted)] mb-1">
              Your email (optional — if you want a reply)
            </label>
            <input
              name="email"
              type="email"
              placeholder="you@example.com"
              className="w-full bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-[#1a1a1a] placeholder:text-[var(--muted-light)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          <button
            type="submit"
            className="inline-flex items-center gap-2 bg-[var(--accent)] hover:bg-[#d14e2f] text-white font-semibold rounded-lg px-6 py-3 transition-colors"
          >
            <Send className="w-4 h-4" />
            Send Feedback
          </button>
        </form>
      </div>
    </main>
  );
}
