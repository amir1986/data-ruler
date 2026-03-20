import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), '../../data/databases');

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  ensureDir(DB_PATH);
  const dbFile = path.join(DB_PATH, 'catalog.db');
  _db = new Database(dbFile);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  initializeSchema(_db);
  return _db;
}

function initializeSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      settings JSON DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      original_name TEXT NOT NULL,
      stored_path TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_category TEXT NOT NULL,
      mime_type TEXT,
      size_bytes INTEGER NOT NULL,
      content_hash TEXT,
      storage_backend TEXT NOT NULL,
      db_table_name TEXT,
      db_file_path TEXT,
      schema_snapshot JSON,
      row_count INTEGER,
      column_count INTEGER,
      processing_status TEXT DEFAULT 'pending',
      processing_error TEXT,
      processing_log JSON,
      quality_profile JSON,
      quality_score REAL,
      ai_summary TEXT,
      media_metadata JSON,
      transcription_path TEXT,
      thumbnail_path TEXT,
      parent_file_id TEXT REFERENCES files(id) ON DELETE CASCADE,
      folder_path TEXT DEFAULT '/',
      tags JSON DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS imported_tables (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      table_name TEXT NOT NULL,
      schema_snapshot JSON NOT NULL,
      row_count INTEGER,
      storage_table_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS file_relationships (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      file_id_a TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      file_id_b TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      relationship_type TEXT NOT NULL,
      column_a TEXT,
      column_b TEXT,
      confidence REAL,
      confirmed_by_user BOOLEAN DEFAULT FALSE,
      metadata JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS dashboards (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT 'Untitled Dashboard',
      description TEXT,
      layout JSON NOT NULL DEFAULT '[]',
      widgets JSON NOT NULL DEFAULT '[]',
      is_auto_generated BOOLEAN DEFAULT FALSE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
      title TEXT DEFAULT 'Untitled Note',
      content TEXT NOT NULL DEFAULT '',
      content_format TEXT DEFAULT 'markdown',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      context_file_id TEXT REFERENCES files(id),
      context_dashboard_id TEXT REFERENCES dashboards(id),
      metadata JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS processing_tasks (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      task_type TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      priority INTEGER DEFAULT 5,
      agent_name TEXT,
      started_at DATETIME,
      completed_at DATETIME,
      error_message TEXT,
      retry_count INTEGER DEFAULT 0,
      result JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS agent_logs (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      agent_name TEXT NOT NULL,
      task_type TEXT NOT NULL,
      user_id TEXT NOT NULL,
      file_id TEXT,
      input_size_bytes INTEGER,
      output_size_bytes INTEGER,
      latency_ms INTEGER,
      token_count INTEGER,
      success BOOLEAN NOT NULL,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_files_user ON files(user_id);
    CREATE INDEX IF NOT EXISTS idx_files_status ON files(processing_status);
    CREATE INDEX IF NOT EXISTS idx_files_category ON files(file_category);
    CREATE INDEX IF NOT EXISTS idx_files_hash ON files(content_hash);
    CREATE INDEX IF NOT EXISTS idx_files_parent ON files(parent_file_id);
    CREATE INDEX IF NOT EXISTS idx_imported_tables_file ON imported_tables(file_id);
    CREATE INDEX IF NOT EXISTS idx_dashboards_user ON dashboards(user_id);
    CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);
    CREATE INDEX IF NOT EXISTS idx_notes_file ON notes(file_id);
    CREATE INDEX IF NOT EXISTS idx_chat_user ON chat_messages(user_id);
    CREATE INDEX IF NOT EXISTS idx_chat_created ON chat_messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON processing_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_user ON processing_tasks(user_id);
    CREATE INDEX IF NOT EXISTS idx_agent_logs_agent ON agent_logs(agent_name);
    CREATE INDEX IF NOT EXISTS idx_agent_logs_created ON agent_logs(created_at);
  `);
}

export function getUserDb(userId: string): Database.Database {
  const userDbDir = path.join(DB_PATH, userId);
  ensureDir(userDbDir);
  const dbFile = path.join(userDbDir, 'user_data.db');
  const db = new Database(dbFile);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}
