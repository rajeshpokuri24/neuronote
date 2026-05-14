const express = require('express');
const supabase = require('../db');
const { authenticate } = require('../middleware/auth');
const claudeService = require('../services/claude');
const fsrs = require('../services/fsrs');
const contextForgetting = require('../services/contextForgetting');

const router = express.Router();

router.get('/due', authenticate, async (req, res) => {
  try {
    const now = new Date().toISOString();
    const { data: riData, error } = await supabase
      .from('review_items')
      .select('*')
      .eq('user_id', req.user.id)
      .or(`due_date.lte.${now},state.eq.new`)
      .limit(50);

    if (error) throw error;
    if (!riData || riData.length === 0) return res.json([]);

    const conceptIds = [...new Set(riData.map((ri) => ri.concept_id))];
    const { data: conceptsData } = await supabase
      .from('concepts')
      .select('id, name, description, complexity_score, related_concepts, note_id')
      .in('id', conceptIds);

    const noteIds = [...new Set((conceptsData || []).map((c) => c.note_id))];
    const { data: notesData } = noteIds.length > 0
      ? await supabase.from('notes').select('id, title, blocks').in('id', noteIds)
      : { data: [] };

    const cMap = {};
    (conceptsData || []).forEach((c) => { cMap[c.id] = c; });
    const nMap = {};
    (notesData || []).forEach((n) => { nMap[n.id] = n; });

    const items = riData
      .map((ri) => {
        const concept = cMap[ri.concept_id] || {};
        const note = nMap[concept.note_id] || {};
        return {
          ...ri,
          concept_name: concept.name,
          concept_description: concept.description,
          complexity_score: concept.complexity_score,
          related_concepts: concept.related_concepts,
          note_title: note.title,
          note_blocks: note.blocks,
          current_retention: fsrs.getCurrentRetention(ri),
        };
      })
      .sort((a, b) => {
        if (a.state === 'new' && b.state !== 'new') return -1;
        if (a.state !== 'new' && b.state === 'new') return 1;
        if (a.due_date < b.due_date) return -1;
        if (a.due_date > b.due_date) return 1;
        return (b.complexity_score || 0) - (a.complexity_score || 0);
      });

    res.json(items);
  } catch (err) {
    console.error('Get due items error:', err);
    res.status(500).json({ error: 'Failed to fetch review items' });
  }
});

router.get('/all', authenticate, async (req, res) => {
  try {
    const { data: riData, error } = await supabase
      .from('review_items')
      .select('*')
      .eq('user_id', req.user.id)
      .order('due_date', { ascending: true });

    if (error) throw error;
    if (!riData || riData.length === 0) return res.json([]);

    const conceptIds = [...new Set(riData.map((ri) => ri.concept_id))];
    const { data: conceptsData } = await supabase
      .from('concepts')
      .select('id, name, complexity_score, note_id, notes(title)')
      .in('id', conceptIds);

    const cMap = {};
    (conceptsData || []).forEach((c) => { cMap[c.id] = c; });

    const items = riData.map((ri) => {
      const concept = cMap[ri.concept_id] || {};
      return {
        ...ri,
        concept_name: concept.name,
        complexity_score: concept.complexity_score,
        note_title: concept.notes?.title,
        current_retention: fsrs.getCurrentRetention(ri),
      };
    });

    res.json(items);
  } catch (err) {
    console.error('Get all items error:', err);
    res.status(500).json({ error: 'Failed to fetch review items' });
  }
});

router.post('/:id/generate', authenticate, async (req, res) => {
  try {
    const { type } = req.body;

    const { data: riData, error } = await supabase
      .from('review_items')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (error || !riData) {
      return res.status(404).json({ error: 'Review item not found' });
    }

    const { data: conceptData } = await supabase
      .from('concepts')
      .select('name, description, complexity_score, related_concepts, note_id, notes(title, blocks)')
      .eq('id', riData.concept_id)
      .single();

    const item = {
      ...riData,
      concept_name: conceptData?.name,
      concept_description: conceptData?.description,
      complexity_score: conceptData?.complexity_score,
      related_concepts: conceptData?.related_concepts,
      note_blocks: conceptData?.notes?.blocks,
      note_title: conceptData?.notes?.title,
    };

    const noteText = extractTextFromBlocks(item.note_blocks);
    const concept = {
      name: item.concept_name,
      description: item.concept_description,
      complexity_score: item.complexity_score,
    };

    let content;
    let updateField;

    if (type === 'flashcard') {
      if (item.flashcards && item.flashcards.length > 0) {
        return res.json({ type: 'flashcard', content: item.flashcards });
      }
      content = await claudeService.generateFlashcards(concept, noteText);
      updateField = 'flashcards';
    } else if (type === 'quiz') {
      if (item.quiz_questions && item.quiz_questions.length > 0) {
        return res.json({ type: 'quiz', content: item.quiz_questions });
      }
      content = await claudeService.generateQuiz(concept, noteText);
      updateField = 'quiz_questions';
    } else if (type === 'cloze') {
      if (item.cloze_cards && item.cloze_cards.length > 0) {
        return res.json({ type: 'cloze', content: item.cloze_cards });
      }
      content = await claudeService.generateCloze(concept, noteText);
      updateField = 'cloze_cards';
    } else if (type === 'mindmap') {
      if (item.mind_map_data && item.mind_map_data.nodes) {
        return res.json({ type: 'mindmap', content: item.mind_map_data });
      }
      const relatedConcepts = item.related_concepts
        ? item.related_concepts.map((name) => ({ name }))
        : [];
      content = await claudeService.generateMindMap(concept, relatedConcepts, noteText);
      updateField = 'mind_map_data';
    } else {
      return res.status(400).json({ error: 'Invalid review type' });
    }

    await supabase
      .from('review_items')
      .update({ [updateField]: content, updated_at: new Date().toISOString() })
      .eq('id', req.params.id);

    res.json({ type, content });
  } catch (err) {
    console.error('Generate review content error:', err);
    if (err.message?.includes('GROQ_API_KEY') || err.status === 401) {
      return res.status(503).json({ error: 'AI service unavailable. Check GROQ_API_KEY.' });
    }
    res.status(500).json({ error: 'Failed to generate review content: ' + err.message });
  }
});

