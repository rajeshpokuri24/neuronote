const express = require('express');
const multer = require('multer');
const path = require('path');
const supabase = require('../db');
const { authenticate } = require('../middleware/auth');
const claudeService = require('../services/claude');
const fsrs = require('../services/fsrs');
const embeddings = require('../services/embeddings');
const retrieval = require('../services/retrieval');
const conceptGraph = require('../services/conceptGraph');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.docx', '.doc', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only PDF, DOCX, DOC, and TXT files are supported'));
  },
});

// Search notes by title or tag (block content search requires pgvector RPC)
router.get('/search', authenticate, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);

    const [{ data: titleData }, { data: tagData }] = await Promise.all([
      supabase
        .from('notes')
        .select('id, title, tags, is_processed, created_at, updated_at')
        .eq('user_id', req.user.id)
        .ilike('title', `%${q}%`)
        .order('updated_at', { ascending: false })
        .limit(30),
      supabase
        .from('notes')
        .select('id, title, tags, is_processed, created_at, updated_at')
        .eq('user_id', req.user.id)
        .contains('tags', [q])
        .order('updated_at', { ascending: false })
        .limit(30),
    ]);

    const seen = new Set();
    const results = [...(titleData || []), ...(tagData || [])]
      .filter((n) => {
        if (seen.has(n.id)) return false;
        seen.add(n.id);
        return true;
      })
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .slice(0, 30);

    res.json(results);
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

