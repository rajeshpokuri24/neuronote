/**
 * Concept graph — semantic edges between a user's concepts.
 *
 * Vector similarity queries (findDuplicate, linkNeighbors) require Supabase RPC
 * functions backed by pgvector. They degrade gracefully when unavailable.
 * getUserGraph works without vectors — just reads concepts + concept_edges.
 */

const supabase = require('../db');
const embeddings = require('./embeddings');
const retrieval = require('./retrieval');

const DEDUP_THRESHOLD = 0.85;
const EDGE_THRESHOLD = 0.55;
const MAX_NEIGHBORS = 4;

async function findDuplicate(userId, conceptName, conceptDescription) {
  if (!(await retrieval.isVectorReady())) return null;

  const queryText = `${conceptName}. ${conceptDescription || ''}`;
  const vec = await embeddings.embed(queryText);
  if (!vec) return null;

  try {
    const { data } = await supabase.rpc('nn_concepts', {
      p_user_id: userId,
      p_query_vec: embeddings.toPgVector(vec),
      p_limit: 1,
    });
    if (!data || data.length === 0) return null;
    const top = data[0];
    if ((top.similarity || 0) >= DEDUP_THRESHOLD) return top;
    return null;
  } catch {
    return null;
  }
}

async function setConceptEmbedding(conceptId, vec) {
  if (!vec) return;
  await supabase
    .from('concepts')
    .update({ embedding: embeddings.toPgVector(vec) })
    .eq('id', conceptId);
}

async function linkNeighbors(userId, conceptId, vec) {
  if (!vec || !(await retrieval.isVectorReady())) return 0;

  try {
    const { data: neighbors } = await supabase.rpc('nn_concepts', {
      p_user_id: userId,
      p_query_vec: embeddings.toPgVector(vec),
      p_limit: MAX_NEIGHBORS + 1, // +1 to allow excluding self
    });

    let written = 0;
    for (const row of neighbors || []) {
      if (row.id === conceptId) continue;
      if ((row.similarity || 0) < EDGE_THRESHOLD) continue;
      const edgeType = row.similarity >= DEDUP_THRESHOLD ? 'duplicate' : 'similar';

      await supabase.from('concept_edges').upsert(
        [
          {
            user_id: userId,
            source_concept_id: conceptId,
            target_concept_id: row.id,
            weight: row.similarity,
            edge_type: edgeType,
          },
          {
            user_id: userId,
            source_concept_id: row.id,
            target_concept_id: conceptId,
            weight: row.similarity,
            edge_type: edgeType,
          },
        ],
        { onConflict: 'source_concept_id,target_concept_id' }
      );
      written += 1;
    }
    return written;
  } catch {
    return 0;
  }
}

async function getUserGraph(userId, { limit = 200 } = {}) {
  const [{ data: nodesData }, { data: edgesData }] = await Promise.all([
    supabase
      .from('concepts')
      .select('id, name, complexity_score, note_id, review_items(state, stability, due_date)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('concept_edges')
      .select('source_concept_id, target_concept_id, weight, edge_type')
      .eq('user_id', userId),
  ]);

  const nodeIds = new Set((nodesData || []).map((n) => n.id));

  const nodes = (nodesData || []).map((n) => ({
    id: n.id,
    data: {
      label: n.name,
      complexity: n.complexity_score,
      state: n.review_items?.[0]?.state,
      stability: n.review_items?.[0]?.stability,
      due_date: n.review_items?.[0]?.due_date,
      note_id: n.note_id,
    },
    position: { x: 0, y: 0 },
  }));

  // Deduplicate bidirectional edges: keep only source < target (string compare)
  const edges = (edgesData || [])
    .filter(
      (e) =>
        e.source_concept_id < e.target_concept_id &&
        nodeIds.has(e.source_concept_id) &&
        nodeIds.has(e.target_concept_id)
    )
    .map((e) => ({
      id: `${e.source_concept_id}-${e.target_concept_id}`,
      source: e.source_concept_id,
      target: e.target_concept_id,
      data: { weight: e.weight, type: e.edge_type },
      animated: e.edge_type === 'duplicate',
    }));

  return { nodes, edges };
}

module.exports = {
  findDuplicate,
  setConceptEmbedding,
  linkNeighbors,
  getUserGraph,
  DEDUP_THRESHOLD,
  EDGE_THRESHOLD,
};
