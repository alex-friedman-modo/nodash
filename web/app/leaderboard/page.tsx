import Link from "next/link";

export const dynamic = "force-dynamic";

interface LeaderboardEntry {
  rank: number;
  name: string;
  contributions: number;
  restaurants: number;
  last_active: string;
}

interface ProgressData {
  boroughs: Array<{
    borough: string;
    total: number;
    verified: number;
    percentage: number;
  }>;
  overall: {
    total: number;
    verified: number;
    contributions: number;
    percentage: number;
    neighborhoods: number;
  };
}

async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : "http://localhost:3000";

    // Use internal fetch for server component
    const { getSubmissionsDb } = await import("@/lib/submissions-db");
    const crypto = await import("crypto");

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

    return rows.map((row, i) => ({
      rank: i + 1,
      name: row.display_name || `${ADJECTIVES[hashToIndex(row.identifier + "_adj", ADJECTIVES.length)]} ${ANIMALS[hashToIndex(row.identifier + "_animal", ANIMALS.length)]}`,
      contributions: row.contributions,
      restaurants: row.restaurants,
      last_active: row.last_active,
    }));
  } catch (e) {
    console.error("Leaderboard fetch error:", e);
    return [];
  }
}

async function getProgress(): Promise<ProgressData> {
  try {
    const { getDb } = await import("@/lib/db");
    const { getSubmissionsDb } = await import("@/lib/submissions-db");

    const db = getDb();
    const subDb = getSubmissionsDb();

    const boroughTotals = db.prepare(`
      SELECT borough, COUNT(*) as total
      FROM restaurants WHERE direct_delivery = 1 AND borough IS NOT NULL
      GROUP BY borough
    `).all() as Array<{ borough: string; total: number }>;

    const verifiedInDb = db.prepare(`
      SELECT borough, COUNT(*) as verified
      FROM restaurants WHERE direct_delivery = 1 AND borough IS NOT NULL
        AND delivery_fee IS NOT NULL AND delivery_fee != ''
      GROUP BY borough
    `).all() as Array<{ borough: string; verified: number }>;

    const submittedPlaceIds = subDb.prepare(`SELECT DISTINCT place_id FROM user_submissions`).all() as Array<{ place_id: string }>;
    const submittedSet = new Set(submittedPlaceIds.map((r) => r.place_id));

    const submittedByBorough: Record<string, number> = {};
    if (submittedSet.size > 0) {
      const placeholders = [...submittedSet].map(() => "?").join(",");
      const rows = db.prepare(
        `SELECT borough, COUNT(DISTINCT place_id) as cnt FROM restaurants WHERE place_id IN (${placeholders}) AND borough IS NOT NULL GROUP BY borough`
      ).all(...submittedSet) as Array<{ borough: string; cnt: number }>;
      for (const row of rows) submittedByBorough[row.borough] = row.cnt;
    }

    const verifiedMap: Record<string, number> = {};
    for (const row of verifiedInDb) verifiedMap[row.borough] = row.verified;

    const boroughs = boroughTotals.map((b) => {
      const dbVerified = verifiedMap[b.borough] || 0;
      const userSubmitted = submittedByBorough[b.borough] || 0;
      const verified = Math.min(b.total, dbVerified + userSubmitted);
      const percentage = b.total > 0 ? Math.round((verified / b.total) * 100) : 0;
      return { borough: b.borough, total: b.total, verified, percentage };
    }).sort((a, b) => b.total - a.total);

    const totalR = boroughTotals.reduce((s, b) => s + b.total, 0);
    const totalV = boroughs.reduce((s, b) => s + b.verified, 0);
    const totalC = (subDb.prepare("SELECT COUNT(*) as cnt FROM user_submissions").get() as { cnt: number }).cnt;

    return {
      boroughs,
      overall: {
        total: totalR,
        verified: totalV,
        contributions: totalC,
        percentage: totalR > 0 ? Math.round((totalV / totalR) * 100) : 0,
        neighborhoods: boroughs.length,
      },
    };
  } catch (e) {
    console.error("Progress fetch error:", e);
    return { boroughs: [], overall: { total: 0, verified: 0, contributions: 0, percentage: 0, neighborhoods: 0 } };
  }
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr + "Z").getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const RANK_STYLES = [
  "text-2xl", // 1st
  "text-xl",  // 2nd
  "text-lg",  // 3rd
];