router.get('/', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('notes')
      .select('id, title, tags, is_processed, created_at, updated_at, parent_id, blocks')
      .eq('user_id', req.user.id)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    // Compute block_count in JS (avoids jsonb_array_length which needs raw SQL)
    const notes = (data || []).map((n) => ({
      ...n,
      block_count: Array.isArray(n.blocks) ? n.blocks.length : 0,
      blocks: undefined,
    }));

    res.json(notes);
  } catch (err) {
    console.error('Get notes error:', err);
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const { data: note, error: noteError } = await supabase
      .from('notes')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (noteError || !note) {
      return res.status(404).json({ error: 'Note not found' });
    }

    const { data: conceptsData } = await supabase
      .from('concepts')
      .select('*')
      .eq('note_id', req.params.id)
      .eq('user_id', req.user.id);

    const conceptIds = (conceptsData || []).map((c) => c.id);
    let riMap = {};
    if (conceptIds.length > 0) {
      const { data: riData } = await supabase
        .from('review_items')
        .select('id, concept_id, state, due_date, reps, stability')
        .eq('user_id', req.user.id)
        .in('concept_id', conceptIds);
      (riData || []).forEach((ri) => { riMap[ri.concept_id] = ri; });
    }

    const concepts = (conceptsData || []).map((c) => ({
      ...c,
      review_item_id: riMap[c.id]?.id,
      state: riMap[c.id]?.state,
      due_date: riMap[c.id]?.due_date,
      reps: riMap[c.id]?.reps,
      stability: riMap[c.id]?.stability,
    }));

    res.json({ ...note, concepts });
  } catch (err) {
    console.error('Get note error:', err);
    res.status(500).json({ error: 'Failed to fetch note' });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { title, blocks, tags, parent_id } = req.body;

    if (parent_id) {
      const { data: parent } = await supabase
        .from('notes')
        .select('id')
        .eq('id', parent_id)
        .eq('user_id', req.user.id)
        .single();
      if (!parent) {
        return res.status(400).json({ error: 'Invalid parent note' });
      }
    }

    const { data, error } = await supabase
      .from('notes')
      .insert({
        user_id: req.user.id,
        title: title || 'Untitled',
        blocks: blocks || [],
        tags: tags || [],
        parent_id: parent_id || null,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('Create note error:', err);
    res.status(500).json({ error: err.message || 'Failed to create note' });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const { title, blocks, tags } = req.body;

    const updates = { updated_at: new Date().toISOString() };
    if (title) updates.title = title;
    if (blocks) {
      updates.blocks = blocks;
      updates.is_processed = false;
    }
    if (tags !== undefined) updates.tags = tags;

    const { data, error } = await supabase
      .from('notes')
      .update(updates)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Note not found' });
    }

    if (blocks) {
      await updateBacklinks(req.params.id, req.user.id, blocks).catch(() => {});
    }

    res.json(data);
  } catch (err) {
    console.error('Update note error:', err);
    res.status(500).json({ error: 'Failed to update note' });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { error } = await supabase
      .from('notes')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('Delete note error:', err);
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

router.post('/:id/upload', authenticate, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { data: note, error: noteError } = await supabase
      .from('notes')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (noteError || !note) {
      return res.status(404).json({ error: 'Note not found' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    let extractedText = '';

    if (ext === '.txt') {
      extractedText = req.file.buffer.toString('utf-8');
    } else if (ext === '.pdf') {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(req.file.buffer);
      extractedText = data.text;
    } else if (ext === '.docx' || ext === '.doc') {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ buffer: req.file.buffer });
      extractedText = result.value;
    }

    if (!extractedText.trim()) {
      return res.status(400).json({ error: 'Could not extract text from file' });
    }

    const lines = extractedText
      .split(/\n+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const newBlocks = lines.map((line, i) => ({
      id: `upload-${Date.now()}-${i}`,
      type: 'paragraph',
      content: line,
    }));

    const existingBlocks = Array.isArray(note.blocks) ? note.blocks : [];
    const separator = existingBlocks.length > 0
      ? [{ id: `sep-${Date.now()}`, type: 'divider', content: '' }]
      : [];

    const mergedBlocks = [...existingBlocks, ...separator, ...newBlocks];
    const filename = req.file.originalname.replace(/\.[^.]+$/, '');
    const newTitle = note.title === 'Untitled Note' ? filename : note.title;

    await supabase
      .from('notes')
      .update({
        blocks: mergedBlocks,
        title: newTitle,
        is_processed: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id);

    res.json({ success: true, blocks_added: newBlocks.length, title: newTitle, blocks: mergedBlocks });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to process file: ' + err.message });
  }
});

router.post('/:id/process', authenticate, async (req, res) => {
  try {
    const { data: note, error: noteError } = await supabase
      .from('notes')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (noteError || !note) {
      return res.status(404).json({ error: 'Note not found' });
    }

    const textContent = extractTextFromBlocks(note.blocks);
    if (!textContent.trim()) {
      return res.status(400).json({ error: 'Note has no content to process' });
    }

    const { data: userProfile } = await supabase
      .from('users')
      .select('learning_speed, content_domain, success_rate')
      .eq('id', req.user.id)
      .single();

    const extracted = await claudeService.extractConcepts(textContent, note.title);

    let chunksIndexed = 0;
    try {
      chunksIndexed = await retrieval.indexNoteChunks(req.user.id, note.id, textContent);
    } catch (e) {
      console.warn('[notes] chunk indexing failed (non-fatal):', e.message);
    }

    const savedConcepts = [];
    const dedupedConcepts = [];

    for (const concept of extracted.concepts) {
      const conceptText = `${concept.name}. ${concept.description || ''}`;
      const conceptVec = await embeddings.embed(conceptText);

      // Semantic dedup (no-op when vector search unavailable)
      let matched = null;
      if (conceptVec) {
        matched = await conceptGraph.findDuplicate(req.user.id, concept.name, concept.description);
      }

      // Literal name fallback dedup
      if (!matched) {
        const { data: literalMatch } = await supabase
          .from('concepts')
          .select('id, name')
          .eq('user_id', req.user.id)
          .ilike('name', concept.name)
          .limit(1);
        if (literalMatch && literalMatch.length > 0) {
          matched = { id: literalMatch[0].id, name: literalMatch[0].name };
        }
      }

      let conceptId;
      if (matched) {
        conceptId = matched.id;
        const update = {};
        if (concept.description) update.description = concept.description;
        if (concept.complexity_score) update.complexity_score = concept.complexity_score;
        if (conceptVec) update.embedding = embeddings.toPgVector(conceptVec);
        if (Object.keys(update).length > 0) {
          await supabase.from('concepts').update(update).eq('id', conceptId);
        }
        dedupedConcepts.push({ name: concept.name, matched_as: matched.name });
      } else {
        const { data: newConcept, error: conceptError } = await supabase
          .from('concepts')
          .insert({
            user_id: req.user.id,
            note_id: note.id,
            name: concept.name,
            description: concept.description,
            complexity_score: concept.complexity_score,
            related_concepts: concept.related_concepts || [],
            embedding: conceptVec ? embeddings.toPgVector(conceptVec) : null,
          })
          .select()
          .single();

        if (conceptError) {
          console.warn('[notes] concept insert error:', conceptError.message);
          continue;
        }

        conceptId = newConcept.id;
        savedConcepts.push(newConcept);

        const reviewItem = fsrs.createReviewItem(conceptId, req.user.id, concept.complexity_score, userProfile);
        await supabase.from('review_items').upsert(
          {
            user_id: req.user.id,
            concept_id: conceptId,
            stability: reviewItem.stability,
            difficulty: reviewItem.difficulty,
            elapsed_days: reviewItem.elapsed_days,
            scheduled_days: reviewItem.scheduled_days,
            reps: reviewItem.reps,
            lapses: reviewItem.lapses,
            state: reviewItem.state,
            due_date: reviewItem.due_date,
          },
          { onConflict: 'user_id,concept_id', ignoreDuplicates: true }
        );
      }

      if (conceptVec) {
        try {
          await conceptGraph.linkNeighbors(req.user.id, conceptId, conceptVec);
        } catch (e) {
          console.warn('[notes] linkNeighbors failed (non-fatal):', e.message);
        }
      }
    }

    await supabase
      .from('notes')
      .update({ is_processed: true, updated_at: new Date().toISOString() })
      .eq('id', note.id);

    // Fetch all concepts for this note with review item state
    const { data: allConceptsData } = await supabase
      .from('concepts')
      .select('*')
      .eq('note_id', note.id)
      .eq('user_id', req.user.id);

    const allConceptIds = (allConceptsData || []).map((c) => c.id);
    let finalRiMap = {};
    if (allConceptIds.length > 0) {
      const { data: riData } = await supabase
        .from('review_items')
        .select('id, concept_id, state')
        .eq('user_id', req.user.id)
        .in('concept_id', allConceptIds);
      (riData || []).forEach((ri) => { finalRiMap[ri.concept_id] = ri; });
    }

    const allConcepts = (allConceptsData || []).map((c) => ({
      ...c,
      review_item_id: finalRiMap[c.id]?.id,
      state: finalRiMap[c.id]?.state,
    }));

    res.json({
      success: true,
      concepts: allConcepts,
      summary: extracted.summary,
      new_review_items: savedConcepts.length,
      total_concepts: extracted.concepts.length,
      chunks_indexed: chunksIndexed,
      deduped: dedupedConcepts,
      vector_search_enabled: await retrieval.isVectorReady(),
    });
  } catch (err) {
    console.error('Process note error:', err);
    if (err.message?.includes('Groq') || err.status === 401) {
      return res.status(503).json({ error: 'AI service unavailable. Check GROQ_API_KEY.' });
    }
    if (err.status === 413 || err.message?.includes('TPM') || err.message?.includes('tokens per minute')) {
      return res.status(429).json({ error: 'Note is too large for AI processing. Try processing a smaller selection.' });
    }
    res.status(500).json({ error: 'Failed to process note: ' + err.message });
  }
});

router.get('/:id/children', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('notes')
      .select('id, title, tags, is_processed, updated_at, parent_id')
      .eq('user_id', req.user.id)
      .eq('parent_id', req.params.id)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Get children error:', err);
    res.status(500).json({ error: 'Failed to fetch sub-notes' });
  }
});

router.get('/:id/backlinks', authenticate, async (req, res) => {
  try {
    const { data: backlinksData } = await supabase
      .from('note_backlinks')
      .select('source_note_id')
      .eq('target_note_id', req.params.id);

    if (!backlinksData || backlinksData.length === 0) return res.json([]);

    const sourceIds = backlinksData.map((b) => b.source_note_id);
    const { data: notesData } = await supabase
      .from('notes')
      .select('id, title, updated_at')
      .in('id', sourceIds)
      .eq('user_id', req.user.id)
      .order('updated_at', { ascending: false });

    res.json(notesData || []);
  } catch (err) {
    console.error('Get backlinks error:', err);
    res.status(500).json({ error: 'Failed to fetch backlinks' });
  }
});

router.put('/:id/parent', authenticate, async (req, res) => {
  try {
    const { parent_id } = req.body;

    if (parent_id) {
      if (parent_id === req.params.id) {
        return res.status(400).json({ error: 'A note cannot be its own parent' });
      }
      const { data: parent } = await supabase
        .from('notes')
        .select('id')
        .eq('id', parent_id)
        .eq('user_id', req.user.id)
        .single();
      if (!parent) {
        return res.status(400).json({ error: 'Invalid parent note' });
      }
    }

    const { error } = await supabase
      .from('notes')
      .update({ parent_id: parent_id || null, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('Set parent error:', err);
    res.status(500).json({ error: 'Failed to set parent' });
  }
});

async function updateBacklinks(noteId, userId, blocks) {
  const text = extractTextFromBlocks(blocks);
  const wikiLinkPattern = /\[\[([^\]]+)\]\]/g;
  const titles = new Set();
  let match;
  while ((match = wikiLinkPattern.exec(text)) !== null) {
    titles.add(match[1].trim());
  }

  await supabase.from('note_backlinks').delete().eq('source_note_id', noteId);

  for (const title of titles) {
    const { data: targets } = await supabase
      .from('notes')
      .select('id')
      .eq('user_id', userId)
      .ilike('title', title)
      .limit(1);

    if (targets && targets.length > 0 && targets[0].id !== noteId) {
      await supabase.from('note_backlinks').upsert(
        { source_note_id: noteId, target_note_id: targets[0].id },
        { onConflict: 'source_note_id,target_note_id', ignoreDuplicates: true }
      );
    }
  }
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
