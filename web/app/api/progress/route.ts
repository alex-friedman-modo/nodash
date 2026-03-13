import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSubmissionsDb } from "@/lib/submissions-db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getDb();
    const subDb = getSubmissionsDb();

    // Total restaurants per borough (direct delivery only)
    const boroughTotals = db.prepare(`
      SELECT borough, COUNT(*) as total
      FROM restaurants
      WHERE direct_delivery = 1 AND borough IS NOT NULL
      GROUP BY borough
    `).all() as Array<{ borough: string; total: number }>;

    // Restaurants with delivery_fee data in main DB
    const verifiedInDb = db.prepare(`
      SELECT borough, COUNT(*) as verified
      FROM restaurants
      WHERE direct_delivery = 1 AND borough IS NOT NULL
        AND delivery_fee IS NOT NULL AND delivery_fee != ''
      GROUP BY borough
    `).all() as Array<{ borough: string; verified: number }>;

    // Restaurants with user submissions (distinct place_ids)
    const submittedPlaceIds = subDb.prepare(`
      SELECT DISTINCT place_id FROM user_submissions
    `).all() as Array<{ place_id: string }>;
    const submittedSet = new Set(submittedPlaceIds.map((r) => r.place_id));

    // Cross-reference submitted place_ids to boroughs
    const submittedByBorough: Record<string, number> = {};
    if (submittedSet.size > 0) {
      const placeholders = [...submittedSet].map(() => "?").join(",");
      const rows = db.prepare(`
        SELECT borough, COUNT(DISTINCT place_id) as cnt
        FROM restaurants
        WHERE place_id IN (${placeholders}) AND borough IS NOT NULL
        GROUP BY borough
      `).all(...submittedSet) as Array<{ borough: string; cnt: number }>;
      for (const row of rows) {
        submittedByBorough[row.borough] = row.cnt;
      }
    }

    const verifiedMap: Record<string, number> = {};
    for (const row of verifiedInDb) {
      verifiedMap[row.borough] = row.verified;
    }

    const progress = boroughTotals.map((b) => {
      const dbVerified = verifiedMap[b.borough] || 0;
      const userSubmitted = submittedByBorough[b.borough] || 0;
      // Union: verified in DB or has user submission
      const verified = Math.min(b.total, dbVerified + userSubmitted);
      const percentage = b.total > 0 ? Math.round((verified / b.total) * 100) : 0;
      return {
        borough: b.borough,
        total: b.total,
        verified,
        percentage,
      };
    }).sort((a, b) => b.total - a.total);

    // Overall stats
    const totalRestaurants = boroughTotals.reduce((s, b) => s + b.total, 0);
    const totalVerified = progress.reduce((s, b) => s + b.verified, 0);
    const totalContributions = (subDb.prepare("SELECT COUNT(*) as cnt FROM user_submissions").get() as { cnt: number }).cnt;
    const overallPercentage = totalRestaurants > 0 ? Math.round((totalVerified / totalRestaurants) * 100) : 0;

    return NextResponse.json({
      boroughs: progress,
      overall: {
        total: totalRestaurants,
        verified: totalVerified,
        contributions: totalContributions,
        percentage: overallPercentage,
        neighborhoods: progress.length,
      },
    });
  } catch (e) {
    console.error("Progress error:", e);
    return NextResponse.json({ boroughs: [], overall: { total: 0, verified: 0, contributions: 0, percentage: 0, neighborhoods: 0 } }, { status: 500 });
  }
}
