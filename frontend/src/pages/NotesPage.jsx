import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Search, BookOpen, Trash2, Sparkles, Tag, Clock,
  X, List, GitBranch, ChevronRight, ChevronDown,
} from 'lucide-react';
import { notesAPI } from '../api';
import useStore from '../store/useStore';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';

export default function NotesPage() {
  const { notes, setNotes, addNote, removeNote } = useStore();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [activeTag, setActiveTag] = useState(null);
  const [creating, setCreating] = useState(false);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'tree'
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const navigate = useNavigate();

  const allTags = useMemo(() => {
    const tagSet = new Set();
    notes.forEach((n) => (n.tags || []).forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [notes]);

  useEffect(() => { loadNotes(); }, []);

  const loadNotes = async () => {
    try {
      const res = await notesAPI.getAll();
      setNotes(res.data);
    } catch {
      toast.error('Failed to load notes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (search.trim().length < 2) { setSearchResults(null); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await notesAPI.search(search.trim());
        setSearchResults(res.data);
      } catch {
        setSearchResults(null);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const createNote = async (parentId = null) => {
    setCreating(true);
    try {
      const res = await notesAPI.create({
        title: 'Untitled Note',
        blocks: [{ id: Date.now().toString(), type: 'paragraph', content: '' }],
        tags: [],
        parent_id: parentId,
      });
      addNote(res.data);
      navigate(`/notes/${res.data.id}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create note');
      setCreating(false);
    }
  };

  const deleteNote = async (e, id) => {
    e.stopPropagation();
    if (!confirm('Delete this note? This will also remove related review items.')) return;
    try {
      await notesAPI.delete(id);
      removeNote(id);
      toast.success('Note deleted');
    } catch {
      toast.error('Failed to delete note');
    }
  };

  const toggleExpanded = useCallback((id) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Build tree structure from flat list
  const tree = useMemo(() => {
    const childrenMap = {};
    const roots = [];
    notes.forEach((n) => {
      if (n.parent_id) {
        if (!childrenMap[n.parent_id]) childrenMap[n.parent_id] = [];
        childrenMap[n.parent_id].push(n);
      } else {
        roots.push(n);
      }
    });
    return { roots, childrenMap };
  }, [notes]);

  const baseList = searchResults !== null ? searchResults : notes;
  const filtered = baseList.filter((n) => {
    if (searchResults !== null) return !activeTag || (n.tags || []).includes(activeTag);
    const matchesSearch = !search.trim() ||
      n.title.toLowerCase().includes(search.toLowerCase()) ||
      (n.tags || []).some((t) => t.toLowerCase().includes(search.toLowerCase()));
    const matchesTag = !activeTag || (n.tags || []).includes(activeTag);
    return matchesSearch && matchesTag;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-violet-600/30 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }

  const isSearching = search.trim().length >= 2 || activeTag;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BookOpen size={24} className="text-violet-400" />
            My Notes
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">{notes.length} notes</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          {!isSearching && (
            <div className="flex rounded-lg overflow-hidden border border-navy-700">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 transition-colors ${viewMode === 'grid' ? 'bg-violet-600/30 text-violet-300' : 'text-gray-500 hover:text-gray-300'}`}
                title="Grid view"
              >
                <List size={16} />
              </button>
              <button
                onClick={() => setViewMode('tree')}
                className={`p-2 transition-colors ${viewMode === 'tree' ? 'bg-violet-600/30 text-violet-300' : 'text-gray-500 hover:text-gray-300'}`}
                title="Tree view (nested pages)"
              >
                <GitBranch size={16} />
              </button>
            </div>
          )}
          <button onClick={() => createNote()} disabled={creating} className="btn-primary">
            {creating
              ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <Plus size={16} />}
            New Note
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          placeholder="Search notes, content and tags..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input pl-9 pr-9"
        />
        {searching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-violet-600/30 border-t-violet-500 rounded-full animate-spin" />
          </div>
        )}
        {search && !searching && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Tag filter chips */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5 -mt-2">
          {activeTag && (
            <button
              onClick={() => setActiveTag(null)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-violet-600/20 text-violet-300 border border-violet-500/40"
            >
              <X size={10} /> Clear
            </button>
          )}
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs transition-all ${
                activeTag === tag
                  ? 'bg-violet-600 text-white border border-violet-500'
                  : 'bg-navy-800 text-gray-400 border border-navy-600 hover:border-navy-500'
              }`}
            >
              <Tag size={9} /> {tag}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {notes.length === 0 ? (
        <div className="text-center py-16">
          <BookOpen size={48} className="text-gray-700 mx-auto mb-4" />
          <h2 className="text-white font-semibold text-lg">No notes yet</h2>
          <p className="text-gray-400 text-sm mt-2 mb-6">Create your first note to start your learning journey</p>
          <button onClick={() => createNote()} className="btn-primary mx-auto">
            <Plus size={16} /> Create First Note
          </button>
        </div>
      ) : isSearching || viewMode === 'grid' ? (
        // Grid view
        filtered.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen size={48} className="text-gray-700 mx-auto mb-4" />
            <h2 className="text-white font-semibold text-lg">No notes match</h2>
            <p className="text-gray-400 text-sm mt-2">
              {searchResults !== null ? 'No notes found with that content' : 'Try a different search term'}
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((note) => (
              <NoteCard key={note.id} note={note} onOpen={() => navigate(`/notes/${note.id}`)} onDelete={deleteNote} />
            ))}
          </div>
        )
      ) : (
        // Tree view
        <div className="space-y-1">
          <p className="text-gray-500 text-xs mb-3 flex items-center gap-1.5">
            <GitBranch size={11} /> Nested page hierarchy — drag a note into another to create sub-pages
          </p>
          {tree.roots.map((note) => (
            <TreeNode
              key={note.id}
              note={note}
              childrenMap={tree.childrenMap}
              expandedNodes={expandedNodes}
              onToggle={toggleExpanded}
              onOpen={(id) => navigate(`/notes/${id}`)}
              onDelete={deleteNote}
              onCreateChild={(id) => createNote(id)}
              depth={0}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NoteCard({ note, onOpen, onDelete }) {
  return (
    <div
      onClick={onOpen}
      className="card-hover group relative cursor-pointer"
    >
      {note.is_processed && (
        <div className="absolute top-3 right-3">
          <Sparkles size={14} className="text-violet-400" />
        </div>
      )}
      <h3 className="text-white font-medium mb-2 pr-6 line-clamp-2">{note.title}</h3>
      {note.tags && note.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {note.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="flex items-center gap-0.5 text-xs bg-navy-700 text-gray-400 px-1.5 py-0.5 rounded">
              <Tag size={10} /> {tag}
            </span>
          ))}
          {note.tags.length > 3 && <span className="text-xs text-gray-600">+{note.tags.length - 3}</span>}
        </div>
      )}
      <div className="flex items-center justify-between mt-auto">
        <span className="flex items-center gap-1 text-gray-500 text-xs">
          <Clock size={10} />
          {formatDistanceToNow(new Date(note.updated_at), { addSuffix: true })}
        </span>
        <button
          onClick={(e) => onDelete(e, note.id)}
          className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all p-1"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

function TreeNode({ note, childrenMap, expandedNodes, onToggle, onOpen, onDelete, onCreateChild, depth }) {
  const children = childrenMap[note.id] || [];
  const hasChildren = children.length > 0;
  const isExpanded = expandedNodes.has(note.id);

  return (
    <div>
      <div
        className={`flex items-center gap-2 group rounded-lg px-3 py-2.5 hover:bg-navy-800 cursor-pointer transition-colors ${
          depth > 0 ? 'ml-6 border-l border-navy-700 pl-4' : ''
        }`}
      >
        {/* Expand toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(note.id); }}
          className={`w-5 h-5 flex items-center justify-center flex-shrink-0 ${
            hasChildren ? 'text-gray-400 hover:text-gray-200' : 'text-transparent cursor-default'
          }`}
        >
          {hasChildren
            ? isExpanded
              ? <ChevronDown size={14} />
              : <ChevronRight size={14} />
            : <span className="w-1.5 h-1.5 rounded-full bg-navy-600 inline-block" />
          }
        </button>

        {/* Note info */}
        <div
          className="flex-1 min-w-0"
          onClick={() => onOpen(note.id)}
        >
          <div className="flex items-center gap-2">
            <span className="text-gray-200 text-sm font-medium truncate">{note.title}</span>
            {note.is_processed && <Sparkles size={11} className="text-violet-400 flex-shrink-0" />}
          </div>
          {note.tags && note.tags.length > 0 && (
            <div className="flex gap-1 mt-0.5">
              {note.tags.slice(0, 2).map((tag) => (
                <span key={tag} className="text-xs text-gray-600 bg-navy-900 px-1.5 py-0.5 rounded">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onCreateChild(note.id); }}
            className="p-1 text-gray-500 hover:text-violet-400 transition-colors"
            title="Add sub-note"
          >
            <Plus size={13} />
          </button>
          <button
            onClick={(e) => onDelete(e, note.id)}
            className="p-1 text-gray-500 hover:text-red-400 transition-colors"
            title="Delete note"
          >
            <Trash2 size={13} />
          </button>
        </div>

        <span className="text-gray-600 text-xs flex-shrink-0 hidden sm:block">
          {formatDistanceToNow(new Date(note.updated_at), { addSuffix: true })}
        </span>
      </div>

      {/* Children */}
      {isExpanded && hasChildren && (
        <div>
          {children.map((child) => (
            <TreeNode
              key={child.id}
              note={child}
              childrenMap={childrenMap}
              expandedNodes={expandedNodes}
              onToggle={onToggle}
              onOpen={onOpen}
              onDelete={onDelete}
              onCreateChild={onCreateChild}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
