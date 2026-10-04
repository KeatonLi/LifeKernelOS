import type { DesktopCommand } from '../../desktop/src/bridge.js';
export type User = { id: string; email: string; createdAt: string };
export type GoalStatus = 'active' | 'paused' | 'completed' | 'abandoned';
export type ActionStatus = 'available' | 'completed' | 'blocked' | 'abandoned' | 'superseded';
export type Energy = 'low' | 'medium' | 'high';
export type AvailableMinutes = 5 | 15 | 30 | 60;
export type KnowledgeStatus = 'in_progress' | 'needs_consolidation' | 'consolidated';
export type CaptureType = 'idea' | 'task' | 'event' | 'feeling' | 'inspiration';
export type CaptureStatus = 'inbox' | 'converted' | 'archived';

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
export type Capture = { id: string; userId: string; content: string; type: CaptureType | null; status: CaptureStatus; convertedActionId: string | null; createdAt: string; updatedAt: string };
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
  constructor(message: string, readonly fields?: Record<string, string>, readonly code?: string) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (window.lifeKernel) {
    const result = await window.lifeKernel.request({ method: (init.method ?? 'GET') as 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path, body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined });
    if (!result.ok) throw new ApiError(result.error.message, result.error.fields, result.error.code);
    return result.data as T;
  }
  const response = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init.headers },
    ...init
  });
  const payload = await response.json().catch(() => null) as T & { error?: { message?: string; fields?: Record<string, string>; code?: string } } | null;
  if (!response.ok) throw new ApiError(payload?.error?.message ?? '请求没有成功，请稍后再试。', payload?.error?.fields, payload?.error?.code ?? (response.status === 401 ? 'UNAUTHENTICATED' : undefined));
  return payload as T;
}

async function download(path: string): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch(path, { credentials: 'include' });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { message?: string; fields?: Record<string, string>; code?: string } } | null;
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
  resumeAction: (id: string) => request<{ action: GoalAction }>(`/api/actions/${id}/resume`, { method: 'POST' }),
  current: () => request<CurrentWorkspace>('/api/current'),
  recordContext: (input: { availableMinutes?: AvailableMinutes | null; energy?: Energy | null }) => request<{ context: CurrentContext }>('/api/current/context', { method: 'PUT', body: JSON.stringify(input) }),
  selectCurrent: (actionId: string) => request<{ context: CurrentContext }>('/api/current/select', { method: 'POST', body: JSON.stringify({ actionId }) }),
  clearCurrent: (expectedActionId: string) => request<{ context: CurrentContext | null }>('/api/current/select', { method: 'DELETE', body: JSON.stringify({ expectedActionId }) }),
  completeCurrent: (expectedActionId: string, outcomeNote?: string) => request<{ action: GoalAction }>('/api/current/complete', { method: 'POST', body: JSON.stringify({ expectedActionId, outcomeNote: outcomeNote || null }) }),
  splitCurrent: (input: { expectedActionId: string; title: string; content?: string | null; estimatedMinutes?: AvailableMinutes | null; energyRequired?: Energy | null }) => request<{ original: GoalAction; action: GoalAction }>('/api/current/split', { method: 'POST', body: JSON.stringify(input) }),
  blockCurrent: (expectedActionId: string, blockerNote?: string) => request<{ action: GoalAction }>('/api/current/block', { method: 'POST', body: JSON.stringify({ expectedActionId, blockerNote: blockerNote || null }) }),
  abandonCurrent: (expectedActionId: string, outcomeNote?: string) => request<{ action: GoalAction }>('/api/current/abandon', { method: 'POST', body: JSON.stringify({ expectedActionId, outcomeNote: outcomeNote || null }) }),
  captures: (status: CaptureStatus = 'inbox') => request<{ captures: Capture[] }>(`/api/captures?status=${status}`),
  createCapture: (input: { content: string; type?: CaptureType | null }) => request<{ capture: Capture }>('/api/captures', { method: 'POST', body: JSON.stringify(input) }),
  updateCapture: (id: string, input: { type: CaptureType | null }) => request<{ capture: Capture }>(`/api/captures/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  convertCapture: (id: string, input: { goalId: string; title: string }) => request<{ capture: Capture; action: GoalAction }>(`/api/captures/${id}/convert`, { method: 'POST', body: JSON.stringify(input) }),
  archiveCapture: (id: string) => request<{ capture: Capture }>(`/api/captures/${id}/archive`, { method: 'POST' }),
  deleteCapture: (id: string) => request<{ success: true }>(`/api/captures/${id}`, { method: 'DELETE' }),
  exportData: () => download('/api/export'),
  profile: () => request<{ profile: Profile }>('/api/profile'),
  saveDescription: (content: string) => request<{ description: Profile['description'] }>('/api/profile/description', { method: 'PUT', body: JSON.stringify({ content }) }),
  saveReflection: (goalId: string, summary: string) => request(`/api/goals/${goalId}/reflection`, { method: 'PUT', body: JSON.stringify({ summary }) }),
  createKnowledge: (input: { goalId: string; title: string; note?: string }) => request<{ knowledge: KnowledgeItem }>('/api/knowledge', { method: 'POST', body: JSON.stringify(input) }),
  updateKnowledge: (id: string, input: Partial<Pick<KnowledgeItem, 'title' | 'note' | 'status'>>) => request<{ knowledge: KnowledgeItem }>(`/api/knowledge/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteKnowledge: (id: string) => request<{ success: true }>(`/api/knowledge/${id}`, { method: 'DELETE' })
};

export const isDesktop = () => Boolean(window.lifeKernel);
export async function desktop<T = unknown>(command: DesktopCommand): Promise<T> {
  if (!window.lifeKernel) throw new ApiError('请在桌面客户端中使用这项功能。');
  const result = await window.lifeKernel.desktop(command);
  if (!result.ok) throw new ApiError(result.error.message, result.error.fields, result.error.code);
  return result.data as T;
}
export function subscribeData(listener: () => void) {
  const unsubscribe = window.lifeKernel?.onChange(listener);
  window.addEventListener('lifekernel:changed', listener);
  return () => { unsubscribe?.(); window.removeEventListener('lifekernel:changed', listener); };
}
export function dataChanged() { window.dispatchEvent(new window.Event('lifekernel:changed')); }
