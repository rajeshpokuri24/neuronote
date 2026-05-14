-- Migration 002: notifications table + desired_retention on users
-- Idempotent — safe to run multiple times.

-- desired_retention: user-specific target recall probability (0.70–0.97)
-- Replaces the hardcoded 0.9 in fsrs.nextInterval.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'desired_retention'
  ) THEN
    ALTER TABLE users ADD COLUMN desired_retention FLOAT DEFAULT 0.9
      CHECK (desired_retention BETWEEN 0.70 AND 0.97);
  END IF;
END $$;

-- bkt_p_know: Bayesian Knowledge Tracing mastery estimate (0–1)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'review_items' AND column_name = 'bkt_p_know'
  ) THEN
    ALTER TABLE review_items ADD COLUMN bkt_p_know FLOAT DEFAULT 0.0
      CHECK (bkt_p_know BETWEEN 0.0 AND 1.0);
  END IF;
END $$;

-- study_events: time-of-day tracking for context-aware forgetting
CREATE TABLE IF NOT EXISTS study_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(30) NOT NULL DEFAULT 'review_session',
  hour_of_day SMALLINT NOT NULL CHECK (hour_of_day BETWEEN 0 AND 23),
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_study_events_user_id ON study_events(user_id);
CREATE INDEX IF NOT EXISTS idx_study_events_created_at ON study_events(created_at);

-- notifications: in-app alert system
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, read) WHERE read = FALSE;
