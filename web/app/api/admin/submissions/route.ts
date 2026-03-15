import { NextRequest, NextResponse } from "next/server";
import { getSubmissionsDb } from "@/lib/submissions-db";
import { getDb } from "@/lib/db";

const ADMIN_KEY = process.env.ADMIN_KEY || "nodash-admin-2026";

function checkAuth(req: NextRequest): boolean {
  const key = req.headers.get("x-admin-key") || req.nextUrl.searchParams.get("key");
  return key === ADMIN_KEY;
}

// GET: list submissions
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = req.nextUrl.searchParams.get("status") || "pending";
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 50, 200);
  const offset = Number(req.nextUrl.searchParams.get("offset")) || 0;

  const db = getSubmissionsDb();
  const mainDb = getDb();

  const submissions = db
    .prepare(
      `SELECT * FROM user_submissions WHERE status = ? ORDER BY submitted_at DESC LIMIT ? OFFSET ?`
    )
    .all(status, limit, offset) as Record<string, unknown>[];

  // Enrich with restaurant names
  const enriched = submissions.map((s) => {
    const restaurant = mainDb
      .prepare("SELECT name, borough, neighborhood FROM restaurants WHERE place_id = ?")
      .get(s.place_id as string) as { name: string; borough: string; neighborhood: string } | undefined;
    return {
      ...s,
      restaurant_name: restaurant?.name || "Unknown",
      restaurant_borough: restaurant?.borough || "",
      restaurant_neighborhood: restaurant?.neighborhood || "",
    };
  });

  const total = (
    db.prepare("SELECT COUNT(*) as count FROM user_submissions WHERE status = ?").get(status) as {
      count: number;
    }
  ).count;

  return NextResponse.json({ submissions: enriched, total, limit, offset });
}

// PATCH: approve/reject/merge a submission
export async function PATCH(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { id, action } = body;

  if (!id || !["approve", "reject", "merge"].includes(action)) {
    return NextResponse.json({ error: "id and action (approve/reject/merge) required" }, { status: 400 });
  }

  const db = getSubmissionsDb();
  const submission = db.prepare("SELECT * FROM user_submissions WHERE id = ?").get(id) as Record<
    string,
    unknown
  > | undefined;

  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  if (action === "reject") {
    db.prepare("UPDATE user_submissions SET status = 'rejected' WHERE id = ?").run(id);
    return NextResponse.json({ success: true, status: "rejected" });
  }

  if (action === "approve" || action === "merge") {
    // Merge data into main DB
    const mainDb = getDb();
    const updates: string[] = [];
    const values: unknown[] = [];

    if (submission.free_delivery === "yes") {
      updates.push("delivery_fee = ?");
      values.push("Free");
    } else if (submission.free_delivery === "fee" && submission.delivery_fee) {
      updates.push("delivery_fee = ?");
      values.push(submission.delivery_fee);
    }

    if (submission.delivery_minimum) {
      updates.push("delivery_minimum = ?");
      values.push(submission.delivery_minimum);
    }
    if (submission.delivery_radius) {
      updates.push("delivery_radius = ?");
      values.push(submission.delivery_radius);
    }
    if (submission.delivery_hours) {
      updates.push("delivery_hours = ?");
      values.push(submission.delivery_hours);
    }

    if (updates.length > 0) {
      values.push(submission.place_id);
      mainDb
        .prepare(`UPDATE restaurants SET ${updates.join(", ")} WHERE place_id = ?`)
        .run(...values);
    }

    db.prepare("UPDATE user_submissions SET status = 'merged' WHERE id = ?").run(id);
    return NextResponse.json({ success: true, status: "merged", fields_updated: updates.length });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