export default async function LeaderboardPage() {
  const [leaderboard, progress] = await Promise.all([getLeaderboard(), getProgress()]);

  return (
    <main className="min-h-screen bg-[var(--background)] text-[#1a1a1a]">
      {/* Nav */}
      <nav className="px-4 py-3 border-b border-[var(--card-border)]">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="font-bold text-xl tracking-tight">
            nodash<span className="text-[var(--accent)]">.</span>
          </Link>
          <Link href="/" className="text-sm text-[var(--muted)] hover:text-[#1a1a1a]">
            ← Back to restaurants
          </Link>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <h1 className="text-3xl md:text-4xl font-bold">🏆 Community Leaderboard</h1>
        <p className="text-[var(--muted)] mt-2">
          These heroes are helping NYC skip the middleman
        </p>

        {/* Overall stats */}
        <div className="mt-6 grid grid-cols-3 gap-3">
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-[var(--accent)]">{progress.overall.contributions}</p>
            <p className="text-xs text-[var(--muted)] mt-1">contributions</p>
          </div>
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-[var(--accent)]">{progress.overall.verified.toLocaleString()}</p>
            <p className="text-xs text-[var(--muted)] mt-1">verified</p>
          </div>
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-[var(--accent)]">{progress.overall.neighborhoods}</p>
            <p className="text-xs text-[var(--muted)] mt-1">boroughs</p>
          </div>
        </div>

        {/* Leaderboard */}
        <div className="mt-8">
          <h2 className="font-semibold text-lg mb-4">Top Contributors</h2>
          {leaderboard.length === 0 ? (
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg p-8 text-center">
              <p className="text-[var(--muted)] text-lg">No contributions yet!</p>
              <p className="text-[var(--muted-light)] text-sm mt-1">
                Be the first — visit any restaurant and share what you know.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {leaderboard.map((entry) => (
                <div
                  key={entry.rank}
                  className={`bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg px-4 py-3 flex items-center gap-3 ${
                    entry.rank <= 3 ? "border-[var(--accent)]/20" : ""
                  }`}
                >
                  <span className={`font-bold w-8 text-center flex-shrink-0 ${
                    entry.rank === 1 ? "text-2xl" : entry.rank === 2 ? "text-xl" : entry.rank === 3 ? "text-lg" : "text-[var(--muted)]"
                  }`}>
                    {entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : `#${entry.rank}`}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium truncate ${entry.rank <= 3 ? "text-[#1a1a1a]" : "text-[var(--muted)]"}`}>
                      {entry.name}
                    </p>
                    <p className="text-xs text-[var(--muted-light)]">
                      {entry.restaurants} restaurant{entry.restaurants !== 1 ? "s" : ""} · {timeAgo(entry.last_active)}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-[var(--accent)] font-bold">{entry.contributions}</span>
                    <span className="text-xs text-[var(--muted-light)] ml-1">contrib.</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Borough progress */}
        <div className="mt-8">
          <h2 className="font-semibold text-lg mb-4">Neighborhood Progress</h2>
          <div className="space-y-3">
            {progress.boroughs.map((b) => (
              <div key={b.borough} className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{b.borough}</span>
                  <span className="text-sm text-[var(--muted)]">
                    {b.percentage}% verified — {b.total.toLocaleString()} restaurants
                  </span>
                </div>
                <div className="w-full h-3 bg-[var(--card-border)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--accent)] rounded-full transition-all"
                    style={{ width: `${Math.max(b.percentage, 1)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="mt-8 text-center bg-[var(--accent-light)] rounded-lg p-6">
          <p className="font-semibold text-[var(--accent)]">Want to climb the ranks?</p>
          <p className="text-sm text-[var(--muted)] mt-1">
            Visit any restaurant page and share what you know about their delivery.
          </p>
          <Link
            href="/"
            className="inline-block mt-3 bg-[var(--accent)] hover:bg-[#d14e2f] text-white font-semibold rounded-lg px-6 py-2 transition-colors"
          >
            Browse Restaurants
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-[var(--card-border)] py-4 mt-8">
        <div className="max-w-3xl mx-auto px-4 text-center text-xs text-[var(--muted-light)]">
          <p>
            <span className="text-[var(--muted)]">nodash</span><span className="text-[var(--accent)]">.</span>
            {" "}Order direct. Skip the cut.
          </p>
        </div>
      </footer>
    </main>
  );
}
