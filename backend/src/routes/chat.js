const express = require('express');
const supabase = require('../db');
const { authenticate } = require('../middleware/auth');
const claudeService = require('../services/claude');
const retrieval = require('../services/retrieval');

const router = express.Router();

router.post('/message', authenticate, async (req, res) => {
  try {
    const { message, note_ids } = req.body;
    if (!message?.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const { data: userProfile } = await supabase
      .from('users')
      .select('name, learning_speed, content_domain, success_rate')
      .eq('id', req.user.id)
      .single();

    const { data: summaryRow } = await supabase
      .from('chat_summaries')
      .select('summary_text, covered_through_at')
      .eq('user_id', req.user.id)
      .maybeSingle();

    let historyQuery = supabase
      .from('chat_messages')
      .select('id, role, content, created_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: true });
    if (summaryRow?.covered_through_at) {
      historyQuery = historyQuery.gt('created_at', summaryRow.covered_through_at);
    }
    const { data: uncoveredData } = await historyQuery;
    let uncovered = uncoveredData || [];

    // Raw history is never deleted (GET /history always shows everything);
    // only the LLM-facing context gets compacted into a rolling summary.
    let summaryText = summaryRow?.summary_text || '';

    if (uncovered.length > 20) {
      const toSummarize = uncovered.slice(0, uncovered.length - 10);
      const recent = uncovered.slice(uncovered.length - 10);
      try {
        const batchText = toSummarize
          .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
          .join('\n');
        summaryText = await claudeService.summarizeConversation(batchText, summaryText);
        const coveredThroughAt = toSummarize[toSummarize.length - 1].created_at;

        await supabase.from('chat_summaries').upsert(
          { user_id: req.user.id, summary_text: summaryText, covered_through_at: coveredThroughAt, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        );

        uncovered = recent;
      } catch {
        uncovered = uncovered.slice(-10);
      }
    }

    const chatHistory = summaryText
      ? [{ role: 'system', content: `[Earlier conversation summary]: ${summaryText}` }, ...uncovered]
      : uncovered;

    let notesContext = '';
    let ragSources = [];

    if (note_ids && note_ids.length > 0) {
      const { data: notesData } = await supabase
        .from('notes')
        .select('title, blocks')
        .in('id', note_ids)
        .eq('user_id', req.user.id);

      notesContext = (notesData || [])
        .map((n) => `NOTE: ${n.title}\n${extractTextFromBlocks(n.blocks)}`)
        .join('\n\n');
    } else {
      const rag = await retrieval.buildChatContext(req.user.id, message, {
        charBudget: 5000,
        topK: 6,
      });
      if (rag.text) {
        notesContext = rag.text;
        ragSources = rag.sources;
      } else {
        const { data: recentNotes } = await supabase
          .from('notes')
          .select('title, blocks')
          .eq('user_id', req.user.id)
          .order('updated_at', { ascending: false })
          .limit(3);

        notesContext = (recentNotes || [])
          .map((n) => `NOTE: ${n.title}\n${extractTextFromBlocks(n.blocks)}`)
          .join('\n\n');
      }
    }

    const now = new Date().toISOString();
    const { data: dueData } = await supabase
      .from('review_items')
      .select('concepts(name)')
      .eq('user_id', req.user.id)
      .or(`due_date.lte.${now},state.eq.new`)
      .limit(5);

    const dueNames = (dueData || []).map((ri) => ri.concepts?.name).filter(Boolean);
    const dueContext = dueNames.length > 0
      ? `\nItems due for review: ${dueNames.join(', ')}`
      : '';

    const fullContext = notesContext + dueContext;
    const messages = [...chatHistory, { role: 'user', content: message }];
    const response = await claudeService.chat(messages, fullContext, userProfile);

    await supabase.from('chat_messages').insert([
      {
        user_id: req.user.id,
        role: 'user',
        content: message,
        context_note_ids: Array.isArray(note_ids) && note_ids.length ? note_ids : [],
      },
      {
        user_id: req.user.id,
        role: 'assistant',
        content: response,
        context_note_ids: Array.isArray(note_ids) && note_ids.length ? note_ids : [],
      },
    ]);

    res.json({ message: response, sources: ragSources });
  } catch (err) {
    console.error('Chat error:', err);
    if (err.status === 401 || err.message?.includes('API_KEY')) {
      return res.status(503).json({ error: 'AI service unavailable. Check GROQ_API_KEY.' });
    }
    res.status(500).json({ error: 'Failed to get AI response' });
  }
});

router.get('/history', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('id, role, content, created_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: true })
      .limit(100);

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Get chat history error:', err);
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

router.delete('/history', authenticate, async (req, res) => {
  try {
    const { error } = await supabase
      .from('chat_messages')
      .delete()
      .eq('user_id', req.user.id);
    if (error) throw error;

    await supabase.from('chat_summaries').delete().eq('user_id', req.user.id);

    res.json({ success: true });
  } catch (err) {
    console.error('Clear chat error:', err);
    res.status(500).json({ error: 'Failed to clear chat history' });
  }
});

router.get('/summary', authenticate, async (req, res) => {
  try {
    const { data } = await supabase
      .from('chat_summaries')
      .select('covered_through_at')
      .eq('user_id', req.user.id)
      .maybeSingle();

    res.json({ has_summary: !!data, covered_through_at: data?.covered_through_at || null });
  } catch (err) {
    console.error('Get chat summary error:', err);
    res.status(500).json({ error: 'Failed to fetch summary status' });
  }
});

router.get('/briefing', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date().toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [{ data: dueData }, { data: profileData }, { count: sessionCount }] = await Promise.all([
      supabase
        .from('review_items')
        .select('concepts(name)')
        .eq('user_id', userId)
        .or(`due_date.lte.${now},state.eq.new`)
        .order('due_date', { ascending: true })
        .limit(10),
      supabase
        .from('users')
        .select('learning_speed, success_rate, content_domain')
        .eq('id', userId)
        .single(),
      supabase
        .from('review_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', sevenDaysAgo),
    ]);

    const dueItems = (dueData || []).map((ri) => ({ concept_name: ri.concepts?.name }));
    const briefing = await claudeService.generateStudyBriefing(
      dueItems,
      profileData,
      `${sessionCount || 0} reviews completed this week`
    );

    res.json({ briefing, due_count: dueItems.length });
  } catch (err) {
    console.error('Briefing error:', err);
    res.status(500).json({ error: 'Failed to generate briefing' });
  }
});

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
