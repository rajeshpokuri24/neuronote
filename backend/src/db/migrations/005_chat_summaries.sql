-- Feature: durable rolling chat summaries (replaces delete-on-summarize behavior)
CREATE TABLE IF NOT EXISTS chat_summaries (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  summary_text TEXT NOT NULL DEFAULT '',
  covered_through_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
