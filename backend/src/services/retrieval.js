/**
 * Retrieval service (RAG).
 *
 * Chunk note text and persist chunks on ingest.
 * Vector similarity search requires pgvector RPC functions in Supabase — falls
 * back gracefully (returns []) when unavailable, so the app works without it.
 */

const supabase = require('../db');
const embeddings = require('./embeddings');

const CHUNK_SIZE = 600;
const CHUNK_OVERLAP = 120;
const MIN_CHUNK_LEN = 40;

// Vector similarity queries need stored procedures in Supabase.
// We check once by calling a known RPC; if missing, vector search is disabled.
let vectorReady = null;
async function isVectorReady() {
  if (vectorReady !== null) return vectorReady;
  try {
    const { error } = await supabase.rpc('nn_concepts', {
      p_user_id: '00000000-0000-0000-0000-000000000000',
      p_query_vec: '[0]',
      p_limit: 1,
    });
    vectorReady = !error || !error.message?.includes('does not exist');
  } catch {
    vectorReady = false;
  }
  return vectorReady;
}

function chunkText(text) {
  if (!text || typeof text !== 'string') return [];
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= CHUNK_SIZE) {
    return cleaned.length >= MIN_CHUNK_LEN ? [cleaned] : [];
  }

  const chunks = [];
  let start = 0;
  while (start < cleaned.length) {
    let end = Math.min(start + CHUNK_SIZE, cleaned.length);
    if (end < cleaned.length) {
      const window = cleaned.slice(end - 100, end + 1);
      const m = window.match(/[.!?]\s[^.!?]*$/);
      if (m) end = end - 100 + m.index + 1;
    }
    const piece = cleaned.slice(start, end).trim();
    if (piece.length >= MIN_CHUNK_LEN) chunks.push(piece);
    if (end >= cleaned.length) break;
    start = Math.max(end - CHUNK_OVERLAP, start + 1);
  }
  return chunks;
}

async function indexNoteChunks(userId, noteId, text) {
  const chunks = chunkText(text);
  await supabase.from('note_chunks').delete().eq('note_id', noteId);
  if (chunks.length === 0) return 0;

  const ready = await isVectorReady();
  const vectors = ready ? await embeddings.embedBatch(chunks) : chunks.map(() => null);

  const rows = chunks.map((content, i) => ({
    user_id: userId,
    note_id: noteId,
    chunk_index: i,
    content,
    embedding: vectors[i] ? embeddings.toPgVector(vectors[i]) : null,
  }));

  const { error } = await supabase.from('note_chunks').upsert(rows, {
    onConflict: 'note_id,chunk_index',
    ignoreDuplicates: true,
  });

  if (error) console.warn('[retrieval] chunk insert error:', error.message);
  return chunks.length;
}

async function retrieveChunks(userId, query, topK = 5) {
  const ready = await isVectorReady();
  if (!ready) return [];

  const queryVec = await embeddings.embed(query);
  if (!queryVec) return [];

  try {
    const { data } = await supabase.rpc('nn_chunks', {
      p_user_id: userId,
      p_query_vec: embeddings.toPgVector(queryVec),
      p_limit: topK,
    });
    return data || [];
  } catch {
    return [];
  }
}

async function retrieveConcepts(userId, query, topK = 5) {
  const ready = await isVectorReady();
  if (!ready) return [];

  const queryVec = await embeddings.embed(query);
  if (!queryVec) return [];

  try {
    const { data } = await supabase.rpc('nn_concepts', {
      p_user_id: userId,
      p_query_vec: embeddings.toPgVector(queryVec),
      p_limit: topK,
    });
    return data || [];
  } catch {
    return [];
  }
}

async function buildChatContext(userId, query, { charBudget = 5000, topK = 6 } = {}) {
  const [chunks, concepts] = await Promise.all([
    retrieveChunks(userId, query, topK),
    retrieveConcepts(userId, query, 3),
  ]);

  if (chunks.length === 0 && concepts.length === 0) {
    return { text: '', sources: [] };
  }

  const parts = [];
  const sources = [];
  let used = 0;

  if (concepts.length > 0) {
    const block =
      'RELEVANT CONCEPTS FROM YOUR NOTES:\n' +
      concepts
        .map(
          (c) =>
            `• ${c.name} (relevance ${(c.similarity * 100).toFixed(0)}%): ${c.description || ''}`
        )
        .join('\n');
    parts.push(block);
    used += block.length;
    concepts.forEach((c) =>
      sources.push({ type: 'concept', id: c.id, note_id: c.note_id, name: c.name })
    );
  }

  if (chunks.length > 0) {
    const lines = ['\n\nRELEVANT NOTE EXCERPTS:'];
    for (const ch of chunks) {
      const header = `\n[from "${ch.note_title}" — relevance ${(ch.similarity * 100).toFixed(0)}%]`;
      const body = ch.content;
      const cost = header.length + body.length + 1;
      if (used + cost > charBudget) break;
      lines.push(header);
      lines.push(body);
      used += cost;
      sources.push({ type: 'chunk', id: ch.id, note_id: ch.note_id, title: ch.note_title });
    }
    parts.push(lines.join('\n'));
  }

  return { text: parts.join(''), sources };
}

module.exports = {
  chunkText,
  indexNoteChunks,
  retrieveChunks,
  retrieveConcepts,
  buildChatContext,
  isVectorReady,
};
