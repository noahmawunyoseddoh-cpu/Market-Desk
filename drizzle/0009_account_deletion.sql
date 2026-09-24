CREATE TABLE IF NOT EXISTS account_deletion_feedback (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  reason_category TEXT NOT NULL,
  reason_details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_account_deletion_feedback_created ON account_deletion_feedback(created_at);
