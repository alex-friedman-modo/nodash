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
      <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-2xl font-bold text-green-400">Thanks! 🙏</p>
          <p className="text-zinc-400 mt-2">We&apos;ll look into it.</p>
          <Link href="/" className="text-sm text-green-400 hover:underline mt-4 inline-block">
            ← Back to directory
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-xl mx-auto px-4 py-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300 mb-8"
        >
          <ArrowLeft className="w-4 h-4" /> Back to directory
        </Link>

        <h1 className="text-3xl font-bold mb-2">Tell us what&apos;s up</h1>
        <p className="text-zinc-400 mb-8">
          Wrong info? Missing restaurant? Feature request? We&apos;re all ears.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">What kind of feedback?</label>
            <select
              name="type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-green-500/50"
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
              <label className="block text-sm text-zinc-400 mb-1">Restaurant name</label>
              <input
                name="restaurant"
                type="text"
                placeholder="e.g. Joe's Pizza"
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder:text-zinc-600 focus:outline-none focus:border-green-500/50"
              />
            </div>
          )}

          <div>
            <label className="block text-sm text-zinc-400 mb-1">Details</label>
            <textarea
              name="message"
              rows={4}
              required
              placeholder="What should we know?"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder:text-zinc-600 focus:outline-none focus:border-green-500/50 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">
              Your email (optional — if you want a reply)
            </label>
            <input
              name="email"
              type="email"
              placeholder="you@example.com"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder:text-zinc-600 focus:outline-none focus:border-green-500/50"
            />
          </div>

          <button
            type="submit"
            className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-lg px-6 py-3 transition-colors"
          >
            <Send className="w-4 h-4" />
            Send Feedback
          </button>
        </form>
      </div>
    </main>
  );
}
