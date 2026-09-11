import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background, Controls, MiniMap,
  useNodesState, useEdgesState,
  MarkerType, Panel,
} from '@xyflow/react';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force';
import '@xyflow/react/dist/style.css';
import { Share2, Loader, Info, Wifi, WifiOff, Sparkles, Search, X } from 'lucide-react';
import { conceptsAPI } from '../api';
import toast from 'react-hot-toast';

// Force-directed layout: connected concepts cluster together, unconnected
// ones drift outward — reads as a real graph instead of an arbitrary circle.
function layoutWithForces(rawNodes, rawEdges) {
  const degree = {};
  rawEdges.forEach((e) => {
    degree[e.source] = (degree[e.source] || 0) + 1;
    degree[e.target] = (degree[e.target] || 0) + 1;
  });

  const simNodes = rawNodes.map((n) => ({ id: n.id }));
  const simLinks = rawEdges.map((e) => ({ source: e.source, target: e.target, weight: e.data?.weight || 0.4 }));

  const simulation = forceSimulation(simNodes)
    .force('link', forceLink(simLinks).id((d) => d.id).distance((l) => 260 - l.weight * 140).strength((l) => l.weight))
    .force('charge', forceManyBody().strength(-350))
    .force('center', forceCenter(0, 0))
    .force('collide', forceCollide(70))
    .stop();

  for (let i = 0; i < 300; i++) simulation.tick();

  const posById = {};
  simNodes.forEach((n) => { posById[n.id] = { x: n.x, y: n.y }; });
  return { posById, degree };
}

const STATE_COLORS = {
  new: '#8b5cf6',
  learning: '#f59e0b',
  review: '#10b981',
  relearning: '#ef4444',
};

// One color per source note, so clusters read as topics at a glance instead
// of everything being the same shade.
const NOTE_PALETTE = [
  '#38bdf8', '#f472b6', '#a3e635', '#fb923c', '#c084fc',
  '#2dd4bf', '#fbbf24', '#60a5fa', '#f87171', '#4ade80',
];

function buildNoteColorMap(rawNodes) {
  const map = {};
  let i = 0;
  rawNodes.forEach((n) => {
    const noteId = n.data?.note_id || 'unassigned';
    if (!map[noteId]) {
      map[noteId] = NOTE_PALETTE[i % NOTE_PALETTE.length];
      i += 1;
    }
  });
  return map;
}

function ConceptNode({ data }) {
  const stateColor = STATE_COLORS[data.state] || '#6b7280';
  const noteColor = data.noteColor || '#6b7280';
  const complexity = data.complexity || 3;
  const degree = data.degree || 0;
  const retention = data.stability
    ? Math.min(100, Math.round(data.stability * 10))
    : null;
  // More-connected concepts read as hubs — slightly larger and brighter.
  const scale = Math.min(1.35, 1 + degree * 0.06);
  const opacity = data.dimmed ? 0.12 : degree === 0 ? 0.55 : 1;

  const tooltipParts = [data.label];
  if (data.note_title) tooltipParts.push(`from "${data.note_title}"`);
  if (degree === 0) tooltipParts.push('(no linked concepts yet)');
  if (data.description) tooltipParts.push(data.description.slice(0, 140));

  return (
    <div
      className={`px-3 py-2 rounded-lg border font-medium shadow-lg max-w-[150px] transition-all ${data.highlighted ? 'ring-2 ring-white' : ''}`}
      style={{
        background: `${noteColor}1f`,
        borderColor: `${noteColor}80`,
        color: '#e5e7eb',
        opacity,
        transform: `scale(${scale})`,
        fontSize: '0.75rem',
      }}
      title={tooltipParts.join(' — ')}
    >
      <div className="flex items-start gap-1">
        <span className="truncate font-semibold flex-1">{data.label}</span>
        <span
          className="w-2 h-2 rounded-full flex-shrink-0 mt-0.5"
          style={{ background: stateColor }}
          title={`Review state: ${data.state || 'new'}`}
        />
      </div>
      {data.note_title && (
        <div className="truncate text-[10px] opacity-60 mt-0.5">{data.note_title}</div>
      )}
      <div className="flex items-center gap-1 mt-1 opacity-70">
        <span>{'★'.repeat(complexity)}</span>
        {retention !== null && (
          <span className="ml-auto" style={{ color: stateColor }}>{retention}%</span>
        )}
      </div>
    </div>
  );
}

const nodeTypes = { concept: ConceptNode };

