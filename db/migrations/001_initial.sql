CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS focuses (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  progress_percent INTEGER NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'archived')),
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS focuses_one_active_per_user
ON focuses (user_id)
WHERE status = 'active';

CREATE TABLE IF NOT EXISTS actions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  focus_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('available', 'completed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (focus_id, user_id) REFERENCES focuses(id, user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS actions_by_focus_status
ON actions (user_id, focus_id, status, created_at);

CREATE TABLE IF NOT EXISTS focus_reflections (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  focus_id TEXT NOT NULL UNIQUE,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (focus_id, user_id) REFERENCES focuses(id, user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS profile_descriptions (
  user_id TEXT PRIMARY KEY NOT NULL,
  content TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS knowledge_items (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  focus_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('in_progress', 'needs_consolidation', 'consolidated')),
  note TEXT,
  consolidated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (focus_id, user_id) REFERENCES focuses(id, user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS knowledge_items_by_status
ON knowledge_items (user_id, status, created_at);
