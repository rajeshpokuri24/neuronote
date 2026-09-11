-- Feature: per-concept AI tutor mastery tracking (Not Started / Learning / Needs Review / Mastered)
ALTER TABLE concepts ADD COLUMN IF NOT EXISTS mastery_status VARCHAR(20) NOT NULL DEFAULT 'not_started';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'concepts_mastery_status_check'
  ) THEN
    ALTER TABLE concepts ADD CONSTRAINT concepts_mastery_status_check
      CHECK (mastery_status IN ('not_started', 'learning', 'needs_review', 'mastered'));
  END IF;
END $$;
