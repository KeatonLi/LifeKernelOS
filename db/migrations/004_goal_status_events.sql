-- 为目标状态变化保留可追溯历史，避免重新打开目标后丢失完成事实。
CREATE TABLE IF NOT EXISTS goal_status_events (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  goal_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'completed', 'abandoned')),
  occurred_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (goal_id, user_id) REFERENCES focuses(id, user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS goal_status_events_by_goal
ON goal_status_events (user_id, goal_id, occurred_at);

INSERT INTO goal_status_events (id, user_id, goal_id, status, occurred_at)
SELECT 'legacy-completed-' || id, user_id, id, 'completed', completed_at
FROM focuses
WHERE goal_status = 'completed'
  AND completed_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM goal_status_events events
    WHERE events.goal_id = focuses.id AND events.status = 'completed'
  );
