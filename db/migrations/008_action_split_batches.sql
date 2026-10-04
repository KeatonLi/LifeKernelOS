CREATE TABLE action_split_batches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_action_id TEXT NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
  request_hash TEXT NOT NULL,
  original_json TEXT NOT NULL,
  applied_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('applied', 'undone')),
  created_at TEXT NOT NULL
);
CREATE INDEX action_split_batches_user ON action_split_batches(user_id);
