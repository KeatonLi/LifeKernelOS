export type User = { id: string; email: string; createdAt: string };
export type GoalStatus = 'active' | 'paused' | 'completed' | 'abandoned';
export type ActionStatus = 'available' | 'completed' | 'blocked' | 'abandoned' | 'superseded';
export type Energy = 'low' | 'medium' | 'high';
export type AvailableMinutes = 5 | 15 | 30 | 60;
export type KnowledgeStatus = 'in_progress' | 'needs_consolidation' | 'consolidated';

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

export type GoalProgress = { completedTodoCount: number; totalTodoCount: number; progressPercent: number };
export type Mainline = Goal & { progress: GoalProgress };

export type GoalAction = {
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

export type CandidateAction = GoalAction & { matchReasons: string[] };
export type CurrentContext = { userId: string; availableMinutes: AvailableMinutes | null; energy: Energy | null; stateRecordedAt: string | null; selectedActionId: string | null; selectedAt: string | null; updatedAt: string };
export type CurrentWorkspace = { context: CurrentContext | null; contextIsStale: boolean; currentAction: GoalAction | null; strictMatches: CandidateAction[]; allAvailable: GoalAction[] };
export type GoalReflection = { id: string; goalId: string; summary: string; createdAt: string; updatedAt: string };
export type KnowledgeItem = { id: string; goalId: string; title: string; status: KnowledgeStatus; note: string | null; consolidatedAt: string | null; createdAt: string; updatedAt: string };
export type ProfileGraphNode = { id: string; type: 'self' | 'goal' | 'knowledge'; sourceId: string | null; title: string; subtitle: string; status: GoalStatus | KnowledgeStatus | null; progress: GoalProgress | null };
export type ProfileGraphEdge = { id: string; source: string; target: string; relation: 'pursues' | 'develops_knowledge' };

export type Profile = {
  factSummary: { goalCount: number; activeGoalCount: number; completedGoalCount: number; completedActionCount: number; knowledgeCount: number };
  description: { content: string; updatedAt: string } | null;
  knowledgeItems: KnowledgeItem[];
  goals: Array<{ goal: Goal; progress: GoalProgress }>;
  experiences: Array<{ goal: Goal; progress: GoalProgress; reflection: GoalReflection | null }>;
  graph: { nodes: ProfileGraphNode[]; edges: ProfileGraphEdge[] };
};

export class ApiError extends Error {
  constructor(message: string, readonly fields?: Record<string, string>) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init.headers },
    ...init
  });
  const payload = await response.json().catch(() => null) as T & { error?: { message?: string; fields?: Record<string, string> } } | null;
  if (!response.ok) throw new ApiError(payload?.error?.message ?? '请求没有成功，请稍后再试。', payload?.error?.fields);
  return payload as T;
}

async function download(path: string): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch(path, { credentials: 'include' });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { message?: string; fields?: Record<string, string> } } | null;
    throw new ApiError(payload?.error?.message ?? '导出失败，请稍后再试。', payload?.error?.fields);
  }
  return { blob: await response.blob(), filename: 'lifekernel-export.json' };
}

export const api = {
  me: () => request<{ user: User }>('/api/auth/me'),
  login: (email: string, password: string) => request<{ user: User }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request<{ success: true }>('/api/auth/logout', { method: 'POST' }),
  goals: (status?: GoalStatus) => request<{ goals: Mainline[] }>(`/api/goals${status ? `?status=${status}` : ''}`),
  createGoal: (input: { title: string; doneDefinition?: string }) => request<{ goal: Goal }>('/api/goals', { method: 'POST', body: JSON.stringify(input) }),
  updateGoal: (id: string, input: { title?: string; doneDefinition?: string | null }) => request<{ goal: Goal }>(`/api/goals/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  changeGoalStatus: (id: string, status: GoalStatus, confirmed = false) => request<{ goal: Goal }>(`/api/goals/${id}/status`, { method: 'POST', body: JSON.stringify({ status, confirmed }) }),
  goalActions: (goalId: string) => request<{ actions: GoalAction[] }>(`/api/goals/${goalId}/actions`),
  createGoalAction: (goalId: string, input: { title: string; content?: string | null; estimatedMinutes?: AvailableMinutes | null; energyRequired?: Energy | null }) => request<{ action: GoalAction }>(`/api/goals/${goalId}/actions`, { method: 'POST', body: JSON.stringify(input) }),
  updateAction: (id: string, input: { title?: string; content?: string | null; estimatedMinutes?: AvailableMinutes | null; energyRequired?: Energy | null }) => request<{ action: GoalAction }>(`/api/actions/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  current: () => request<CurrentWorkspace>('/api/current'),
  recordContext: (input: { availableMinutes?: AvailableMinutes | null; energy?: Energy | null }) => request<{ context: CurrentContext }>('/api/current/context', { method: 'PUT', body: JSON.stringify(input) }),
  selectCurrent: (actionId: string) => request<{ context: CurrentContext }>('/api/current/select', { method: 'POST', body: JSON.stringify({ actionId }) }),
  clearCurrent: () => request<{ context: CurrentContext | null }>('/api/current/select', { method: 'DELETE' }),
  completeCurrent: (outcomeNote?: string) => request<{ action: GoalAction }>('/api/current/complete', { method: 'POST', body: JSON.stringify({ outcomeNote: outcomeNote || null }) }),
  splitCurrent: (input: { title: string; content?: string | null; estimatedMinutes?: AvailableMinutes | null; energyRequired?: Energy | null }) => request<{ original: GoalAction; action: GoalAction }>('/api/current/split', { method: 'POST', body: JSON.stringify(input) }),
  blockCurrent: (blockerNote?: string) => request<{ action: GoalAction }>('/api/current/block', { method: 'POST', body: JSON.stringify({ blockerNote: blockerNote || null }) }),
  abandonCurrent: (outcomeNote?: string) => request<{ action: GoalAction }>('/api/current/abandon', { method: 'POST', body: JSON.stringify({ outcomeNote: outcomeNote || null }) }),
  exportData: () => download('/api/export'),
  profile: () => request<{ profile: Profile }>('/api/profile'),
  saveDescription: (content: string) => request<{ description: Profile['description'] }>('/api/profile/description', { method: 'PUT', body: JSON.stringify({ content }) }),
  saveReflection: (goalId: string, summary: string) => request(`/api/goals/${goalId}/reflection`, { method: 'PUT', body: JSON.stringify({ summary }) }),
  createKnowledge: (input: { goalId: string; title: string; note?: string }) => request<{ knowledge: KnowledgeItem }>('/api/knowledge', { method: 'POST', body: JSON.stringify(input) }),
  updateKnowledge: (id: string, input: Partial<Pick<KnowledgeItem, 'title' | 'note' | 'status'>>) => request<{ knowledge: KnowledgeItem }>(`/api/knowledge/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteKnowledge: (id: string) => request<{ success: true }>(`/api/knowledge/${id}`, { method: 'DELETE' })
};
