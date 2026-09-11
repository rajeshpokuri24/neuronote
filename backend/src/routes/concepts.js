const express = require('express');
const supabase = require('../db');
const { authenticate } = require('../middleware/auth');
const conceptGraph = require('../services/conceptGraph');
const retrieval = require('../services/retrieval');
const claudeService = require('../services/claude');
const fsrs = require('../services/fsrs');

const router = express.Router();

const MASTERY_STATUSES = ['not_started', 'learning', 'needs_review', 'mastered'];

function extractTextFromBlocks(blocks) {
  if (!blocks || !Array.isArray(blocks)) return '';
  return blocks
    .map((block) => {
      if (block.type === 'image') return block.alt || '';
      if (typeof block.content === 'string') return block.content;
      if (Array.isArray(block.content)) return block.content.map((c) => c.text || '').join(' ');
      return '';
    })
    .join('\n');
}

async function loadConceptWithNote(conceptId, userId) {
  const { data } = await supabase
    .from('concepts')
    .select('id, name, description, notes(blocks)')
    .eq('id', conceptId)
    .eq('user_id', userId)
    .single();
  if (!data) return null;
  return {
    concept: { name: data.name, description: data.description },
    noteText: extractTextFromBlocks(data.notes?.blocks),
  };
}

router.get('/', authenticate, async (req, res) => {
  try {
    const [{ data: conceptsData }, { data: reviewItemsData }] = await Promise.all([
      supabase
        .from('concepts')
        .select('id, name, description, complexity_score, note_id, mastery_status, created_at')
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

router.post('/rebuild-edges', authenticate, async (req, res) => {
  try {
    const result = await conceptGraph.rebuildAllEdges(req.user.id);
    res.json(result);
  } catch (err) {
    console.error('Rebuild edges error:', err);
    res.status(500).json({ error: 'Failed to rebuild concept graph' });
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

router.post('/:id/tutor/explain', authenticate, async (req, res) => {
  try {
    const loaded = await loadConceptWithNote(req.params.id, req.user.id);
    if (!loaded) return res.status(404).json({ error: 'Concept not found' });
    const result = await claudeService.tutorExplain(loaded.concept, loaded.noteText);
    res.json(result);
  } catch (err) {
    console.error('Tutor explain error:', err);
    res.status(500).json({ error: 'Failed to generate explanation: ' + err.message });
  }
});

router.post('/:id/tutor/question', authenticate, async (req, res) => {
  try {
    const { askedQuestions, difficulty } = req.body;
    const loaded = await loadConceptWithNote(req.params.id, req.user.id);
    if (!loaded) return res.status(404).json({ error: 'Concept not found' });
    const result = await claudeService.tutorNextQuestion(loaded.concept, loaded.noteText, askedQuestions, difficulty || 'easy');
    res.json(result);
  } catch (err) {
    console.error('Tutor question error:', err);
    res.status(500).json({ error: 'Failed to generate question: ' + err.message });
  }
});

router.post('/:id/tutor/evaluate', authenticate, async (req, res) => {
  try {
    const { question, userAnswer } = req.body;
    const loaded = await loadConceptWithNote(req.params.id, req.user.id);
    if (!loaded) return res.status(404).json({ error: 'Concept not found' });
    const result = await claudeService.tutorEvaluateAnswer(loaded.concept, question, userAnswer);
    res.json(result);
  } catch (err) {
    console.error('Tutor evaluate error:', err);
    res.status(500).json({ error: 'Failed to evaluate answer: ' + err.message });
  }
});

router.post('/:id/tutor/doubt', authenticate, async (req, res) => {
  try {
    const { doubtText } = req.body;
    if (!doubtText?.trim()) return res.status(400).json({ error: 'doubtText is required' });
    const loaded = await loadConceptWithNote(req.params.id, req.user.id);
    if (!loaded) return res.status(404).json({ error: 'Concept not found' });
    const result = await claudeService.tutorDoubtClarify(loaded.concept, loaded.noteText, doubtText);
    res.json(result);
  } catch (err) {
    console.error('Tutor doubt error:', err);
    res.status(500).json({ error: 'Failed to clarify doubt: ' + err.message });
  }
});

router.post('/:id/tutor/summary', authenticate, async (req, res) => {
  try {
    const { transcript } = req.body;
    const loaded = await loadConceptWithNote(req.params.id, req.user.id);
    if (!loaded) return res.status(404).json({ error: 'Concept not found' });
    const result = await claudeService.tutorSummary(loaded.concept, transcript);
    res.json(result);
  } catch (err) {
    console.error('Tutor summary error:', err);
    res.status(500).json({ error: 'Failed to generate summary: ' + err.message });
  }
});

router.post('/:id/queue-for-review', authenticate, async (req, res) => {
  try {
    const { data: updated, error: updateError } = await supabase
      .from('review_items')
      .update({ due_date: new Date().toISOString() })
      .eq('concept_id', req.params.id)
      .eq('user_id', req.user.id)
      .select('id')
      .maybeSingle();

    if (updateError) throw updateError;

    if (updated) {
      return res.json({ success: true, review_item_id: updated.id });
    }

    // No review_items row exists yet for this concept (e.g. it was created
    // before the review_items upsert bug was fixed) — create one now instead
    // of failing, so "add to review" always works.
    const { data: concept } = await supabase
      .from('concepts')
      .select('id, complexity_score')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (!concept) return res.status(404).json({ error: 'Concept not found' });

    const reviewItem = fsrs.createReviewItem(concept.id, req.user.id, concept.complexity_score || 3, null);
    const { data: created, error: insertError } = await supabase
      .from('review_items')
      .insert({
        user_id: req.user.id,
        concept_id: concept.id,
        stability: reviewItem.stability,
        difficulty: reviewItem.difficulty,
        elapsed_days: reviewItem.elapsed_days,
        scheduled_days: reviewItem.scheduled_days,
        reps: reviewItem.reps,
        lapses: reviewItem.lapses,
        state: reviewItem.state,
        due_date: reviewItem.due_date,
      })
      .select('id')
      .single();

    if (insertError) throw insertError;
    res.json({ success: true, review_item_id: created.id });
  } catch (err) {
    console.error('Queue for review error:', err);
    res.status(500).json({ error: 'Failed to queue for review' });
  }
});

router.patch('/:id/mastery', authenticate, async (req, res) => {
  try {
    const { status } = req.body;
    if (!MASTERY_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid mastery status' });
    }
    const { error } = await supabase
      .from('concepts')
      .update({ mastery_status: status })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ success: true, mastery_status: status });
  } catch (err) {
    console.error('Update mastery error:', err);
    res.status(500).json({ error: 'Failed to update mastery status' });
  }
});

module.exports = router;
