-- Migration 001: pgvector + chunk-level RAG + concept graph
--
-- Adds:
--   * vector extension (no-op if unavailable; embedding columns become nullable text)
--   * embedding columns on concepts (semantic dedup)
--   * note_chunks table for chunk-level retrieval
--   * concept_edges table for the semantic concept graph
--
-- Idempotent. Safe to run multiple times.
-- If pgvector is missing, embedding columns are still created as TEXT so the
-- application can degrade gracefully and persist serialized vectors.

DO $$
DECLARE
  has_vector BOOLEAN;
BEGIN
  -- Try to install pgvector. If it fails (extension not available on this
  -- Postgres), continue with TEXT-backed embeddings.
  BEGIN
    CREATE EXTENSION IF NOT EXISTS vector;
    has_vector := TRUE;
  EXCEPTION WHEN OTHERS THEN
    has_vector := FALSE;
    RAISE NOTICE 'pgvector extension unavailable — embeddings disabled. Install pgvector to enable semantic retrieval.';
  END;

  -- concepts.embedding (384 dims, matches all-MiniLM-L6-v2)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'concepts' AND column_name = 'embedding'
  ) THEN
    IF has_vector THEN
      EXECUTE 'ALTER TABLE concepts ADD COLUMN embedding vector(384)';
    ELSE
      EXECUTE 'ALTER TABLE concepts ADD COLUMN embedding TEXT';
    END IF;
  END IF;
END $$;

-- note_chunks: text split into overlapping chunks, each with its own embedding
CREATE TABLE IF NOT EXISTS note_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding TEXT, -- will be ALTERed to vector(384) below if pgvector exists
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (note_id, chunk_index)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    -- Promote embedding column to vector type if it's still TEXT
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'note_chunks' AND column_name = 'embedding' AND data_type = 'text'
    ) THEN
      EXECUTE 'ALTER TABLE note_chunks ALTER COLUMN embedding TYPE vector(384) USING NULL';
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_note_chunks_user_id ON note_chunks(user_id);
CREATE INDEX IF NOT EXISTS idx_note_chunks_note_id ON note_chunks(note_id);

-- HNSW indexes for cosine similarity (only if pgvector is installed)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    -- Concepts
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes WHERE indexname = 'idx_concepts_embedding_hnsw'
    ) THEN
      EXECUTE 'CREATE INDEX idx_concepts_embedding_hnsw ON concepts USING hnsw (embedding vector_cosine_ops)';
    END IF;
    -- Chunks
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes WHERE indexname = 'idx_note_chunks_embedding_hnsw'
    ) THEN
      EXECUTE 'CREATE INDEX idx_note_chunks_embedding_hnsw ON note_chunks USING hnsw (embedding vector_cosine_ops)';
    END IF;
  END IF;
END $$;

-- concept_edges: semantic graph between concepts (weight = cosine similarity)
CREATE TABLE IF NOT EXISTS concept_edges (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_concept_id UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  target_concept_id UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  weight FLOAT NOT NULL,
  edge_type VARCHAR(20) NOT NULL DEFAULT 'similar',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (source_concept_id, target_concept_id),
  CHECK (source_concept_id <> target_concept_id)
);

CREATE INDEX IF NOT EXISTS idx_concept_edges_user_id ON concept_edges(user_id);
CREATE INDEX IF NOT EXISTS idx_concept_edges_source ON concept_edges(source_concept_id);
CREATE INDEX IF NOT EXISTS idx_concept_edges_target ON concept_edges(target_concept_id);
