"use client";

import { useState } from "react";

type FreeDelivery = "yes" | "over_minimum" | "no" | null;

export default function DeliveryInfoForm({
  placeId,
  hasDeliveryInfo,
}: {
  placeId: string;
  hasDeliveryInfo: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [freeDelivery, setFreeDelivery] = useState<FreeDelivery>(null);
  const [deliveryFee, setDeliveryFee] = useState("");
  const [deliveryMinimum, setDeliveryMinimum] = useState("");
  const [deliveryRadius, setDeliveryRadius] = useState("");
  const [deliveryHours, setDeliveryHours] = useState("");
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error" | "ratelimit">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async () => {
    if (!freeDelivery && !deliveryRadius && !deliveryHours && !comment) {
      setErrorMsg("Please fill in at least one field.");
      setStatus("error");
      return;
    }

    setStatus("submitting");
    setErrorMsg("");

    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          place_id: placeId,
          free_delivery: freeDelivery,
          delivery_fee: freeDelivery === "no" ? deliveryFee || null : freeDelivery === "yes" ? "Free" : null,
          delivery_minimum: freeDelivery === "over_minimum" ? deliveryMinimum || null : null,
          delivery_radius: deliveryRadius || null,
          delivery_hours: deliveryHours || null,
          comment: comment || null,
        }),
      });

      if (res.status === 429) {
        setStatus("ratelimit");
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        setErrorMsg(data.error || "Something went wrong.");
        setStatus("error");
        return;
      }

      setStatus("success");
    } catch {
      setErrorMsg("Network error. Please try again.");
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <div className="mt-6 bg-green-500/10 border border-green-500/20 rounded-lg p-6 text-center">
        <p className="text-green-400 font-medium text-lg">🎉 Thanks! We&apos;ll review and add this.</p>
        <p className="text-zinc-500 text-sm mt-1">Your contribution helps everyone skip the middleman.</p>
      </div>
    );
  }

  if (status === "ratelimit") {
    return (
      <div className="mt-6 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-6 text-center">
        <p className="text-yellow-400 font-medium">Slow down! Too many submissions.</p>
        <p className="text-zinc-500 text-sm mt-1">Please try again in a bit.</p>
      </div>
    );
  }

  if (!expanded) {
    return (
      <div className="mt-6">
        <button
          onClick={() => setExpanded(true)}
          className="w-full bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-lg px-6 py-4 text-left transition-colors group"
        >
          <span className="text-zinc-300 group-hover:text-white transition-colors">
            {hasDeliveryInfo
              ? "📝 Have an update to the delivery details?"
              : "📝 Know the delivery details? Help us out!"}
          </span>
        </button>
      </div>
    );
  }

  const freeOptions: { value: FreeDelivery; label: string }[] = [
    { value: "yes", label: "Yes, always free" },
    { value: "over_minimum", label: "Free over $X" },
    { value: "no", label: "Not free" },
  ];

  return (
    <div className="mt-6 bg-zinc-900 border border-zinc-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-semibold text-lg text-white">Share Delivery Details</h3>
        <button
          onClick={() => setExpanded(false)}
          className="text-zinc-500 hover:text-zinc-300 text-sm"
        >
          Cancel
        </button>
      </div>

      {/* Free delivery toggle */}
      <div className="mb-5">
        <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-2">
          Free delivery?
        </label>
        <div className="flex flex-wrap gap-2">
          {freeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFreeDelivery(freeDelivery === opt.value ? null : opt.value)}
              className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                freeDelivery === opt.value
                  ? "bg-green-500/20 text-green-400 border border-green-500/30"
                  : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Conditional: minimum input */}
      {freeDelivery === "over_minimum" && (
        <div className="mb-5">
          <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-2">
            Minimum for free delivery
          </label>
          <input
            type="text"
            value={deliveryMinimum}
            onChange={(e) => setDeliveryMinimum(e.target.value)}
            placeholder="e.g. $15.00"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
          />
        </div>
      )}

      {/* Conditional: fee input */}
      {freeDelivery === "no" && (
        <div className="mb-5">
          <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-2">
            Delivery fee
          </label>
          <input
            type="text"
            value={deliveryFee}
            onChange={(e) => setDeliveryFee(e.target.value)}
            placeholder="e.g. $2.99"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
          />
        </div>
      )}

      {/* Delivery area */}
      <div className="mb-5">
        <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-2">
          Delivery area
        </label>
        <input
          type="text"
          value={deliveryRadius}
          onChange={(e) => setDeliveryRadius(e.target.value)}
          placeholder="e.g. 2 miles, Park Slope, 10001-10010"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
        />
      </div>

      {/* Delivery hours */}
      <div className="mb-5">
        <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-2">
          Delivery hours
        </label>
        <input
          type="text"
          value={deliveryHours}
          onChange={(e) => setDeliveryHours(e.target.value)}
          placeholder="e.g. 11am-9pm daily"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
        />
      </div>

      {/* Notes */}
      <div className="mb-5">
        <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-2">
          Notes
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Anything else helpful?"
          rows={2}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors resize-none"
        />
      </div>

      {/* Error */}
      {status === "error" && errorMsg && (
        <p className="text-red-400 text-sm mb-4">{errorMsg}</p>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={status === "submitting"}
        className="w-full bg-green-600 hover:bg-green-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-semibold rounded-lg px-6 py-3 text-lg transition-colors"
      >
        {status === "submitting" ? "Submitting..." : "Submit"}
      </button>
    </div>
  );
}
