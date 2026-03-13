"use client";

import { useState, useEffect } from "react";

type Step = "collapsed" | "free_delivery" | "fee_amount" | "delivery_area" | "success" | "name_prompt";

function getContributorId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("nodash_contributor_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("nodash_contributor_id", id);
  }
  return id;
}

function getContributionCount(): number {
  if (typeof window === "undefined") return 0;
  return parseInt(localStorage.getItem("nodash_contributions") || "0", 10);
}

function incrementContributions(): number {
  const count = getContributionCount() + 1;
  localStorage.setItem("nodash_contributions", String(count));
  return count;
}

function getDisplayName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("nodash_display_name") || "";
}

function setDisplayNameStorage(name: string) {
  localStorage.setItem("nodash_display_name", name);
}

function hasSetNameBefore(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("nodash_name_prompted") === "true";
}

function markNamePrompted() {
  localStorage.setItem("nodash_name_prompted", "true");
}

export default function DeliveryInfoForm({
  placeId,
  restaurantName,
  hasDeliveryInfo,
}: {
  placeId: string;
  restaurantName: string;
  hasDeliveryInfo: boolean;
}) {
  const [step, setStep] = useState<Step>("collapsed");
  const [freeDelivery, setFreeDelivery] = useState<string | null>(null);
  const [deliveryFee, setDeliveryFee] = useState<string | null>(null);
  const [deliveryRadius, setDeliveryRadius] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [contributions, setContributions] = useState(0);
  const [error, setError] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [nameSaved, setNameSaved] = useState(false);
  const [nameError, setNameError] = useState("");

  useEffect(() => {
    setContributions(getContributionCount());
    setNameInput(getDisplayName());
  }, []);

  const totalSteps = 3;
  const currentStep =
    step === "free_delivery" ? 1 :
    step === "fee_amount" ? 2 :
    step === "delivery_area" ? 3 : 0;

  const doSubmit = async (data: Record<string, string | null>) => {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          place_id: placeId,
          contributor_id: getContributorId(),
          display_name: getDisplayName() || null,
          ...data,
        }),
      });

      if (res.status === 429) {
        setError("Whoa, slow down! Try again in a bit.");
        setSubmitting(false);
        return false;
      }
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "Something went wrong.");
        setSubmitting(false);
        return false;
      }

      const count = incrementContributions();
      setContributions(count);
      setSubmitting(false);
      return true;
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
      return false;
    }
  };

  const goToSuccessOrNamePrompt = () => {
    // Show name prompt on first submission if they haven't set a name
    if (!hasSetNameBefore() && !getDisplayName()) {
      setStep("name_prompt");
    } else {
      setStep("success");
    }
  };

  const handleFreeDelivery = async (answer: string) => {
    setFreeDelivery(answer);
    if (answer === "yes") {
      const ok = await doSubmit({ free_delivery: "yes", delivery_fee: "Free" });
      if (ok) goToSuccessOrNamePrompt();
    } else if (answer === "fee") {
      setStep("fee_amount");
    } else {
      // "not sure" — skip to delivery area
      setStep("delivery_area");
    }
  };

  const handleFeeAmount = async (fee: string | null) => {
    setDeliveryFee(fee);
    const ok = await doSubmit({ free_delivery: "no", delivery_fee: fee });
    if (ok) setStep("delivery_area");
  };

  const handleDeliveryArea = async () => {
    if (deliveryRadius.trim()) {
      const ok = await doSubmit({ delivery_radius: deliveryRadius.trim() });
      if (ok) goToSuccessOrNamePrompt();
    } else {
      goToSuccessOrNamePrompt();
    }
  };

  const handleSaveName = () => {
    const name = nameInput.trim();
    if (!name) {
      // Skip
      markNamePrompted();
      setStep("success");
      return;
    }
    if (name.length > 20) {
      setNameError("Max 20 characters");
      return;
    }
    if (!/^[a-zA-Z0-9 '.!?,-]+$/.test(name)) {
      setNameError("Letters, numbers, and basic punctuation only");
      return;
    }
    setDisplayNameStorage(name);
    markNamePrompted();
    setNameSaved(true);
    setTimeout(() => setStep("success"), 800);
  };

  const ProgressDots = () => (
    <div className="flex items-center justify-center gap-2 mb-4">
      {Array.from({ length: totalSteps }).map((_, i) => (
        <div
          key={i}
          className={`w-2 h-2 rounded-full transition-colors ${
            i < currentStep
              ? "bg-[var(--accent)]"
              : i === currentStep
              ? "bg-[var(--accent)] opacity-60"
              : "bg-[var(--card-border)]"
          }`}
        />
      ))}
    </div>
  );

  // === COLLAPSED ===
  if (step === "collapsed") {
    return (
      <div className="mt-6">
        <button
          onClick={() => setStep("free_delivery")}
          className="w-full bg-[var(--accent-light)] border border-[var(--accent)]/20 hover:border-[var(--accent)]/40 rounded-lg px-6 py-4 text-left transition-all group"
        >
          <span className="text-[var(--accent)] font-medium group-hover:opacity-80 transition-opacity">
            {hasDeliveryInfo
              ? "📝 Have an update? Help us out!"
              : "📝 Know the delivery details? Help us out!"}
          </span>
          {contributions > 0 && (
            <span className="block text-xs text-[var(--muted)] mt-1">
              🏆 You&apos;ve helped with {contributions} restaurant{contributions !== 1 ? "s" : ""}!
            </span>
          )}
        </button>
      </div>
    );
  }

  // === NAME PROMPT (after first submission) ===
  if (step === "name_prompt") {
    return (
      <div className="mt-6 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg p-6 text-center">
        <p className="text-[var(--accent)] font-semibold text-lg">Thanks! 🎉</p>
        <p className="text-[var(--muted)] text-sm mt-1 mb-4">
          Want your name on the leaderboard?
        </p>
        {nameSaved ? (
          <p className="text-[var(--accent)] font-medium">✓ Saved!</p>
        ) : (
          <>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => { setNameInput(e.target.value); setNameError(""); }}
              placeholder="Your name (max 20 chars)"
              maxLength={20}
              className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-4 py-3 text-[#1a1a1a] placeholder-[var(--muted-light)] focus:outline-none focus:border-[var(--accent)] transition-colors text-center"
            />
            {nameError && (
              <p className="text-red-500 text-xs mt-1">{nameError}</p>
            )}
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleSaveName}
                className="flex-1 min-h-[44px] bg-[var(--accent)] hover:bg-[#d14e2f] text-white font-semibold rounded-lg px-4 py-2 transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => { markNamePrompted(); setStep("success"); }}
                className="min-h-[44px] text-[var(--muted)] hover:text-[#1a1a1a] px-4 text-sm transition-colors"
              >
                Skip
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  // === SUCCESS ===
  if (step === "success") {
    return (
      <div className="mt-6 bg-[var(--accent-light)] border border-[var(--accent)]/20 rounded-lg p-6 text-center">
        <p className="text-[var(--accent)] font-semibold text-lg">Thanks! 🎉 You just helped your neighborhood.</p>
        <p className="text-[var(--muted)] text-sm mt-1">We&apos;ll review and add this info.</p>
        {contributions > 0 && (
          <p className="text-[var(--accent)] text-sm font-medium mt-3">
            🏆 You&apos;ve helped with {contributions} restaurant{contributions !== 1 ? "s" : ""}!
          </p>
        )}
        <button
          onClick={() => {
            setStep("collapsed");
            setFreeDelivery(null);
            setDeliveryFee(null);
            setDeliveryRadius("");
            setError("");
          }}
          className="mt-4 text-sm text-[var(--muted)] hover:text-[#1a1a1a] underline"
        >
          Add more details
        </button>
      </div>
    );
  }

  // === QUESTION STEPS ===
  return (
    <div className="mt-6 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg p-6 transition-all">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-base text-[#1a1a1a]">Help us out</h3>
        <button
          onClick={() => { setStep("collapsed"); setError(""); }}
          className="text-[var(--muted)] hover:text-[#1a1a1a] text-sm"
        >
          Cancel
        </button>
      </div>

      <ProgressDots />

      {error && (
        <p className="text-red-500 text-sm mb-3 text-center">{error}</p>
      )}

      {/* Step 1: Free delivery? */}
      {step === "free_delivery" && (
        <div className="space-y-3">
          <p className="text-[#1a1a1a] font-medium text-center">
            Does <span className="text-[var(--accent)]">{restaurantName}</span> offer free delivery?
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => handleFreeDelivery("yes")}
              disabled={submitting}
              className="w-full min-h-[48px] bg-[var(--accent-light)] hover:bg-[var(--accent)] hover:text-white text-[var(--accent)] font-semibold rounded-lg px-4 py-3 text-base transition-colors disabled:opacity-50"
            >
              ✅ Yes, free!
            </button>
            <button
              onClick={() => handleFreeDelivery("fee")}
              disabled={submitting}
              className="w-full min-h-[48px] bg-[var(--card-bg)] border border-[var(--card-border)] hover:border-[var(--accent)] text-[#1a1a1a] font-medium rounded-lg px-4 py-3 text-base transition-colors disabled:opacity-50"
            >
              💰 There&apos;s a fee
            </button>
            <button
              onClick={() => handleFreeDelivery("unsure")}
              disabled={submitting}
              className="w-full min-h-[48px] bg-[var(--card-bg)] border border-[var(--card-border)] hover:border-[var(--muted-light)] text-[var(--muted)] font-medium rounded-lg px-4 py-3 text-base transition-colors disabled:opacity-50"
            >
              🤷 Not sure
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Fee amount */}
      {step === "fee_amount" && (
        <div className="space-y-3">
          <p className="text-[#1a1a1a] font-medium text-center">
            About how much is the delivery fee?
          </p>
          <div className="grid grid-cols-3 gap-2">
            {["$1-2", "$3-4", "$5+"].map((fee) => (
              <button
                key={fee}
                onClick={() => handleFeeAmount(fee)}
                disabled={submitting}
                className="min-h-[48px] bg-[var(--accent-light)] hover:bg-[var(--accent)] hover:text-white text-[var(--accent)] font-semibold rounded-lg px-3 py-3 text-base transition-colors disabled:opacity-50"
              >
                {fee}
              </button>
            ))}
          </div>
          <button
            onClick={() => handleFeeAmount(null)}
            disabled={submitting}
            className="w-full min-h-[44px] text-[var(--muted)] hover:text-[#1a1a1a] text-sm transition-colors disabled:opacity-50"
          >
            Skip →
          </button>
        </div>
      )}

      {/* Step 3: Delivery area */}
      {step === "delivery_area" && (
        <div className="space-y-3">
          <p className="text-[#1a1a1a] font-medium text-center">
            Know the delivery area?
          </p>
          <input
            type="text"
            value={deliveryRadius}
            onChange={(e) => setDeliveryRadius(e.target.value)}
            placeholder="e.g. 2 miles, Park Slope, 10001"
            className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-4 py-3 text-[#1a1a1a] placeholder-[var(--muted-light)] focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
          <div className="flex gap-2">
            <button
              onClick={handleDeliveryArea}
              disabled={submitting}
              className="flex-1 min-h-[48px] bg-[var(--accent)] hover:bg-[#d14e2f] text-white font-semibold rounded-lg px-4 py-3 text-base transition-colors disabled:opacity-50"
            >
              {submitting ? "Saving..." : deliveryRadius.trim() ? "Submit" : "Done"}
            </button>
            {!deliveryRadius.trim() && (
              <button
                onClick={() => goToSuccessOrNamePrompt()}
                className="min-h-[48px] text-[var(--muted)] hover:text-[#1a1a1a] px-4 text-sm transition-colors"
              >
                Skip
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