router.post('/:id/submit', authenticate, async (req, res) => {
  try {
    const { grade, review_type, response_time_ms } = req.body;

    if (!grade || grade < 1 || grade > 4) {
      return res.status(400).json({ error: 'Grade must be 1-4' });
    }

    const [{ data: riData, error: riError }, { data: userData }] = await Promise.all([
      supabase
        .from('review_items')
        .select('*, concepts(complexity_score)')
        .eq('id', req.params.id)
        .eq('user_id', req.user.id)
        .single(),
      supabase
        .from('users')
        .select('fsrs_w, desired_retention, sleep_study_habit')
        .eq('id', req.user.id)
        .single(),
    ]);

    if (riError || !riData) {
      return res.status(404).json({ error: 'Review item not found' });
    }

    const item = { ...riData, complexity_score: riData.concepts?.complexity_score };
    const w = userData?.fsrs_w || fsrs.DEFAULT_W;
    const desiredRetention = userData?.desired_retention || 0.9;

    const newState = fsrs.schedule(item, grade, w, desiredRetention);

    // BKT-FSRS blend
    const bktPrevPKnow = item.bkt_p_know || 0.0;
    if (newState.scheduled_days > 1 && bktPrevPKnow > 0) {
      const blendFactor = 1 + (bktPrevPKnow - 0.5) * 0.4;
      newState.scheduled_days = Math.max(1, Math.round(newState.scheduled_days * blendFactor));
      const bktAdjustedDue = new Date();
      bktAdjustedDue.setDate(bktAdjustedDue.getDate() + newState.scheduled_days);
      newState.due_date = bktAdjustedDue;
    }

    // Context-aware forgetting modifier
    if (newState.scheduled_days > 1) {
      try {
        const cf = await contextForgetting.getContextFactor(req.user.id, userData, item.concept_id);
        newState.scheduled_days = contextForgetting.applyContextFactor(newState.scheduled_days, cf);
        const adjustedDue = new Date();
        adjustedDue.setDate(adjustedDue.getDate() + newState.scheduled_days);
        newState.due_date = adjustedDue;
        newState.context_factor = cf;
      } catch { /* non-fatal */ }
    }

    // Update review item
    const riUpdate = {
      stability: newState.stability,
      difficulty: newState.difficulty,
      elapsed_days: newState.elapsed_days,
      scheduled_days: newState.scheduled_days,
      reps: newState.reps,
      lapses: newState.lapses,
      state: newState.state,
      due_date: newState.due_date,
      last_review: newState.last_review,
      updated_at: new Date().toISOString(),
    };
    if (grade === 1) {
      riUpdate.flashcards = [];
      riUpdate.quiz_questions = [];
      riUpdate.cloze_cards = [];
    }

    // BKT mastery update
    const P_LEARN = 0.3, P_SLIP = 0.1, P_GUESS = 0.25;
    const correct = grade >= 2 ? 1 : 0;
    const pCorrectKnow = 1 - P_SLIP;
    const pCorrectNotKnow = P_GUESS;
    const likelihood = correct ? pCorrectKnow : (1 - pCorrectKnow);
    const likelihoodNot = correct ? pCorrectNotKnow : (1 - pCorrectNotKnow);
    const denom = bktPrevPKnow * likelihood + (1 - bktPrevPKnow) * likelihoodNot;
    const pKnowGivenEv = denom > 0 ? (bktPrevPKnow * likelihood) / denom : bktPrevPKnow;
    const newBktPKnow = Math.min(1, pKnowGivenEv + (1 - pKnowGivenEv) * P_LEARN);
    riUpdate.bkt_p_know = parseFloat(newBktPKnow.toFixed(4));

    const now2 = new Date();

    await Promise.all([
      supabase.from('review_items').update(riUpdate).eq('id', req.params.id),
      supabase.from('review_sessions').insert({
        user_id: req.user.id,
        review_item_id: req.params.id,
        review_type: review_type || 'flashcard',
        grade,
        response_time_ms: response_time_ms || null,
      }),
      supabase.from('study_events').insert({
        user_id: req.user.id,
        event_type: 'review_session',
        hour_of_day: now2.getHours(),
        day_of_week: now2.getDay(),
      }),
    ]);

    // Update user success rate (rolling 7-day average)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: sessionData } = await supabase
      .from('review_sessions')
      .select('grade')
      .eq('user_id', req.user.id)
      .gte('created_at', sevenDaysAgo);

    const grades = (sessionData || []).map((s) => s.grade);
    const avgGrade = grades.length > 0 ? grades.reduce((a, b) => a + b, 0) / grades.length : 3;
    const successRate = Math.min(1, Math.max(0, (avgGrade - 1) / 3));

    await supabase
      .from('users')
      .update({ success_rate: parseFloat(successRate.toFixed(3)), updated_at: new Date().toISOString() })
      .eq('id', req.user.id);

    res.json({
      ...newState,
      next_review: newState.due_date,
      message: getGradeMessage(grade, newState.scheduled_days),
    });
  } catch (err) {
    console.error('Submit review error:', err);
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

router.get('/forecast', authenticate, async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days, 10) || 14, 60);
    const from = new Date().toISOString();
    const to = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    const { data: riData } = await supabase
      .from('review_items')
      .select('due_date, state, difficulty')
      .eq('user_id', req.user.id)
      .gte('due_date', from)
      .lte('due_date', to);

    const dayMap = {};
    (riData || []).forEach((item) => {
      const dateStr = item.due_date.split('T')[0];
      if (!dayMap[dateStr]) {
        dayMap[dateStr] = { count: 0, difficulties: [], new_count: 0, learning_count: 0, review_count: 0 };
      }
      dayMap[dateStr].count++;
      dayMap[dateStr].difficulties.push(item.difficulty || 0);
      if (item.state === 'new') dayMap[dateStr].new_count++;
      else if (item.state === 'learning' || item.state === 'relearning') dayMap[dateStr].learning_count++;
      else if (item.state === 'review') dayMap[dateStr].review_count++;
    });

    const forecast = Array.from({ length: days }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const day = dayMap[dateStr];
      return {
        date: dateStr,
        count: day?.count || 0,
        avg_difficulty: day
          ? parseFloat((day.difficulties.reduce((a, b) => a + b, 0) / day.difficulties.length).toFixed(2))
          : 0,
        new_count: day?.new_count || 0,
        learning_count: day?.learning_count || 0,
        review_count: day?.review_count || 0,
      };
    });

    res.json({ forecast, days });
  } catch (err) {
    console.error('Forecast error:', err);
    res.status(500).json({ error: 'Failed to generate forecast' });
  }
});

