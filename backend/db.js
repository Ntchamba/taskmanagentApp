'use strict';

const path = require('node:path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'taskmanager.db');

const db = new Database(DB_PATH);

// Foreign keys are off by default in SQLite; we rely on them for
// ON DELETE CASCADE (users -> everything) and ON DELETE SET NULL (category -> tasks).
db.pragma('foreign_keys = ON');
if (DB_PATH !== ':memory:') {
  db.pragma('journal_mode = WAL');
}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS categories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    title       TEXT NOT NULL,
    description TEXT,
    due_date    TEXT,
    priority    TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    stage       TEXT NOT NULL DEFAULT 'research'
                CHECK (stage IN ('research', 'design', 'in_review', 'development')),
    assignees   TEXT NOT NULL DEFAULT '[]',
    completed   INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category_id);
  CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);
`);

// --- Lightweight migrations for databases created before the board redesign ---
const taskColumns = new Set(db.prepare('PRAGMA table_info(tasks)').all().map((c) => c.name));
if (!taskColumns.has('stage')) {
  db.exec("ALTER TABLE tasks ADD COLUMN stage TEXT NOT NULL DEFAULT 'research'");
}
if (!taskColumns.has('assignees')) {
  db.exec("ALTER TABLE tasks ADD COLUMN assignees TEXT NOT NULL DEFAULT '[]'");
}

module.exports = db;
