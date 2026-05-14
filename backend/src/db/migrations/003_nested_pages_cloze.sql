-- Feature: Nested pages (parent_id on notes)
ALTER TABLE notes ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES notes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_notes_parent_id ON notes(parent_id);

-- Feature: Cloze deletion cards cache on review items
ALTER TABLE review_items ADD COLUMN IF NOT EXISTS cloze_cards JSONB DEFAULT '[]'::jsonb;

-- Feature: Wiki-link backlinks between notes ([[Note Title]] references)
CREATE TABLE IF NOT EXISTS note_backlinks (
  source_note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  target_note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  PRIMARY KEY (source_note_id, target_note_id)
);
