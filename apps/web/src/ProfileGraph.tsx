import { useMemo } from 'react';
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type NodeProps,
} from '@xyflow/react';
import {
  UserCircleIcon,
  TargetIcon,
  CheckCircleIcon,
  BookOpenTextIcon,
} from '@phosphor-icons/react';
import type { Profile, ProfileGraphNode } from './api.js';
import { buildProfileFlow } from './profile-flow.js';

type FlowData = { source: ProfileGraphNode };

function ProfileFlowNode({ data }: NodeProps) {
  const source = (data as unknown as FlowData).source;
  const icon =
    source.type === 'self' ? (
      <UserCircleIcon size={32} weight="regular" />
    ) : source.type === 'goal' ? (
      <TargetIcon size={23} weight="bold" />
    ) : source.status === 'consolidated' ? (
      <CheckCircleIcon size={19} weight="fill" />
    ) : (
      <BookOpenTextIcon size={19} weight="bold" />
    );
  return (
    <div className={`profile-flow-node profile-flow-${source.type}`}>
      <Handle id="in-left" type="target" position={Position.Left} />
      <Handle id="in-right" type="target" position={Position.Right} />
      <div className="flow-node-icon">{icon}</div>
      <div className="flow-node-copy">
        <span>
          {source.type === 'self'
            ? 'SELF'
            : source.type === 'goal'
              ? 'MAINLINE'
              : 'KNOWLEDGE'}
        </span>
        <strong title={source.title}>{source.title}</strong>
        <small>{source.subtitle}</small>
        {source.type === 'goal' && source.progress && (
          <ProgressLine progress={source.progress.progressPercent} />
        )}
      </div>
      <Handle id="out-left" type="source" position={Position.Left} />
      <Handle id="out-right" type="source" position={Position.Right} />
    </div>
  );
}

const profileNodeTypes = { profile: ProfileFlowNode };

export default function ProfileGraph({
  profile,
  onOpen,
}: {
  profile: Profile;
  onOpen: (node: ProfileGraphNode) => void;
}) {
  const flow = useMemo(() => buildProfileFlow(profile), [profile]);
  return (
    <ReactFlow
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const id = (event.target as HTMLElement)
          .closest('[data-id]')
          ?.getAttribute('data-id');
        const source = profile.graph.nodes.find((node) => node.id === id);
        if (source && source.type !== 'self') {
          event.preventDefault();
          onOpen(source);
        }
      }}
      nodes={flow.nodes}
      edges={flow.edges}
      nodeTypes={profileNodeTypes}
      onNodeClick={(_, node) => onOpen((node.data as FlowData).source)}
      fitView
      fitViewOptions={{ padding: 0.06 }}
      minZoom={0.38}
      maxZoom={1.4}
      nodesDraggable={false}
      nodesConnectable={false}
      deleteKeyCode={null}
    >
      <Background gap={26} size={1} color="var(--graph-grid)" />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

function ProgressLine({ progress }: { progress: number }) {
  return (
    <div className="progress-line" aria-label={`主线进度 ${progress}%`}>
      <span style={{ width: `${progress}%` }} />
    </div>
  );
}
