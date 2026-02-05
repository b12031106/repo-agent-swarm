import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sql } from "drizzle-orm";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(process.cwd(), "data", "repo-agent-swarm.db");

let _db: ReturnType<typeof createDb> | null = null;

function createDb() {
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });

  // Run migrations inline (create tables if not exist)
  db.run(sql`
    CREATE TABLE IF NOT EXISTS repos (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      github_url TEXT NOT NULL,
      local_path TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'cloning',
      error_message TEXT,
      created_at TEXT NOT NULL,
      last_synced_at TEXT
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      repo_id TEXT REFERENCES repos(id) ON DELETE CASCADE,
      session_id TEXT,
      title TEXT NOT NULL DEFAULT 'New Conversation',
      is_orchestrator INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Migration: add model column to conversations
  try {
    db.run(sql`ALTER TABLE conversations ADD COLUMN model TEXT DEFAULT 'sonnet'`);
  } catch {
    // Column already exists
  }

  // Migration: add custom_prompt column to repos
  try {
    db.run(sql`ALTER TABLE repos ADD COLUMN custom_prompt TEXT`);
  } catch {
    // Column already exists
  }

  // Migration: add attachments_json column to messages
  try {
    db.run(sql`ALTER TABLE messages ADD COLUMN attachments_json TEXT`);
  } catch {
    // Column already exists
  }

  // Create settings table
  db.run(sql`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tool_name TEXT,
      created_at TEXT NOT NULL
    )
  `);

  db.run(sql`
    CREATE TABLE IF NOT EXISTS usage_records (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      total_cost_usd REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);

  return db;
}

export function getDb() {
  if (!_db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    _db = createDb();
  }
  return _db;
}

export { schema };
