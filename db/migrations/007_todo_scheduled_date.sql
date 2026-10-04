ALTER TABLE actions ADD COLUMN scheduled_date TEXT CHECK (
  scheduled_date IS NULL OR (
    length(scheduled_date) = 10 AND scheduled_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  )
);
CREATE INDEX idx_actions_user_scheduled_date ON actions(user_id, scheduled_date);
