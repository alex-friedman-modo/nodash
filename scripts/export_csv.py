#!/usr/bin/env python3
"""Export restaurant database to CSV for manual review / verification tracking."""

import sqlite3, csv, os, sys

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'restaurants.db')
OUT_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'restaurants_export.csv')

def export(neighborhood=None, unverified_only=False):
    if not os.path.exists(DB_PATH):
        print(f"❌ DB not found at {DB_PATH}")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    query = "SELECT * FROM restaurants WHERE 1=1"
    params = []
    if neighborhood:
        query += " AND neighborhood = ?"
        params.append(neighborhood)
    if unverified_only:
        query += " AND verified = 0"
    query += " ORDER BY neighborhood, review_count DESC"

    rows = conn.execute(query, params).fetchall()
    conn.close()

    if not rows:
        print("No results.")
        return

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows([dict(r) for r in rows])

    print(f"✅ Exported {len(rows)} restaurants to {OUT_PATH}")

if __name__ == "__main__":
    neighborhood = None
    unverified_only = "--unverified" in sys.argv
    for arg in sys.argv[1:]:
        if not arg.startswith("--"):
            neighborhood = arg
    export(neighborhood=neighborhood, unverified_only=unverified_only)
