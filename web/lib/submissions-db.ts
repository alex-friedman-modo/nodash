import Database from "better-sqlite3";
import path from "path";

const SUBMISSIONS_DB_PATH =
  process.env.SUBMISSIONS_DB_PATH ||
  (process.env.RAILWAY_ENVIRONMENT
    ? "/data/submissions.db"
    : path.join(process.cwd(), "..", "data", "submissions.db"));

let _db: Database.Database | null = null;

export function getSubmissionsDb(): Database.Database {
  if (!_db) {
    _db = new Database(SUBMISSIONS_DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.exec(`
      CREATE TABLE IF NOT EXISTS user_submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        place_id TEXT NOT NULL,
        free_delivery TEXT,
        delivery_fee TEXT,
        delivery_minimum TEXT,
        delivery_radius TEXT,
        delivery_hours TEXT,
        comment TEXT,
        submitted_at TEXT DEFAULT (datetime('now')),
        ip_address TEXT,
        status TEXT DEFAULT 'pending',
        contributor_id TEXT,
        display_name TEXT
      );
    `);
    // Migrations for existing DBs
    const migrations = [
      "ALTER TABLE user_submissions ADD COLUMN contributor_id TEXT",
      "ALTER TABLE user_submissions ADD COLUMN display_name TEXT",
    ];
    for (const sql of migrations) {
      try { _db.exec(sql); } catch { /* column already exists */ }
    }
  }
  return _db;
}
