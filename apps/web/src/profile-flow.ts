import type { Node, Edge, MarkerType } from '@xyflow/react';
import type { Profile, ProfileGraphNode } from './api.js';

export function buildProfileFlow(profile: Profile): {
  nodes: Node[];
  edges: Edge[];
} {
  const sourceNodes = profile.graph.nodes;
  const self = sourceNodes.find((node) => node.type === 'self');
  const goals = sourceNodes.filter((node) => node.type === 'goal');
  const knowledge = sourceNodes.filter((node) => node.type === 'knowledge');
  if (!self) return { nodes: [], edges: [] };
  // Reserve a vertical band per mainline, including space for all its knowledge.
  // Left and right bands grow independently; no fixed-size position cycle.
  const children = new Map<string, ProfileGraphNode[]>();
  const sourceByKnowledge = new Map(
    profile.graph.edges
      .filter((edge) => edge.relation === 'develops_knowledge')
      .map((edge) => [edge.target, edge.source]),
  );
  for (const item of knowledge) {
    const source = sourceByKnowledge.get(item.id);
    if (source) children.set(source, [...(children.get(source) ?? []), item]);
  }
  const cursors = [0, 0];
  const nodes: Node[] = [];
  goals.forEach((goal, index) => {
    const side = index % 2;
    const items = children.get(goal.id) ?? [];
    const height = Math.max(160, items.length * 120);
    const top = cursors[side];
    nodes.push({
      id: goal.id,
      type: 'profile',
      position: { x: side === 0 ? 230 : 1010, y: top + (height - 120) / 2 },
      data: { source: goal },
    });
    items.forEach((item, i) =>
      nodes.push({
        id: item.id,
        type: 'profile',
        position: { x: side === 0 ? 0 : 1290, y: top + i * 120 },
        data: { source: item },
      }),
    );
    cursors[side] += height + 60;
  });
  nodes.unshift({
    id: self.id,
    type: 'profile',
    position: { x: 640, y: Math.max(0, (Math.max(...cursors) - 172) / 2) },
    data: { source: self },
  });
  const positions = new Map(nodes.map((node) => [node.id, node.position]));
  const edges: Edge[] = profile.graph.edges.map((edge) => {
    const toLeft =
      (positions.get(edge.target)?.x ?? 0) <
      (positions.get(edge.source)?.x ?? 0);
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: toLeft ? 'out-left' : 'out-right',
      targetHandle: toLeft ? 'in-right' : 'in-left',
      type: 'smoothstep',
      animated: false,
      markerEnd: { type: 'arrowclosed' as MarkerType, width: 14, height: 14 },
      style: {
        stroke: edge.relation === 'pursues' ? '#497461' : '#a9bb9c',
        strokeWidth: edge.relation === 'pursues' ? 1.8 : 1.2,
      },
    };
  });
  return { nodes, edges };
}
