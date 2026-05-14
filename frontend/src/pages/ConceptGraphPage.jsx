import { useEffect, useState, useCallback } from 'react';
import {
  ReactFlow,
  Background, Controls, MiniMap,
  useNodesState, useEdgesState,
  MarkerType, Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Share2, Loader, Info, Wifi, WifiOff } from 'lucide-react';
import { conceptsAPI } from '../api';
import toast from 'react-hot-toast';

const STATE_COLORS = {
  new: '#8b5cf6',
  learning: '#f59e0b',
  review: '#10b981',
  relearning: '#ef4444',
};

function ConceptNode({ data }) {
  const color = STATE_COLORS[data.state] || '#6b7280';
  const complexity = data.complexity || 3;
  const retention = data.stability
    ? Math.min(100, Math.round(data.stability * 10))
    : null;

  return (
    <div
      className="px-3 py-2 rounded-lg border text-xs font-medium shadow-lg max-w-[140px]"
      style={{
        background: `${color}18`,
        borderColor: `${color}60`,
        color: '#e5e7eb',
      }}
    >
      <div className="truncate font-semibold" title={data.label}>{data.label}</div>
      <div className="flex items-center gap-1 mt-1 opacity-70">
        <span>{'★'.repeat(complexity)}</span>
        {retention !== null && (
          <span className="ml-auto" style={{ color }}>{retention}%</span>
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

      // Auto-layout: arrange in a circle so React Flow has somewhere to start
      const N = rawNodes.length;
      const radius = Math.max(200, N * 30);
      const layouted = rawNodes.map((n, i) => ({
        id: n.id,
        type: 'concept',
        position: {
          x: radius * Math.cos((2 * Math.PI * i) / Math.max(1, N)),
          y: radius * Math.sin((2 * Math.PI * i) / Math.max(1, N)),
        },
        data: n.data,
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

  const onNodeClick = useCallback(async (_, node) => {
    setSelectedNode(node.data);
    setNeighbors([]);
    try {
      const r = await conceptsAPI.getNeighbors(node.id, 6);
      setNeighbors(r.data);
    } catch { /* ignore */ }
  }, []);

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
      <div className="flex items-center justify-between px-6 py-4 border-b border-navy-700 flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Share2 size={20} className="text-violet-400" />
            Concept Graph
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {stats.nodes} concepts · {stats.edges} semantic edges
          </p>
        </div>
        <div className="flex items-center gap-3">
          {vectorEnabled ? (
            <span className="flex items-center gap-1.5 text-green-400 text-xs">
              <Wifi size={12} /> Semantic edges active
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-gray-500 text-xs">
              <WifiOff size={12} /> pgvector not installed — edges disabled
            </span>
          )}
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
              nodeColor={(n) => STATE_COLORS[n.data?.state] || '#6b7280'}
              style={{ background: '#0f172a', border: '1px solid #1e293b' }}
            />
            <Panel position="top-left">
              <div className="bg-navy-800 border border-navy-600 rounded-lg p-3 text-xs space-y-1.5">
                <p className="text-gray-400 font-medium mb-2">Review State</p>
                {Object.entries(STATE_COLORS).map(([s, c]) => (
                  <div key={s} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ background: c }} />
                    <span className="text-gray-300 capitalize">{s}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </ReactFlow>
        </div>

        {/* Side panel — selected node detail */}
        {selectedNode && (
          <div className="w-64 bg-navy-900 border-l border-navy-700 p-4 overflow-y-auto flex-shrink-0">
            <div className="mb-4">
              <h3 className="text-white font-semibold text-sm mb-1">{selectedNode.label}</h3>
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
