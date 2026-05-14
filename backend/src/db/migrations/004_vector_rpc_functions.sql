-- Migration 004: pgvector RPC functions for nearest-neighbour search
-- These functions are called via supabase.rpc() in retrieval.js and conceptGraph.js.
-- They only work when pgvector is installed. Idempotent — safe to run multiple times.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    RAISE NOTICE 'pgvector not installed — skipping RPC functions. Vector search will remain disabled.';
    RETURN;
  END IF;
END $$;

-- nn_concepts: k-nearest concepts by cosine similarity to a query vector
CREATE OR REPLACE FUNCTION nn_concepts(
  p_user_id   UUID,
  p_query_vec TEXT,
  p_limit     INT DEFAULT 5
)
RETURNS TABLE (
  id               UUID,
  name             TEXT,
  description      TEXT,
  complexity_score INT,
  note_id          UUID,
  similarity       FLOAT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    c.id,
    c.name,
    c.description,
    c.complexity_score,
    c.note_id,
    (1 - (c.embedding <=> p_query_vec::vector))::FLOAT AS similarity
  FROM concepts c
  WHERE c.user_id = p_user_id
    AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> p_query_vec::vector
  LIMIT p_limit;
$$;

-- nn_chunks: k-nearest note chunks by cosine similarity to a query vector
CREATE OR REPLACE FUNCTION nn_chunks(
  p_user_id   UUID,
  p_query_vec TEXT,
  p_limit     INT DEFAULT 5
)
RETURNS TABLE (
  id         UUID,
  content    TEXT,
  note_id    UUID,
  note_title TEXT,
  similarity FLOAT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    nc.id,
    nc.content,
    nc.note_id,
    n.title AS note_title,
    (1 - (nc.embedding <=> p_query_vec::vector))::FLOAT AS similarity
  FROM note_chunks nc
  JOIN notes n ON n.id = nc.note_id
  WHERE nc.user_id = p_user_id
    AND nc.embedding IS NOT NULL
  ORDER BY nc.embedding <=> p_query_vec::vector
  LIMIT p_limit;
$$;
