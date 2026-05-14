import { useState, useRef, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Plus, GripVertical, Trash2, Hash, List, Code, Type, Quote, Minus } from 'lucide-react';

const BLOCK_TYPES = {
  paragraph: { icon: Type, label: 'Text', placeholder: 'Start writing...' },
  heading1: { icon: Hash, label: 'Heading 1', placeholder: 'Heading 1' },
  heading2: { icon: Hash, label: 'Heading 2', placeholder: 'Heading 2' },
  heading3: { icon: Hash, label: 'Heading 3', placeholder: 'Heading 3' },
  bullet: { icon: List, label: 'Bullet List', placeholder: 'List item' },
  numbered: { icon: List, label: 'Numbered List', placeholder: 'List item' },
  code: { icon: Code, label: 'Code', placeholder: 'Code block...' },
  quote: { icon: Quote, label: 'Quote', placeholder: 'Quote...' },
  divider: { icon: Minus, label: 'Divider', placeholder: '' },
};

function createBlock(type = 'paragraph', content = '') {
  return { id: uuidv4(), type, content };
}

export default function BlockEditor({ initialBlocks = [], onChange, readOnly = false }) {
  const [blocks, setBlocks] = useState(
    initialBlocks.length > 0 ? initialBlocks : [createBlock()]
  );
  const [focusedId, setFocusedId] = useState(null);
  const [showTypeMenu, setShowTypeMenu] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const inputRefs = useRef({});

  useEffect(() => {
    if (initialBlocks.length > 0) {
      setBlocks(initialBlocks);
    }
  }, []);

  const updateBlocks = useCallback((newBlocks) => {
    setBlocks(newBlocks);
    onChange?.(newBlocks);
  }, [onChange]);

  const updateBlock = (id, updates) => {
    const newBlocks = blocks.map((b) => (b.id === id ? { ...b, ...updates } : b));
    updateBlocks(newBlocks);
  };

  const addBlock = (afterId, type = 'paragraph') => {
    const idx = blocks.findIndex((b) => b.id === afterId);
    const newBlock = createBlock(type);
    const newBlocks = [...blocks.slice(0, idx + 1), newBlock, ...blocks.slice(idx + 1)];
    updateBlocks(newBlocks);
    setTimeout(() => {
      inputRefs.current[newBlock.id]?.focus();
      setFocusedId(newBlock.id);
    }, 50);
  };

  const deleteBlock = (id) => {
    if (blocks.length === 1) return;
    const idx = blocks.findIndex((b) => b.id === id);
    const newBlocks = blocks.filter((b) => b.id !== id);
    updateBlocks(newBlocks);
    const prevBlock = newBlocks[Math.max(0, idx - 1)];
    if (prevBlock) {
      setTimeout(() => {
        inputRefs.current[prevBlock.id]?.focus();
        setFocusedId(prevBlock.id);
      }, 50);
    }
  };

  const handleKeyDown = (e, block) => {
    if (readOnly) return;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      addBlock(block.id);
    } else if (e.key === 'Backspace' && block.content === '') {
      e.preventDefault();
      deleteBlock(block.id);
    } else if (e.key === '/') {
      setShowTypeMenu(block.id);
    } else {
      setShowTypeMenu(null);
    }
  };

  const handleTypeChange = (blockId, type) => {
    updateBlock(blockId, { type, content: blocks.find((b) => b.id === blockId)?.content || '' });
    setShowTypeMenu(null);
    setTimeout(() => inputRefs.current[blockId]?.focus(), 50);
  };

  // Drag-and-drop handlers
  const handleDragStart = (e, id) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    // Suppress the default ghost image so the whole row doesn't flash
    const ghost = document.createElement('div');
    ghost.style.opacity = '0';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => document.body.removeChild(ghost), 0);
  };

  const handleDragOver = (e, id) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (id !== dragOverId) setDragOverId(id);
  };

  const handleDrop = (e, targetId) => {
    e.preventDefault();
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
    const fromIdx = blocks.findIndex((b) => b.id === dragId);
    const toIdx = blocks.findIndex((b) => b.id === targetId);
    const newBlocks = [...blocks];
    const [moved] = newBlocks.splice(fromIdx, 1);
    newBlocks.splice(toIdx, 0, moved);
    updateBlocks(newBlocks);
    setDragId(null);
    setDragOverId(null);
  };

  const handleDragEnd = () => {
    setDragId(null);
    setDragOverId(null);
  };

  const getBlockClass = (type) => {
    switch (type) {
      case 'heading1': return 'text-2xl font-bold text-white';
      case 'heading2': return 'text-xl font-semibold text-white';
      case 'heading3': return 'text-lg font-medium text-gray-100';
      case 'code': return 'font-mono text-sm bg-navy-800 rounded p-3 text-green-300 border border-navy-600';
      case 'quote': return 'border-l-4 border-violet-500 pl-4 text-gray-300 italic';
      case 'bullet': return 'pl-4 before:content-["•"] before:mr-3 before:text-violet-400';
      case 'numbered': return 'pl-4 text-gray-200';
      default: return 'text-gray-200 leading-relaxed';
    }
  };

  return (
    <div className="space-y-1 min-h-[200px]">
      {blocks.map((block, idx) => {
        const isDragOver = dragOverId === block.id && dragId !== block.id;
        const isDragging = dragId === block.id;

        if (block.type === 'divider') {
          return (
            <div
              key={block.id}
              draggable={!readOnly}
              onDragStart={(e) => handleDragStart(e, block.id)}
              onDragOver={(e) => handleDragOver(e, block.id)}
              onDrop={(e) => handleDrop(e, block.id)}
              onDragEnd={handleDragEnd}
              className={`group flex items-center gap-2 py-2 transition-opacity ${isDragging ? 'opacity-30' : ''} ${isDragOver ? 'border-t-2 border-violet-500' : 'border-t-2 border-transparent'}`}
            >
              <hr className="flex-1 border-navy-600" />
              {!readOnly && (
                <button
                  onClick={() => deleteBlock(block.id)}
                  className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          );
        }

        return (
          <div
            key={block.id}
            draggable={!readOnly}
            onDragStart={(e) => handleDragStart(e, block.id)}
            onDragOver={(e) => handleDragOver(e, block.id)}
            onDrop={(e) => handleDrop(e, block.id)}
            onDragEnd={handleDragEnd}
            className={`group relative flex items-start gap-2 rounded-lg transition-all ${
              isDragging ? 'opacity-30' : ''
            } ${isDragOver ? 'border-t-2 border-violet-500' : 'border-t-2 border-transparent'}`}
          >
            {/* Block handle */}
            {!readOnly && (
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pt-1.5 flex-shrink-0">
                <button
                  className="text-gray-600 hover:text-gray-400 cursor-grab active:cursor-grabbing"
                  title="Drag to reorder"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <GripVertical size={14} />
                </button>
                <button
                  onClick={() => addBlock(block.id)}
                  className="text-gray-600 hover:text-violet-400 transition-colors"
                  title="Add block"
                >
                  <Plus size={14} />
                </button>
              </div>
            )}

            {/* Block content */}
            <div className="flex-1 relative">
              {block.type === 'numbered' && (
                <span className="text-violet-400 text-sm mr-2">{idx + 1}.</span>
              )}
              <textarea
                ref={(el) => { inputRefs.current[block.id] = el; }}
                value={block.content}
                onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                onFocus={() => setFocusedId(block.id)}
                onBlur={() => setFocusedId(null)}
                onKeyDown={(e) => handleKeyDown(e, block)}
                placeholder={
                  focusedId === block.id || !block.content
                    ? BLOCK_TYPES[block.type]?.placeholder
                    : ''
                }
                readOnly={readOnly}
                rows={1}
                className={`w-full bg-transparent resize-none focus:outline-none placeholder-gray-600
                           transition-colors duration-150 ${getBlockClass(block.type)}`}
                style={{
                  height: 'auto',
                  minHeight: '1.5rem',
                  overflow: 'hidden',
                }}
                onInput={(e) => {
                  e.target.style.height = 'auto';
                  e.target.style.height = e.target.scrollHeight + 'px';
                }}
              />

              {/* Type selector menu */}
              {showTypeMenu === block.id && !readOnly && (
                <div className="absolute top-8 left-0 z-50 bg-navy-800 border border-navy-600 rounded-xl shadow-xl p-2 w-48">
                  <p className="text-gray-500 text-xs px-2 pb-1">Block Type</p>
                  {Object.entries(BLOCK_TYPES).map(([type, config]) => (
                    <button
                      key={type}
                      onClick={() => handleTypeChange(block.id, type)}
                      className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg text-gray-300 hover:bg-navy-700 text-sm transition-colors"
                    >
                      <config.icon size={14} className="text-gray-500" />
                      {config.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Delete button */}
            {!readOnly && blocks.length > 1 && (
              <button
                onClick={() => deleteBlock(block.id)}
                className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all pt-1.5 flex-shrink-0"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        );
      })}

      {!readOnly && (
        <button
          onClick={() => addBlock(blocks[blocks.length - 1]?.id)}
          className="w-full flex items-center gap-2 px-2 py-2 text-gray-600 hover:text-gray-400 text-sm transition-colors rounded-lg hover:bg-navy-800/50"
        >
          <Plus size={14} />
          Add block
        </button>
      )}
    </div>
  );
}
