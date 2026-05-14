import { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const NODE_COLORS = {
  root: { bg: '#7c3aed', border: '#a78bfa', text: '#fff' },
  branch: { bg: '#1e3a5f', border: '#3b82f6', text: '#bfdbfe' },
  leaf: { bg: '#1a2e1a', border: '#34d399', text: '#a7f3d0' },
};

function CustomNode({ data, type }) {
  const colors = NODE_COLORS[data.nodeType] || NODE_COLORS.leaf;

  return (
    <div
      style={{
        background: colors.bg,
        border: `2px solid ${colors.border}`,
        borderRadius: data.nodeType === 'root' ? '12px' : '8px',
        padding: data.nodeType === 'root' ? '12px 20px' : '8px 14px',
        color: colors.text,
        fontSize: data.nodeType === 'root' ? '14px' : '12px',
        fontWeight: data.nodeType === 'root' ? '700' : '500',
        maxWidth: '180px',
        textAlign: 'center',
        boxShadow: data.nodeType === 'root' ? '0 0 20px rgba(124, 58, 237, 0.4)' : 'none',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0.5 }} />
      <div>{data.label}</div>
      {data.description && (
        <div
          style={{
            fontSize: '10px',
            opacity: 0.7,
            marginTop: '4px',
            fontWeight: 400,
          }}
        >
          {data.description}
        </div>
      )}
      <Handle type="source" position={Position.Right} style={{ opacity: 0.5 }} />
    </div>
  );
}

const nodeTypes = { custom: CustomNode };

export default function MindMapView({ data, onGrade }) {
  const { nodes: rawNodes, edges: rawEdges } = data;

  // Convert to React Flow format with radial layout
  const initialNodes = useMemo(() => {
    if (!rawNodes?.length) return [];

    const rootNode = rawNodes.find((n) => n.type === 'root' || n.id === 'root') || rawNodes[0];
    const branches = rawNodes.filter((n) => n.type === 'branch');
    const leaves = rawNodes.filter((n) => n.type === 'leaf');

    const positioned = [];

    // Root at center
    positioned.push({
      id: rootNode.id,
      type: 'custom',
      data: { label: rootNode.label, description: rootNode.description, nodeType: 'root' },
      position: { x: 400, y: 300 },
    });

    // Branches in a circle around root
    branches.forEach((node, i) => {
      const angle = (i / branches.length) * 2 * Math.PI - Math.PI / 2;
      const radius = 220;
      positioned.push({
        id: node.id,
        type: 'custom',
        data: { label: node.label, description: node.description, nodeType: 'branch' },
        position: {
          x: 400 + radius * Math.cos(angle),
          y: 300 + radius * Math.sin(angle),
        },
      });
    });

    // Leaves around their parent branches
    const branchEdges = rawEdges.filter((e) => branches.some((b) => b.id === e.target));
    leaves.forEach((node, i) => {
      const parentEdge = rawEdges.find((e) => e.target === node.id);
      const parentNode = parentEdge
        ? positioned.find((n) => n.id === parentEdge.source)
        : positioned[1];

      if (!parentNode) return;

      const leafRadius = 130;
      const leafAngle = (i / leaves.length) * 2 * Math.PI;

      positioned.push({
        id: node.id,
        type: 'custom',
        data: { label: node.label, description: node.description, nodeType: 'leaf' },
        position: {
          x: (parentNode?.position?.x || 400) + leafRadius * Math.cos(leafAngle),
          y: (parentNode?.position?.y || 300) + leafRadius * Math.sin(leafAngle),
        },
      });
    });

    return positioned;
  }, [rawNodes, rawEdges]);

  const initialEdges = useMemo(() => {
    if (!rawEdges?.length) return [];
    return rawEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      style: { stroke: '#4b5563', strokeWidth: 1.5 },
      labelStyle: { fill: '#9ca3af', fontSize: 10 },
      type: 'smoothstep',
    }));
  }, [rawEdges]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const gradeButtons = [
    { value: 1, label: 'Again', color: 'bg-red-600 hover:bg-red-500' },
    { value: 2, label: 'Hard', color: 'bg-orange-600 hover:bg-orange-500' },
    { value: 3, label: 'Good', color: 'bg-green-600 hover:bg-green-500' },
    { value: 4, label: 'Easy', color: 'bg-blue-600 hover:bg-blue-500' },
  ];

  return (
    <div className="flex flex-col gap-4 w-full">
      <div
        className="rounded-2xl overflow-hidden border border-navy-600"
        style={{ height: '450px' }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          attributionPosition="bottom-left"
        >
          <Controls />
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color="#1e3a5f"
          />
        </ReactFlow>
      </div>

      <p className="text-gray-400 text-sm text-center">
        Review the mind map above. How well did you recall these connections?
      </p>

      <div className="flex gap-3">
        {gradeButtons.map((g) => (
          <button
            key={g.value}
            onClick={() => onGrade(g.value)}
            className={`flex-1 ${g.color} text-white py-3 rounded-xl font-medium text-sm transition-all`}
          >
            {g.label}
          </button>
        ))}
      </div>
    </div>
  );
}
