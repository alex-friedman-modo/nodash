import { NextRequest, NextResponse } from "next/server";
import { getSubmissionsDb } from "@/lib/submissions-db";

const BLOCKED_WORDS = [
  "nigger", "nigga", "faggot", "fag", "retard", "kike", "spic", "chink",
  "wetback", "tranny", "cunt", "twat",
];

function isProfane(name: string): boolean {
  const lower = name.toLowerCase();
  return BLOCKED_WORDS.some((w) => lower.includes(w));
}

function isValidDisplayName(name: string): boolean {
  if (name.length > 20) return false;
  if (isProfane(name)) return false;
  // Allow letters, numbers, spaces, basic punctuation
  if (!/^[a-zA-Z0-9 '.!?,-]+$/.test(name)) return false;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      place_id, free_delivery, delivery_fee, delivery_minimum,
      delivery_radius, delivery_hours, comment, contributor_id, display_name,
    } = body;

    if (!place_id || typeof place_id !== "string") {
      return NextResponse.json({ error: "place_id is required" }, { status: 400 });
    }

    if (free_delivery && !["yes", "no", "over_minimum", "fee", "unsure"].includes(free_delivery)) {
      return NextResponse.json({ error: "Invalid free_delivery value" }, { status: 400 });
    }

    // Validate display_name
    if (display_name && typeof display_name === "string") {
      if (!isValidDisplayName(display_name)) {
        return NextResponse.json({ error: "Invalid display name" }, { status: 400 });
      }
    }

    const textFields = { delivery_fee, delivery_minimum, delivery_radius, delivery_hours, comment };
    for (const [key, val] of Object.entries(textFields)) {
      if (val && typeof val === "string" && val.length > 500) {
        return NextResponse.json({ error: `${key} too long` }, { status: 400 });
      }
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
               req.headers.get("x-real-ip") ||
               "unknown";

    const db = getSubmissionsDb();

    // Rate limit: 20 per IP per hour
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19);
    const recentCount = db
      .prepare("SELECT COUNT(*) as count FROM user_submissions WHERE ip_address = ? AND submitted_at > ?")
      .get(ip, hourAgo) as { count: number };

    if (recentCount.count >= 20) {
      return NextResponse.json(
        { error: "Too many submissions. Please try again later." },
        { status: 429 }
      );
    }

    db.prepare(`
      INSERT INTO user_submissions (place_id, free_delivery, delivery_fee, delivery_minimum, delivery_radius, delivery_hours, comment, ip_address, contributor_id, display_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      place_id,
      free_delivery || null,
      delivery_fee || null,
      delivery_minimum || null,
      delivery_radius || null,
      delivery_hours || null,
      comment || null,
      ip,
      contributor_id || null,
      display_name?.trim() || null,
    );

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Submission error:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
