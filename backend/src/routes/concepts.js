const express = require('express');
const supabase = require('../db');
const { authenticate } = require('../middleware/auth');
const conceptGraph = require('../services/conceptGraph');
const retrieval = require('../services/retrieval');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const [{ data: conceptsData }, { data: reviewItemsData }] = await Promise.all([
      supabase
        .from('concepts')
        .select('id, name, description, complexity_score, note_id, created_at')
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('review_items')
        .select('concept_id, state, due_date, stability')
        .eq('user_id', req.user.id),
    ]);

    const riMap = {};
    (reviewItemsData || []).forEach((ri) => { riMap[ri.concept_id] = ri; });

    const result = (conceptsData || []).map((c) => ({
      ...c,
      state: riMap[c.id]?.state,
      due_date: riMap[c.id]?.due_date,
      stability: riMap[c.id]?.stability,
    }));

    res.json(result);
  } catch (err) {
    console.error('List concepts error:', err);
    res.status(500).json({ error: 'Failed to fetch concepts' });
  }
});

router.get('/graph', authenticate, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
    const graph = await conceptGraph.getUserGraph(req.user.id, { limit });
    res.json({
      ...graph,
      vector_search_enabled: await retrieval.isVectorReady(),
    });
  } catch (err) {
    console.error('Get graph error:', err);
    res.status(500).json({ error: 'Failed to fetch concept graph' });
  }
});

router.get('/:id/neighbors', authenticate, async (req, res) => {
  try {
    const k = Math.min(parseInt(req.query.k, 10) || 8, 20);
    const { data: edgesData } = await supabase
      .from('concept_edges')
      .select('weight, edge_type, target_concept_id')
      .eq('user_id', req.user.id)
      .eq('source_concept_id', req.params.id)
      .order('weight', { ascending: false })
      .limit(k);

    if (!edgesData || edgesData.length === 0) return res.json([]);

    const targetIds = edgesData.map((e) => e.target_concept_id);
    const { data: conceptsData } = await supabase
      .from('concepts')
      .select('id, name, description, complexity_score')
      .in('id', targetIds);

    const cMap = {};
    (conceptsData || []).forEach((c) => { cMap[c.id] = c; });

    const result = edgesData.map((e) => ({
      ...cMap[e.target_concept_id],
      weight: e.weight,
      edge_type: e.edge_type,
    })).filter((r) => r.id);

    res.json(result);
  } catch (err) {
    console.error('Get neighbors error:', err);
    res.status(500).json({ error: 'Failed to fetch neighbors' });
  }
});

router.post('/search', authenticate, async (req, res) => {
  try {
    const { query, k } = req.body;
    if (!query?.trim()) return res.json([]);
    const topK = Math.min(parseInt(k, 10) || 8, 30);
    const results = await retrieval.retrieveConcepts(req.user.id, query, topK);
    res.json(results);
  } catch (err) {
    console.error('Concept search error:', err);
    res.status(500).json({ error: 'Concept search failed' });
  }
});

module.exports = router;
