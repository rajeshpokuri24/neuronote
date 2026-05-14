import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Save, Sparkles, ArrowLeft, Tag, Loader, Check, Brain,
  Clock, Upload, RotateCcw, ChevronDown, ChevronUp, Download,
  GitBranch, Link2, Plus, X, FileText,
} from 'lucide-react';
import { notesAPI } from '../api';
import useStore from '../store/useStore';
import BlockEditor from '../components/Editor/BlockEditor';
import toast from 'react-hot-toast';

export default function NoteEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { updateNote } = useStore();

  const [note, setNote] = useState(null);
  const [title, setTitle] = useState('');
  const [blocks, setBlocks] = useState([]);
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [concepts, setConcepts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [saved, setSaved] = useState(true);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState('');
  const [uploading, setUploading] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  // Nested pages & backlinks
  const [subNotes, setSubNotes] = useState([]);
  const [backlinks, setBacklinks] = useState([]);
  const [showParentPicker, setShowParentPicker] = useState(false);
  const [parentNote, setParentNote] = useState(null);
  const [allNotes, setAllNotes] = useState([]);
  const saveTimer = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadNote();
  }, [id]);

  const loadNote = async () => {
    try {
      const [noteRes, childrenRes, backlinksRes, allNotesRes] = await Promise.all([
        notesAPI.getById(id),
        notesAPI.getChildren(id),
        notesAPI.getBacklinks(id),
        notesAPI.getAll(),
      ]);
      const n = noteRes.data;
      setNote(n);
      setTitle(n.title);
      setBlocks(n.blocks || []);
      setTags(n.tags || []);
      setConcepts(n.concepts || []);
      setSubNotes(childrenRes.data);
      setBacklinks(backlinksRes.data);
      setAllNotes(allNotesRes.data.filter((an) => an.id !== id));

      // Resolve parent note info
      if (n.parent_id) {
        const parent = allNotesRes.data.find((an) => an.id === n.parent_id);
        setParentNote(parent || null);
      }
    } catch {
      toast.error('Note not found');
      navigate('/notes');
    } finally {
      setLoading(false);
    }
  };

  const scheduleAutoSave = useCallback((newTitle, newBlocks, newTags) => {
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveNote(newTitle, newBlocks, newTags);
    }, 1500);
  }, []);

  const saveNote = async (t = title, b = blocks, tg = tags) => {
    if (saving) return;
    setSaving(true);
    try {
      await notesAPI.update(id, { title: t, blocks: b, tags: tg });
      updateNote(id, { title: t, blocks: b, tags: tg, updated_at: new Date().toISOString() });
      setSaved(true);
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleTitleChange = (e) => {
    setTitle(e.target.value);
    scheduleAutoSave(e.target.value, blocks, tags);
  };

  const handleBlocksChange = (newBlocks) => {
    setBlocks(newBlocks);
    scheduleAutoSave(title, newBlocks, tags);
  };

  const handleAddTag = (e) => {
    if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
      e.preventDefault();
      const newTag = tagInput.trim().replace(',', '');
      if (!tags.includes(newTag)) {
        const newTags = [...tags, newTag];
        setTags(newTags);
        scheduleAutoSave(title, blocks, newTags);
      }
      setTagInput('');
    }
  };

  const removeTag = (tag) => {
    const newTags = tags.filter((t) => t !== tag);
    setTags(newTags);
    scheduleAutoSave(title, blocks, newTags);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setUploading(true);
    try {
      await saveNote();
      const res = await notesAPI.upload(id, file);
      setBlocks(res.data.blocks);
      if (res.data.title !== title) setTitle(res.data.title);
      updateNote(id, { title: res.data.title, blocks: res.data.blocks, updated_at: new Date().toISOString() });
      setEditorKey((k) => k + 1); // Force BlockEditor remount with new blocks
      setSaved(true);
      toast.success(`Imported ${res.data.blocks_added} paragraphs from ${file.name}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to import file');
    } finally {
      setUploading(false);
    }
  };

  const handleSetParent = async (parentId) => {
    try {
      await notesAPI.setParent(id, parentId);
      const parent = parentId ? allNotes.find((n) => n.id === parentId) : null;
      setParentNote(parent || null);
      setShowParentPicker(false);
      toast.success(parentId ? `Moved under "${parent?.title}"` : 'Removed parent');
    } catch {
      toast.error('Failed to set parent');
    }
  };

  const createSubNote = async () => {
    try {
      const res = await notesAPI.create({
        title: 'Untitled Sub-note',
        blocks: [{ id: Date.now().toString(), type: 'paragraph', content: '' }],
        tags: [],
        parent_id: id,
      });
      navigate(`/notes/${res.data.id}`);
    } catch {
      toast.error('Failed to create sub-note');
    }
  };

  const processWithAI = async () => {
    setProcessing(true);
    try {
      // Save first
      await saveNote();
      const res = await notesAPI.process(id);
      setConcepts(res.data.concepts);
      setSummary(res.data.summary);
      toast.success(`Extracted ${res.data.new_review_items} new concepts! Ready to review.`);
      loadNote(); // Reload to get updated concepts
    } catch (err) {
      const msg = err.response?.data?.error || 'AI processing failed';
      toast.error(msg);
    } finally {
      setProcessing(false);
    }
  };

  const wordCount = blocks
    .map((b) => (typeof b.content === 'string' ? b.content : ''))
    .join(' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  const exportMarkdown = () => {
    const lines = [`# ${title}`, ''];
    if (tags.length > 0) {
      lines.push(`*Tags: ${tags.join(', ')}*`, '');
    }
    blocks.forEach((b) => {
      const c = b.content || '';
      if (b.type === 'heading1') lines.push(`# ${c}`, '');
      else if (b.type === 'heading2') lines.push(`## ${c}`, '');
      else if (b.type === 'heading3') lines.push(`### ${c}`, '');
      else if (b.type === 'bullet') lines.push(`- ${c}`);
      else if (b.type === 'numbered') lines.push(`1. ${c}`);
      else if (b.type === 'code') lines.push('```', c, '```', '');
      else if (b.type === 'quote') lines.push(`> ${c}`, '');
      else if (c) lines.push(c, '');
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'note'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getComplexityLabel = (score) => {
    return ['', 'Very Simple', 'Simple', 'Moderate', 'Complex', 'Very Complex'][score] || 'Unknown';
  };

  const getComplexityColor = (score) => {
    const colors = ['', 'text-green-400', 'text-blue-400', 'text-yellow-400', 'text-orange-400', 'text-red-400'];
    return colors[score] || 'text-gray-400';
  };

  const getStateColor = (state) => {
    const map = { new: 'badge-new', learning: 'badge-learning', review: 'badge-review', relearning: 'badge-relearning' };
    return map[state] || 'badge-new';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader size={24} className="text-violet-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Editor area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-3 p-4 border-b border-navy-700 bg-navy-900">
          <button
            onClick={() => navigate('/notes')}
            className="btn-ghost text-sm"
          >
            <ArrowLeft size={16} /> Notes
          </button>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.doc,.txt"
            onChange={handleFileUpload}
            className="hidden"
          />

          <div className="flex-1" />

          {/* Word count */}
          <span className="text-gray-600 text-xs hidden sm:block">
            {wordCount} word{wordCount !== 1 ? 's' : ''}
          </span>

          {/* Save status */}
          <div className="flex items-center gap-1.5 text-sm">
            {saving ? (
              <>
                <Loader size={14} className="text-gray-500 animate-spin" />
                <span className="text-gray-500">Saving...</span>
              </>
            ) : saved ? (
              <>
                <Check size={14} className="text-green-400" />
                <span className="text-gray-500">Saved</span>
              </>
            ) : (
              <>
                <Clock size={14} className="text-yellow-400" />
                <span className="text-gray-500">Unsaved</span>
              </>
            )}
          </div>

          <button
            onClick={() => setShowParentPicker((v) => !v)}
            className={`btn-ghost text-sm ${parentNote ? 'text-violet-400' : ''}`}
            title="Set parent note (nested pages)"
          >
            <GitBranch size={14} />
            <span className="hidden sm:inline">{parentNote ? 'Parent' : 'Nest'}</span>
          </button>

          <button
            onClick={exportMarkdown}
            className="btn-ghost text-sm"
            title="Export as Markdown"
          >
            <Download size={14} />
            <span className="hidden sm:inline">Export</span>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="btn-secondary text-sm"
            title="Import PDF, DOCX, or TXT"
          >
            {uploading ? (
              <Loader size={14} className="animate-spin" />
            ) : (
              <Upload size={14} />
            )}
            Import
          </button>

          <button
            onClick={() => saveNote()}
            className="btn-secondary text-sm"
            disabled={saving}
          >
            <Save size={14} /> Save
          </button>

          <button
            onClick={processWithAI}
            disabled={processing}
            className="btn-primary text-sm"
          >
            {processing ? (
              <Loader size={14} className="animate-spin" />
            ) : (
              <Sparkles size={14} />
            )}
            {processing ? 'Analyzing...' : 'Extract Concepts'}
          </button>
        </div>

        {/* Note content */}
        <div className="flex-1 overflow-auto p-8">
          <div className="max-w-3xl mx-auto">
            {/* Title */}
            <input
              value={title}
              onChange={handleTitleChange}
              placeholder="Untitled Note"
              className="w-full bg-transparent text-3xl font-bold text-white placeholder-gray-700
                         focus:outline-none mb-6 border-none"
            />

            {/* Tags */}
            <div className="flex flex-wrap gap-2 mb-6">
              {tags.map((tag) => (
                <span key={tag} className="flex items-center gap-1 badge bg-navy-700 text-gray-300 border border-navy-600">
                  <Tag size={10} />
                  {tag}
                  <button
                    onClick={() => removeTag(tag)}
                    className="hover:text-red-400 transition-colors ml-1"
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleAddTag}
                placeholder="Add tag..."
                className="bg-transparent text-sm text-gray-400 placeholder-gray-600 focus:outline-none w-24"
              />
            </div>

            {/* Breadcrumb: parent note */}
            {(parentNote || showParentPicker) && (
              <div className="flex items-center gap-2 mb-4 -mt-2">
                {parentNote && (
                  <button
                    onClick={() => navigate(`/notes/${parentNote.id}`)}
                    className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
                  >
                    <GitBranch size={11} />
                    {parentNote.title}
                  </button>
                )}
                <span className="text-gray-700 text-xs">/</span>
                <span className="text-gray-500 text-xs truncate">{title}</span>
              </div>
            )}

            {/* Parent picker */}
            {showParentPicker && (
              <div className="mb-5 p-3 bg-navy-800 border border-navy-600 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-gray-300 text-xs font-medium">Set parent note</p>
                  <button onClick={() => setShowParentPicker(false)} className="text-gray-600 hover:text-gray-400">
                    <X size={14} />
                  </button>
                </div>
                <div className="space-y-1 max-h-40 overflow-auto">
                  {parentNote && (
                    <button
                      onClick={() => handleSetParent(null)}
                      className="w-full text-left text-xs p-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      Remove parent (make top-level)
                    </button>
                  )}
                  {allNotes
                    .filter((n) => n.id !== note?.parent_id)
                    .map((n) => (
                      <button
                        key={n.id}
                        onClick={() => handleSetParent(n.id)}
                        className="w-full text-left text-xs p-2 rounded-lg text-gray-300 hover:bg-navy-700 transition-colors truncate"
                      >
                        {n.title}
                      </button>
                    ))}
                </div>
              </div>
            )}

            {/* AI Summary */}
            {summary && (
              <div className="bg-violet-600/10 border border-violet-500/20 rounded-xl p-4 mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <Brain size={14} className="text-violet-400" />
                  <span className="text-violet-300 text-sm font-medium">AI Summary</span>
                </div>
                <p className="text-gray-300 text-sm">{summary}</p>
              </div>
            )}

            {/* Block editor */}
            <BlockEditor
              key={editorKey}
              initialBlocks={blocks}
              onChange={handleBlocksChange}
            />

            {/* Sub-notes (nested pages) */}
            {(subNotes.length > 0 || true) && (
              <div className="mt-10 pt-6 border-t border-navy-700/60">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-gray-400 text-sm font-medium flex items-center gap-2">
                    <GitBranch size={14} className="text-violet-400" />
                    Sub-notes ({subNotes.length})
                  </h3>
                  <button
                    onClick={createSubNote}
                    className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
                  >
                    <Plus size={12} /> Add sub-note
                  </button>
                </div>
                {subNotes.length > 0 ? (
                  <div className="space-y-1">
                    {subNotes.map((sub) => (
                      <button
                        key={sub.id}
                        onClick={() => navigate(`/notes/${sub.id}`)}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-navy-800 hover:bg-navy-700 transition-colors text-left"
                      >
                        <FileText size={13} className="text-gray-500 flex-shrink-0" />
                        <span className="text-gray-200 text-sm">{sub.title}</span>
                        {sub.is_processed && <Sparkles size={11} className="text-violet-400 ml-auto" />}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-600 text-xs">
                    No sub-notes yet. Click "Add sub-note" or use the{' '}
                    <button
                      onClick={() => setShowParentPicker(true)}
                      className="text-violet-500 hover:text-violet-400 underline"
                    >
                      parent picker
                    </button>{' '}
                    in another note to nest it here.
                  </p>
                )}
              </div>
            )}

            {/* Backlinks (notes that reference this one with [[title]]) */}
            {backlinks.length > 0 && (
              <div className="mt-6 pt-6 border-t border-navy-700/60">
                <h3 className="text-gray-400 text-sm font-medium flex items-center gap-2 mb-3">
                  <Link2 size={14} className="text-blue-400" />
                  Backlinks ({backlinks.length})
                  <span className="text-gray-600 text-xs font-normal">— notes that reference this one</span>
                </h3>
                <div className="space-y-1">
                  {backlinks.map((bl) => (
                    <button
                      key={bl.id}
                      onClick={() => navigate(`/notes/${bl.id}`)}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/5 border border-blue-500/15 hover:bg-blue-500/10 transition-colors text-left"
                    >
                      <Link2 size={11} className="text-blue-500 flex-shrink-0" />
                      <span className="text-gray-300 text-sm">{bl.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Concepts sidebar */}
      {concepts.length > 0 && (
        <div className="w-72 border-l border-navy-700 bg-navy-900 flex flex-col">
          <div className="p-4 border-b border-navy-700 flex-shrink-0">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Brain size={14} className="text-violet-400" />
              Extracted Concepts ({concepts.length})
            </h2>
            <p className="text-gray-500 text-xs mt-1">Added to your review queue</p>
          </div>

          <div className="flex-1 overflow-auto p-3 space-y-2">
            {concepts.map((concept) => (
              <ConceptCard
                key={concept.id}
                concept={concept}
                getComplexityLabel={getComplexityLabel}
                getComplexityColor={getComplexityColor}
                getStateColor={getStateColor}
              />
            ))}
          </div>

          <div className="p-3 border-t border-navy-700 flex-shrink-0">
            <button
              onClick={() => navigate('/review')}
              className="btn-primary w-full justify-center text-sm"
            >
              <RotateCcw size={14} />
              Start Reviewing
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const COMPLEXITY_BG = {
  'text-green-400': 'bg-green-400',
  'text-blue-400': 'bg-blue-400',
  'text-yellow-400': 'bg-yellow-400',
  'text-orange-400': 'bg-orange-400',
  'text-red-400': 'bg-red-400',
};

function ConceptCard({ concept, getComplexityLabel, getComplexityColor, getStateColor }) {
  const [expanded, setExpanded] = useState(false);
  const colorClass = getComplexityColor(concept.complexity_score);
  const bgClass = COMPLEXITY_BG[colorClass] || 'bg-gray-400';

  return (
    <div className="bg-navy-800 rounded-lg border border-navy-700 overflow-hidden">
      <button
        className="w-full p-3 text-left hover:bg-navy-700/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-gray-200 text-sm font-medium leading-snug flex-1">{concept.name}</p>
          <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
            <span className={`${getStateColor(concept.state)} text-xs`}>{concept.state || 'new'}</span>
            {expanded ? <ChevronUp size={12} className="text-gray-500" /> : <ChevronDown size={12} className="text-gray-500" />}
          </div>
        </div>

        {/* Complexity dots */}
        <div className="flex items-center gap-2 mt-2">
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full ${i <= concept.complexity_score ? bgClass : 'bg-navy-600'}`}
              />
            ))}
          </div>
          <span className={`text-xs ${colorClass}`}>{getComplexityLabel(concept.complexity_score)}</span>
        </div>
      </button>

      {expanded && concept.description && (
        <div className="px-3 pb-3 border-t border-navy-700/50">
          <p className="text-gray-400 text-xs leading-relaxed mt-2">{concept.description}</p>
          {concept.related_concepts?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {concept.related_concepts.slice(0, 4).map((rc) => (
                <span key={rc} className="text-xs bg-navy-900 text-gray-500 px-1.5 py-0.5 rounded">
                  {rc}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