const defaultEdgeOptions = {
  style: { stroke: '#4c1d95', strokeWidth: 1.5 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#4c1d95' },
};

export default function ConceptGraphPage() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);
  const [vectorEnabled, setVectorEnabled] = useState(false);
  const [stats, setStats] = useState({ nodes: 0, edges: 0 });
  const [selectedNode, setSelectedNode] = useState(null);
  const [neighbors, setNeighbors] = useState([]);
  const [rebuilding, setRebuilding] = useState(false);
  const [noteColors, setNoteColors] = useState({});
  const [query, setQuery] = useState('');
  const rfInstance = useRef(null);

  useEffect(() => {
    loadGraph();
  }, []);

  const loadGraph = async () => {
    setLoading(true);
    try {
      const r = await conceptsAPI.getGraph(300);
      const { nodes: rawNodes, edges: rawEdges, vector_search_enabled } = r.data;

      setVectorEnabled(vector_search_enabled);
      setStats({ nodes: rawNodes.length, edges: rawEdges.length });

      const noteColorMap = buildNoteColorMap(rawNodes);
      setNoteColors(noteColorMap);

      // Force-directed layout: connected concepts cluster together instead
      // of being scattered around an arbitrary circle.
      const { posById, degree } = layoutWithForces(rawNodes, rawEdges);
      const layouted = rawNodes.map((n) => ({
        id: n.id,
        type: 'concept',
        position: posById[n.id] || { x: 0, y: 0 },
        data: {
          ...n.data,
          degree: degree[n.id] || 0,
          noteColor: noteColorMap[n.data?.note_id || 'unassigned'],
        },
      }));

      const flowEdges = rawEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.data?.type === 'duplicate' ? 'same' : undefined,
        animated: e.animated,
        style: {
          stroke: e.data?.type === 'duplicate' ? '#ef4444' : '#4c1d95',
          strokeWidth: Math.max(0.5, (e.data?.weight || 0.6) * 2),
          opacity: 0.7,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#4c1d95' },
      }));

      setNodes(layouted);
      setEdges(flowEdges);
    } catch {
      toast.error('Failed to load concept graph');
    } finally {
      setLoading(false);
    }
  };

  const handleRebuildEdges = async () => {
    setRebuilding(true);
    try {
      const res = await conceptsAPI.rebuildEdges();
      toast.success(`Rebuilt graph — ${res.data.edgesWritten} connections found`);
      await loadGraph();
    } catch {
      toast.error('Failed to rebuild concept graph');
    } finally {
      setRebuilding(false);
    }
  };

  const onNodeClick = useCallback(async (_, node) => {
    setSelectedNode(node.data);
    setNeighbors([]);
    try {
      const r = await conceptsAPI.getNeighbors(node.id, 6);
      setNeighbors(r.data);
    } catch { /* ignore */ }
  }, []);

  // Search: dim everything that doesn't match, ring-highlight what does, and
  // snap the view to the matches so you don't have to hunt visually.
  useEffect(() => {
    const q = query.trim().toLowerCase();
    setNodes((nds) => {
      const matchIds = q ? nds.filter((n) => n.data.label.toLowerCase().includes(q)).map((n) => n.id) : null;
      const updated = nds.map((n) => ({
        ...n,
        data: {
          ...n.data,
          dimmed: !!q && !matchIds.includes(n.id),
          highlighted: !!q && matchIds.includes(n.id),
        },
      }));
      if (q && matchIds && matchIds.length > 0 && rfInstance.current) {
        rfInstance.current.fitView({ nodes: matchIds.map((id) => ({ id })), padding: 0.4, duration: 300 });
      }
      return updated;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const noteEntries = useMemo(() => {
    const titleById = {};
    nodes.forEach((n) => {
      const id = n.data?.note_id || 'unassigned';
      if (!titleById[id]) titleById[id] = n.data?.note_title || 'Untitled';
    });
    return Object.entries(noteColors)
      .map(([id, color]) => ({ id, color, title: titleById[id] || 'Untitled' }))
      .slice(0, 8);
  }, [noteColors, nodes]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-violet-600/30 border-t-violet-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Building concept graph...</p>
        </div>
      </div>
    );
  }

  if (stats.nodes === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-sm">
          <Share2 size={40} className="text-gray-600 mx-auto mb-4" />
          <p className="text-white font-semibold mb-2">No concepts yet</p>
          <p className="text-gray-500 text-sm">
            Process a note with AI to extract concepts and build your semantic knowledge graph.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-navy-700 flex-shrink-0 gap-4">
        <div className="flex-shrink-0">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Share2 size={20} className="text-violet-400" />
            Concept Graph
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {stats.nodes} concepts · {stats.edges} semantic edges
          </p>
        </div>

        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a concept..."
            className="w-full bg-navy-800 border border-navy-600 rounded-lg pl-8 pr-8 py-1.5 text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-violet-500"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {vectorEnabled ? (
            <span className="flex items-center gap-1.5 text-green-400 text-xs">
              <Wifi size={12} /> Semantic edges active
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-gray-500 text-xs">
              <WifiOff size={12} /> pgvector not installed — edges disabled
            </span>
          )}
          <button
            onClick={handleRebuildEdges}
            disabled={rebuilding || !vectorEnabled}
            title={vectorEnabled ? 'Recompute connections across all concepts' : 'Requires pgvector'}
            className="btn-secondary text-sm py-1.5 px-3 flex items-center gap-1.5 disabled:opacity-40"
          >
            <Sparkles size={14} className={rebuilding ? 'animate-pulse' : ''} />
            {rebuilding ? 'Rebuilding...' : 'Rebuild Graph'}
          </button>
          <button onClick={loadGraph} className="btn-secondary text-sm py-1.5 px-3">
            Refresh
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Graph */}
        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onInit={(instance) => { rfInstance.current = instance; }}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.1}
            maxZoom={2}
          >
            <Background color="#1e1b4b" gap={20} size={1} />
            <Controls className="bg-navy-800 border-navy-600" />
            <MiniMap
              nodeColor={(n) => n.data?.noteColor || '#6b7280'}
              style={{ background: '#0f172a', border: '1px solid #1e293b' }}
            />
            <Panel position="top-left">
              <div className="bg-navy-800 border border-navy-600 rounded-lg p-3 text-xs space-y-1.5 max-w-[180px]">
                <p className="text-gray-400 font-medium mb-2">Notes</p>
                {noteEntries.map((n) => (
                  <div key={n.id} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: n.color }} />
                    <span className="text-gray-300 truncate" title={n.title}>{n.title}</span>
                  </div>
                ))}
                <div className="pt-2 mt-2 border-t border-navy-700 space-y-1">
                  <p className="text-gray-500">Dot = review state</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(STATE_COLORS).map(([s, c]) => (
                      <div key={s} className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full" style={{ background: c }} />
                        <span className="text-gray-400 capitalize">{s}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Panel>
          </ReactFlow>
        </div>

        {/* Side panel — selected node detail */}
        {selectedNode && (
          <div className="w-64 bg-navy-900 border-l border-navy-700 p-4 overflow-y-auto flex-shrink-0">
            <div className="mb-4">
              <h3 className="text-white font-semibold text-sm mb-1">{selectedNode.label}</h3>
              {selectedNode.note_title && (
                <p className="text-gray-500 text-xs mb-2 truncate">from "{selectedNode.note_title}"</p>
              )}
              <div className="flex items-center gap-2 text-xs">
                <span
                  className="px-2 py-0.5 rounded-full font-medium capitalize"
                  style={{
                    background: `${STATE_COLORS[selectedNode.state] || '#6b7280'}20`,
                    color: STATE_COLORS[selectedNode.state] || '#9ca3af',
                  }}
                >
                  {selectedNode.state || 'new'}
                </span>
                <span className="text-gray-500">
                  {'★'.repeat(selectedNode.complexity || 1)}
                </span>
              </div>
              {selectedNode.description && (
                <p className="text-gray-400 text-xs leading-relaxed mt-3">{selectedNode.description}</p>
              )}
            </div>

            {neighbors.length > 0 && (
              <div>
                <p className="text-gray-400 text-xs font-medium mb-2 flex items-center gap-1">
                  <Info size={11} /> Related concepts
                </p>
                <div className="space-y-2">
                  {neighbors.map((n) => (
                    <div
                      key={n.id}
                      className="p-2 rounded-lg bg-navy-800 border border-navy-700"
                    >
                      <p className="text-gray-200 text-xs font-medium truncate">{n.name}</p>
                      <div className="flex justify-between mt-0.5">
                        <span className="text-gray-600 text-xs capitalize">{n.edge_type}</span>
                        <span className="text-violet-400 text-xs">
                          {Math.round((n.weight || 0) * 100)}% similar
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => { setSelectedNode(null); setNeighbors([]); }}
              className="mt-4 text-gray-500 hover:text-gray-300 text-xs transition-colors"
            >
              Deselect
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
