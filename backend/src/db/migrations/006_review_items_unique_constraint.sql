-- Fix: notes.js upserts into review_items using
-- { onConflict: 'user_id,concept_id' }, but no unique constraint on those
-- columns has ever existed. Every such upsert has been failing with
-- Postgres error 42P10 ("no unique or exclusion constraint matching the
-- ON CONFLICT specification"), silently (the error was never checked) —
-- leaving newly extracted concepts without a review_item: not schedulable,
-- not reviewable, and showing a "new" badge in the UI that doesn't reflect
-- a real row.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'review_items_user_concept_unique'
  ) THEN
    ALTER TABLE review_items
      ADD CONSTRAINT review_items_user_concept_unique UNIQUE (user_id, concept_id);
  END IF;
END $$;

-- Backfill: create the missing review_item for every concept that doesn't have one.
INSERT INTO review_items (user_id, concept_id, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, due_date)
SELECT c.user_id, c.id, 1.0, LEAST(10, GREATEST(1, c.complexity_score * 2)), 0, 0, 0, 0, 'new', NOW()
FROM concepts c
LEFT JOIN review_items ri ON ri.concept_id = c.id AND ri.user_id = c.user_id
WHERE ri.id IS NULL;
