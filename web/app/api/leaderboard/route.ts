import { NextResponse } from "next/server";
import { getSubmissionsDb } from "@/lib/submissions-db";
import crypto from "crypto";

const ANIMALS = [
  "🦊 Fox", "🐻 Bear", "🦁 Lion", "🐺 Wolf", "🦅 Eagle", "🐬 Dolphin",
  "🦉 Owl", "🐙 Octopus", "🦈 Shark", "🐝 Bee", "🦦 Otter", "🐧 Penguin",
  "🦝 Raccoon", "🐢 Turtle", "🦩 Flamingo", "🐋 Whale", "🦜 Parrot",
  "🐆 Leopard", "🦫 Beaver", "🐿️ Squirrel",
];

const ADJECTIVES = [
  "Swift", "Hungry", "Bold", "Mighty", "Sneaky", "Clever", "Brave",
  "Fierce", "Lucky", "Gentle", "Wild", "Happy", "Cosmic", "Electric",
  "Turbo", "Chill", "Spicy", "Epic", "Noble", "Atomic",
];

function hashToIndex(str: string, max: number): number {
  const hash = crypto.createHash("sha256").update(str).digest();
  return hash.readUInt32BE(0) % max;
}

function generateAnimalName(identifier: string): string {
  const adj = ADJECTIVES[hashToIndex(identifier + "_adj", ADJECTIVES.length)];
  const animal = ANIMALS[hashToIndex(identifier + "_animal", ANIMALS.length)];
  return `${adj} ${animal}`;
}

export async function GET() {
  try {
    const db = getSubmissionsDb();

    const rows = db.prepare(`
      SELECT
        COALESCE(contributor_id, ip_address) as identifier,
        MAX(display_name) as display_name,
        COUNT(*) as contributions,
        COUNT(DISTINCT place_id) as restaurants,
        MAX(submitted_at) as last_active
      FROM user_submissions
      GROUP BY COALESCE(contributor_id, ip_address)
      ORDER BY contributions DESC
      LIMIT 20
    `).all() as Array<{
      identifier: string;
      display_name: string | null;
      contributions: number;
      restaurants: number;
      last_active: string;
    }>;

    const leaderboard = rows.map((row, i) => ({
      rank: i + 1,
      name: row.display_name || generateAnimalName(row.identifier),
      contributions: row.contributions,
      restaurants: row.restaurants,
      last_active: row.last_active,
    }));

    return NextResponse.json(leaderboard);
  } catch (e) {
    console.error("Leaderboard error:", e);
    return NextResponse.json([], { status: 500 });
  }
}
