-- NeuroNote Database Schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table with learner profile
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  learning_speed VARCHAR(20) DEFAULT 'average',
  study_session_length INTEGER DEFAULT 30,
  content_domain VARCHAR(50) DEFAULT 'general',
  sleep_study_habit VARCHAR(20) DEFAULT 'morning',
  prior_srs_experience BOOLEAN DEFAULT false,
  success_rate FLOAT DEFAULT 0.5,
  retention_score FLOAT DEFAULT 0.5,
  semantic_sensitivity FLOAT DEFAULT 0.5,
  fsrs_w JSONB DEFAULT '[0.4072,1.1829,3.1262,15.4722,7.2102,0.5316,1.0651,0.0589,1.533,0.1544,1.007,1.939,0.11,0.29,2.27,0.29,2.9898,0.51,0.34]',
  onboarding_complete BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notes table (Notion-style blocks)
CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL DEFAULT 'Untitled',
  blocks JSONB NOT NULL DEFAULT '[]',
  tags TEXT[] DEFAULT '{}',
  is_processed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Concepts extracted from notes
CREATE TABLE IF NOT EXISTS concepts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  note_id UUID REFERENCES notes(id) ON DELETE CASCADE,
  name VARCHAR(500) NOT NULL,
  description TEXT,
  complexity_score INTEGER DEFAULT 3 CHECK (complexity_score BETWEEN 1 AND 5),
  related_concepts TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Review items (FSRS state per concept per user)
CREATE TABLE IF NOT EXISTS review_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  concept_id UUID REFERENCES concepts(id) ON DELETE CASCADE,
  stability FLOAT DEFAULT 1.0,
  difficulty FLOAT DEFAULT 5.0,
  elapsed_days INTEGER DEFAULT 0,
  scheduled_days INTEGER DEFAULT 1,
  reps INTEGER DEFAULT 0,
  lapses INTEGER DEFAULT 0,
  state VARCHAR(20) DEFAULT 'new',
  due_date TIMESTAMPTZ DEFAULT NOW(),
  last_review TIMESTAMPTZ,
  flashcards JSONB DEFAULT '[]',
  quiz_questions JSONB DEFAULT '[]',
  mind_map_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Review sessions (feedback loop)
CREATE TABLE IF NOT EXISTS review_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  review_item_id UUID REFERENCES review_items(id) ON DELETE CASCADE,
  review_type VARCHAR(20) NOT NULL,
  grade INTEGER NOT NULL CHECK (grade BETWEEN 1 AND 4),
  response_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat history
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(10) NOT NULL,
  content TEXT NOT NULL,
  context_note_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Mind maps
CREATE TABLE IF NOT EXISTS mind_maps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  note_id UUID REFERENCES notes(id) ON DELETE SET NULL,
  title VARCHAR(500),
  nodes JSONB NOT NULL DEFAULT '[]',
  edges JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_concepts_user_id ON concepts(user_id);
CREATE INDEX IF NOT EXISTS idx_concepts_note_id ON concepts(note_id);
CREATE INDEX IF NOT EXISTS idx_review_items_user_id ON review_items(user_id);
CREATE INDEX IF NOT EXISTS idx_review_items_due_date ON review_items(due_date);
CREATE INDEX IF NOT EXISTS idx_review_sessions_user_id ON review_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id);

-- pgvector + RAG tables are managed by migrations/001_pgvector_and_rag.sql.
-- The migration is idempotent and runs automatically after this schema during
-- `npm run db:setup`. It's split out so the app degrades gracefully on Postgres
-- instances where the pgvector extension isn't available.
