-- 产品 0.5：把旧 Focus / Action 存量升级为多个 Goal + 一个全局 CurrentContext。
-- 旧列保留用于画像与历史导出；新业务只读取 goal_status 和新 Action 字段。

ALTER TABLE focuses ADD COLUMN done_definition TEXT;
ALTER TABLE focuses ADD COLUMN goal_status TEXT NOT NULL DEFAULT 'active'
  CHECK (goal_status IN ('active', 'paused', 'completed', 'abandoned'));

UPDATE focuses
SET goal_status = CASE status
  WHEN 'completed' THEN 'completed'
  WHEN 'archived' THEN 'abandoned'
  ELSE 'active'
END;

DROP INDEX IF EXISTS focuses_one_active_per_user;

CREATE TABLE actions_v2 (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  focus_id TEXT NOT NULL,
  parent_action_id TEXT,
  title TEXT NOT NULL,
  estimated_minutes INTEGER CHECK (estimated_minutes IN (5, 15, 30, 60) OR estimated_minutes IS NULL),
  energy_required TEXT CHECK (energy_required IN ('low', 'medium', 'high') OR energy_required IS NULL),
  status TEXT NOT NULL CHECK (status IN ('available', 'completed', 'blocked', 'abandoned', 'superseded')),
  blocker_note TEXT,
  outcome_note TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (focus_id, user_id) REFERENCES focuses(id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (parent_action_id) REFERENCES actions_v2(id) ON DELETE SET NULL
);

INSERT INTO actions_v2 (id, user_id, focus_id, title, status, created_at, updated_at, resolved_at)
SELECT id, user_id, focus_id, title, status, created_at, updated_at,
  CASE WHEN status = 'completed' THEN updated_at ELSE NULL END
FROM actions;

DROP TABLE actions;
ALTER TABLE actions_v2 RENAME TO actions;

CREATE INDEX actions_by_focus_status
ON actions (user_id, focus_id, status, created_at);

CREATE INDEX actions_by_goal_status
ON actions (user_id, focus_id, status, estimated_minutes, energy_required, created_at);

CREATE TABLE current_contexts (
  user_id TEXT PRIMARY KEY NOT NULL,
  available_minutes INTEGER CHECK (available_minutes IN (5, 15, 30, 60) OR available_minutes IS NULL),
  energy TEXT CHECK (energy IN ('low', 'medium', 'high') OR energy IS NULL),
  state_recorded_at TEXT,
  selected_action_id TEXT,
  selected_at TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (selected_action_id) REFERENCES actions(id) ON DELETE SET NULL
);
