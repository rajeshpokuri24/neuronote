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

    const { data: historyData } = await supabase
      .from('chat_messages')
      .select('id, role, content')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(30);

    let chatHistory = (historyData || []).reverse();

    // Summarize old messages if history is long
    if (chatHistory.length > 20) {
      const toSummarize = chatHistory.slice(0, chatHistory.length - 10);
      const recent = chatHistory.slice(chatHistory.length - 10);
      try {
        const summaryText = toSummarize
          .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
          .join('\n');
        const summary = await claudeService.summarizeConversation(summaryText);
        chatHistory = [
          { role: 'system', content: `[Earlier conversation summary]: ${summary}` },
          ...recent,
        ];
        const oldIds = toSummarize.map((m) => m.id);
        if (oldIds.length > 0) {
          await supabase.from('chat_messages').delete().in('id', oldIds);
        }
      } catch {
        chatHistory = chatHistory.slice(-10);
      }
    }

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
    res.json({ success: true });
  } catch (err) {
    console.error('Clear chat error:', err);
    res.status(500).json({ error: 'Failed to clear chat history' });
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
