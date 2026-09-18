-- 产品 0.8：全局快速收集箱。Capture 独立保存，整理时才关联主线 To-do。
CREATE TABLE captures (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT CHECK (type IN ('idea', 'task', 'event', 'feeling', 'inspiration') OR type IS NULL),
  status TEXT NOT NULL DEFAULT 'inbox' CHECK (status IN ('inbox', 'converted', 'archived')),
  converted_action_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (converted_action_id) REFERENCES actions(id) ON DELETE SET NULL
);

CREATE INDEX captures_by_user_status_created
ON captures (user_id, status, created_at DESC);
