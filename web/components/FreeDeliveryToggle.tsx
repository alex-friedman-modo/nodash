"use client";

import { useRouter, useSearchParams } from "next/navigation";

export default function FreeDeliveryToggle({ active }: { active: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleClick = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (active) {
      params.delete("free");
    } else {
      params.set("free", "1");
    }
    params.delete("page");
    router.push(`/?${params.toString()}`);
  };

  return (
    <button
      onClick={handleClick}
      className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all"
      style={
        active
          ? {
              background: "var(--accent)",
              color: "#fff",
              borderColor: "var(--accent)",
            }
          : {
              background: "var(--card-bg)",
              color: "#1a1a1a",
              borderColor: "var(--card-border)",
            }
      }
    >
      <span>🆓</span>
      <span>Free Delivery</span>
    </button>
  );
}
