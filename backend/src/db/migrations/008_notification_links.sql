-- Migration 008: link column on notifications so clicking one can navigate
-- straight to the relevant page (e.g. the Review queue).
-- Idempotent — safe to run multiple times.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'link'
  ) THEN
    ALTER TABLE notifications ADD COLUMN link TEXT;
  END IF;
END $$;