router.get('/history', authenticate, async (req, res) => {
  try {
    const { data: sessionsData } = await supabase
      .from('review_sessions')
      .select('*, review_item_id')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (!sessionsData || sessionsData.length === 0) return res.json([]);

    const riIds = sessionsData.map((s) => s.review_item_id);
    const { data: riData } = await supabase
      .from('review_items')
      .select('id, state, concepts(name)')
      .in('id', riIds);

    const riMap = {};
    (riData || []).forEach((ri) => { riMap[ri.id] = ri; });

    const result = sessionsData.map((s) => ({
      ...s,
      concept_name: riMap[s.review_item_id]?.concepts?.name,
      state: riMap[s.review_item_id]?.state,
    }));

    res.json(result);
  } catch (err) {
    console.error('Get history error:', err);
    res.status(500).json({ error: 'Failed to fetch review history' });
  }
});

function getGradeMessage(grade, days) {
  const messages = {
    1: `Don't worry! We'll review this again soon.`,
    2: `Getting there! Next review in ${days} day${days > 1 ? 's' : ''}.`,
    3: `Good work! Next review in ${days} day${days > 1 ? 's' : ''}.`,
    4: `Excellent! You've got this. Next review in ${days} day${days > 1 ? 's' : ''}.`,
  };
  return messages[grade];
}

function extractTextFromBlocks(blocks) {
  if (!blocks || !Array.isArray(blocks)) return '';
  return blocks
    .map((block) => {
      if (typeof block.content === 'string') return block.content;
      if (Array.isArray(block.content)) return block.content.map((c) => c.text || '').join(' ');
      return '';
    })
    .join('\n');
}

module.exports = router;
