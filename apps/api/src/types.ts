export type LegacyFocusStatus = 'active' | 'completed' | 'archived';
export type GoalStatus = 'active' | 'paused' | 'completed' | 'abandoned';
export type ActionStatus = 'available' | 'completed' | 'blocked' | 'abandoned' | 'superseded';
export type Energy = 'low' | 'medium' | 'high';
export type AvailableMinutes = 5 | 15 | 30 | 60;
export type KnowledgeStatus = 'in_progress' | 'needs_consolidation' | 'consolidated';

export type User = {
  id: string;
  email: string;
  createdAt: string;
};

export type LegacyFocus = {
  id: string;
  title: string;
  progressPercent: number;
  status: LegacyFocusStatus;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Goal = {
  id: string;
  userId: string;
  title: string;
  doneDefinition: string | null;
  status: GoalStatus;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GoalProgress = {
  completedTodoCount: number;
  totalTodoCount: number;
  progressPercent: number;
};

export type GoalWithProgress = Goal & { progress: GoalProgress };

export type GoalStatusEvent = {
  id: string;
  goalId: string;
  status: GoalStatus;
  occurredAt: string;
};

export type Action = {
  id: string;
  userId: string;
  goalId: string;
  parentActionId: string | null;
  title: string;
  content: string | null;
  estimatedMinutes: AvailableMinutes | null;
  energyRequired: Energy | null;
  status: ActionStatus;
  blockerNote: string | null;
  outcomeNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LegacyAction = {
  id: string;
  focusId: string;
  title: string;
  status: ActionStatus;
  createdAt: string;
  updatedAt: string;
};

export type CurrentContext = {
  userId: string;
  availableMinutes: AvailableMinutes | null;
  energy: Energy | null;
  stateRecordedAt: string | null;
  selectedActionId: string | null;
  selectedAt: string | null;
  updatedAt: string;
};

export type CandidateAction = Action & { matchReasons: string[] };

export type GoalReflection = {
  id: string;
  goalId: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeItem = {
  id: string;
  goalId: string;
  title: string;
  status: KnowledgeStatus;
  note: string | null;
  consolidatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProfileGraphNode = {
  id: string;
  type: 'self' | 'goal' | 'knowledge';
  sourceId: string | null;
  title: string;
  subtitle: string;
  status: GoalStatus | KnowledgeStatus | null;
  progress: GoalProgress | null;
};

export type ProfileGraphEdge = {
  id: string;
  source: string;
  target: string;
  relation: 'pursues' | 'develops_knowledge';
};

export type ProfileView = {
  factSummary: {
    goalCount: number;
    activeGoalCount: number;
    completedGoalCount: number;
    completedActionCount: number;
    knowledgeCount: number;
  };
  description: { content: string; updatedAt: string } | null;
  knowledgeItems: KnowledgeItem[];
  goals: Array<{
    goal: Goal;
    progress: GoalProgress;
  }>;
  experiences: Array<{
    goal: Goal;
    progress: GoalProgress;
    reflection: GoalReflection | null;
  }>;
  graph: { nodes: ProfileGraphNode[]; edges: ProfileGraphEdge[] };
};

export type ExportPayload = {
  schemaVersion: 5;
  exportedAt: string;
  data: {
    goals: Goal[];
    currentContext: CurrentContext | null;
    actions: Action[];
    goalReflections: GoalReflection[];
    profileDescription: { content: string; updatedAt: string } | null;
    knowledgeItems: KnowledgeItem[];
    goalStatusEvents: GoalStatusEvent[];
  };
};

export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 400,
    readonly fields?: Record<string, string>
  ) {
    super(message);
  }
}
