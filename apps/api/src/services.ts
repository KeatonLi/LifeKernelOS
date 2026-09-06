import { randomUUID } from 'node:crypto';
import type { DatabaseContext } from './db.js';
import {
  AppError,
  type Action,
  type ActionStatus,
  type AvailableMinutes,
  type CandidateAction,
  type CurrentContext,
  type Energy,
  type ExportPayload,
  type Goal,
  type GoalProgress,
  type GoalStatusEvent,
  type GoalReflection,
  type GoalStatus,
  type GoalWithProgress,
  type KnowledgeItem,
  type KnowledgeStatus,
  type LegacyAction,
  type LegacyFocus,
  type ProfileView,
  type User
} from './types.js';

type FocusRow = {
  id: string;
  user_id: string;
  title: string;
  progress_percent: number;
  status: LegacyFocus['status'];
  done_definition: string | null;
  goal_status: GoalStatus;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type ActionRow = {
  id: string;
  user_id: string;
  focus_id: string;
  parent_action_id: string | null;
  title: string;
  content: string | null;
  estimated_minutes: AvailableMinutes | null;
  energy_required: Energy | null;
  status: ActionStatus;
  blocker_note: string | null;
  outcome_note: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

type ReflectionRow = {
  id: string;
  focus_id: string;
  summary: string;
  created_at: string;
  updated_at: string;
};

type KnowledgeRow = {
  id: string;
  focus_id: string;
  title: string;
  status: KnowledgeStatus;
  note: string | null;
  consolidated_at: string | null;
  created_at: string;
  updated_at: string;
};

type CurrentContextRow = {
  user_id: string;
  available_minutes: AvailableMinutes | null;
  energy: Energy | null;
  state_recorded_at: string | null;
  selected_action_id: string | null;
  selected_at: string | null;
  updated_at: string;
};

type GoalStatusEventRow = {
  id: string;
  goal_id: string;
  status: GoalStatus;
  occurred_at: string;
};

export type CurrentWorkspace = {
  context: CurrentContext | null;
  contextIsStale: boolean;
  currentAction: Action | null;
  strictMatches: CandidateAction[];
  allAvailable: Action[];
};

function now(): string {
  return new Date().toISOString();
}

function normalizeText(value: string, field: string, maxLength: number): string {
  const normalized = value.trim();
  if (!normalized) throw new AppError('VALIDATION_ERROR', '请检查输入', 400, { [field]: '此项不能为空' });
  if (normalized.length > maxLength) {
    throw new AppError('VALIDATION_ERROR', '请检查输入', 400, { [field]: `最多 ${maxLength} 个字符` });
  }
  return normalized;
}

function normalizeOptionalText(value: string | undefined | null, field: string, maxLength: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) {
    throw new AppError('VALIDATION_ERROR', '请检查输入', 400, { [field]: `最多 ${maxLength} 个字符` });
  }
  return normalized;
}

function mapUser(row: { id: string; email: string; created_at: string }): User {
  return { id: row.id, email: row.email, createdAt: row.created_at };
}

function mapLegacyFocus(row: FocusRow): LegacyFocus {
  return {
    id: row.id,
    title: row.title,
    progressPercent: row.progress_percent,
    status: row.status,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapGoal(row: FocusRow): Goal {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    doneDefinition: row.done_definition,
    status: row.goal_status,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapAction(row: ActionRow): Action {
  return {
    id: row.id,
    userId: row.user_id,
    goalId: row.focus_id,
    parentActionId: row.parent_action_id,
    title: row.title,
    content: row.content,
    estimatedMinutes: row.estimated_minutes,
    energyRequired: row.energy_required,
    status: row.status,
    blockerNote: row.blocker_note,
    outcomeNote: row.outcome_note,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapLegacyAction(row: ActionRow): LegacyAction {
  return { id: row.id, focusId: row.focus_id, title: row.title, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at };
}

function mapReflection(row: ReflectionRow | undefined): GoalReflection | null {
  if (!row) return null;
  return { id: row.id, goalId: row.focus_id, summary: row.summary, createdAt: row.created_at, updatedAt: row.updated_at };
}

function mapKnowledge(row: KnowledgeRow): KnowledgeItem {
  return { id: row.id, goalId: row.focus_id, title: row.title, status: row.status, note: row.note, consolidatedAt: row.consolidated_at, createdAt: row.created_at, updatedAt: row.updated_at };
}

function goalStatusLabel(status: GoalStatus): string {
  return status === 'active' ? '进行中' : status === 'paused' ? '已暂停' : status === 'completed' ? '已完成' : '已放弃';
}

function knowledgeStatusLabel(status: KnowledgeStatus): string {
  return status === 'in_progress' ? '正在形成' : status === 'needs_consolidation' ? '待沉淀' : '已沉淀';
}

function mapContext(row: CurrentContextRow): CurrentContext {
  return { userId: row.user_id, availableMinutes: row.available_minutes, energy: row.energy, stateRecordedAt: row.state_recorded_at, selectedActionId: row.selected_action_id, selectedAt: row.selected_at, updatedAt: row.updated_at };
}

function mapGoalStatusEvent(row: GoalStatusEventRow): GoalStatusEvent {
  return { id: row.id, goalId: row.goal_id, status: row.status, occurredAt: row.occurred_at };
}

function isContextStale(context: CurrentContext | null): boolean {
  if (!context?.stateRecordedAt) return false;
  return Date.now() - Date.parse(context.stateRecordedAt) > 24 * 60 * 60 * 1000;
}

function energyRank(value: Energy): number {
  return value === 'low' ? 1 : value === 'medium' ? 2 : 3;
}

export class LifeKernelService {
  constructor(private readonly database: DatabaseContext) {}

  private get sqlite() {
    return this.database.sqlite;
  }

  provisionInitialAccount(emailInput: string, passwordHash: string): User {
    const email = emailInput.trim().toLowerCase();
    if (!email) throw new AppError('VALIDATION_ERROR', '邮箱不能为空', 400, { email: '请输入邮箱' });
    const userCount = this.sqlite.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
    if (userCount.count > 0) throw new AppError('INITIAL_ACCOUNT_EXISTS', '初始账号已经存在', 409);
    const createdAt = now();
    const user = { id: randomUUID(), email, createdAt };
    this.sqlite.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)').run(user.id, user.email, passwordHash, user.createdAt);
    return user;
  }

  findUserCredential(emailInput: string): { user: User; passwordHash: string } | null {
    const email = emailInput.trim().toLowerCase();
    const row = this.sqlite.prepare('SELECT id, email, password_hash, created_at FROM users WHERE email = ?').get(email) as { id: string; email: string; password_hash: string; created_at: string } | undefined;
    return row ? { user: mapUser(row), passwordHash: row.password_hash } : null;
  }

  createSession(userId: string, tokenHash: string, expiresAt: string): void {
    this.sqlite.prepare('INSERT INTO sessions (id, token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)').run(randomUUID(), tokenHash, userId, expiresAt, now());
  }

  getSessionUser(tokenHash: string): User | null {
    this.sqlite.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now());
    const row = this.sqlite.prepare(`SELECT users.id, users.email, users.created_at FROM sessions INNER JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?`).get(tokenHash, now()) as { id: string; email: string; created_at: string } | undefined;
    return row ? mapUser(row) : null;
  }

  deleteSession(tokenHash: string): void {
    this.sqlite.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
  }

  // Legacy endpoints remain available for old local clients. The current UI only uses Goal methods.
  getLegacyActiveFocus(userId: string): LegacyFocus | null {
    const row = this.sqlite.prepare('SELECT * FROM focuses WHERE user_id = ? AND goal_status = ? ORDER BY created_at ASC').get(userId, 'active') as FocusRow | undefined;
    return row ? mapLegacyFocus(row) : null;
  }

  createLegacyFocus(userId: string, titleInput: string): LegacyFocus {
    const title = normalizeText(titleInput, 'title', 100);
    const createdAt = now();
    const id = randomUUID();
    this.sqlite.prepare(`INSERT INTO focuses (id, user_id, title, progress_percent, status, done_definition, goal_status, completed_at, created_at, updated_at) VALUES (?, ?, ?, 0, 'active', NULL, 'active', NULL, ?, ?)`).run(id, userId, title, createdAt, createdAt);
    return { id, title, progressPercent: 0, status: 'active', completedAt: null, createdAt, updatedAt: createdAt };
  }

  updateLegacyFocusProgress(userId: string, focusId: string, progressPercent: number): LegacyFocus {
    if (!Number.isInteger(progressPercent) || progressPercent < 0 || progressPercent > 100) throw new AppError('VALIDATION_ERROR', '请检查输入', 400, { progressPercent: '进度必须是 0 到 100 的整数' });
    const update = this.sqlite.transaction(() => {
      const row = this.sqlite.prepare('SELECT * FROM focuses WHERE id = ? AND user_id = ? AND goal_status = ?').get(focusId, userId, 'active') as FocusRow | undefined;
      if (!row) throw new AppError('RESOURCE_NOT_FOUND', '历史兼容目标不存在', 404);
      if (progressPercent === 100) {
        const selected = this.sqlite.prepare(`SELECT actions.id FROM current_contexts INNER JOIN actions ON actions.id = current_contexts.selected_action_id WHERE current_contexts.user_id = ? AND actions.user_id = ? AND actions.focus_id = ? AND actions.status = 'available'`).get(userId, userId, focusId);
        if (selected) throw new AppError('CURRENT_ACTION_MUST_BE_HANDLED', '请先处理或释放该目标下的当前行动', 409);
      }
      const updatedAt = now();
      const completedAt = progressPercent === 100 ? updatedAt : null;
      const status: LegacyFocus['status'] = progressPercent === 100 ? 'completed' : 'active';
      const goalStatus: GoalStatus = status === 'completed' ? 'completed' : 'active';
      this.sqlite.prepare('UPDATE focuses SET progress_percent = ?, status = ?, goal_status = ?, completed_at = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(progressPercent, status, goalStatus, completedAt, updatedAt, focusId, userId);
      if (row.goal_status !== goalStatus) {
        this.sqlite.prepare('INSERT INTO goal_status_events (id, user_id, goal_id, status, occurred_at) VALUES (?, ?, ?, ?, ?)').run(randomUUID(), userId, focusId, goalStatus, updatedAt);
      }
      return { ...mapLegacyFocus(row), progressPercent, status, completedAt, updatedAt };
    });
    return update();
  }

  createAction(userId: string, focusId: string, titleInput: string): LegacyAction {
    const action = this.createGoalAction(userId, focusId, { title: titleInput });
    return { id: action.id, focusId: action.goalId, title: action.title, status: action.status, createdAt: action.createdAt, updatedAt: action.updatedAt };
  }

  listActions(userId: string, focusId: string, status?: ActionStatus): LegacyAction[] {
    this.getOwnedGoalRow(userId, focusId);
    const rows = status ? this.sqlite.prepare('SELECT * FROM actions WHERE user_id = ? AND focus_id = ? AND status = ? ORDER BY created_at ASC').all(userId, focusId, status) as ActionRow[] : this.sqlite.prepare('SELECT * FROM actions WHERE user_id = ? AND focus_id = ? ORDER BY created_at ASC').all(userId, focusId) as ActionRow[];
    return rows.map(mapLegacyAction);
  }

  completeAction(userId: string, actionId: string): LegacyAction {
    const complete = this.sqlite.transaction(() => {
      const row = this.getOwnedActionRow(userId, actionId);
      if (row.status === 'completed') return mapLegacyAction(row);
      if (row.status !== 'available') throw new AppError('ACTION_NOT_AVAILABLE', '只有 available 行动可以完成', 409);
      const updatedAt = now();
      this.sqlite.prepare('UPDATE actions SET status = ?, resolved_at = ?, updated_at = ? WHERE id = ? AND user_id = ?').run('completed', updatedAt, updatedAt, actionId, userId);
      const current = this.getCurrentContext(userId);
      if (current?.selectedActionId === actionId) this.clearCurrentAction(userId);
      return mapLegacyAction({ ...row, status: 'completed', resolved_at: updatedAt, updated_at: updatedAt });
    });
    return complete();
  }

  listGoals(userId: string, status?: GoalStatus): GoalWithProgress[] {
    const rows = status ? this.sqlite.prepare('SELECT * FROM focuses WHERE user_id = ? AND goal_status = ? ORDER BY updated_at DESC').all(userId, status) as FocusRow[] : this.sqlite.prepare("SELECT * FROM focuses WHERE user_id = ? ORDER BY CASE goal_status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END, updated_at DESC").all(userId) as FocusRow[];
    return rows.map((row) => ({ ...mapGoal(row), progress: this.getGoalProgress(userId, row.id, row.goal_status) }));
  }

  createGoal(userId: string, input: { title: string; doneDefinition?: string | null }): Goal {
    const title = normalizeText(input.title, 'title', 100);
    const doneDefinition = normalizeOptionalText(input.doneDefinition, 'doneDefinition', 300) ?? null;
    const createdAt = now();
    const id = randomUUID();
    this.sqlite.prepare(`INSERT INTO focuses (id, user_id, title, progress_percent, status, done_definition, goal_status, completed_at, created_at, updated_at) VALUES (?, ?, ?, 0, 'active', ?, 'active', NULL, ?, ?)`).run(id, userId, title, doneDefinition, createdAt, createdAt);
    return { id, userId, title, doneDefinition, status: 'active', completedAt: null, createdAt, updatedAt: createdAt };
  }

  updateGoal(userId: string, goalId: string, input: { title?: string; doneDefinition?: string | null }): Goal {
    const row = this.getOwnedGoalRow(userId, goalId);
    const title = input.title === undefined ? row.title : normalizeText(input.title, 'title', 100);
    const doneDefinition = input.doneDefinition === undefined ? row.done_definition : normalizeOptionalText(input.doneDefinition, 'doneDefinition', 300) ?? null;
    const updatedAt = now();
    this.sqlite.prepare('UPDATE focuses SET title = ?, done_definition = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(title, doneDefinition, updatedAt, goalId, userId);
    return mapGoal({ ...row, title, done_definition: doneDefinition, updated_at: updatedAt });
  }

  changeGoalStatus(userId: string, goalId: string, status: GoalStatus, confirmed = false): Goal {
    const change = this.sqlite.transaction(() => {
      const row = this.getOwnedGoalRow(userId, goalId);
      if (row.goal_status === status) return mapGoal(row);
      if (status === 'completed' && !confirmed) throw new AppError('GOAL_COMPLETION_CONFIRM_REQUIRED', '完成长期目标前请确认结果已经达成', 409);
      const selected = this.sqlite.prepare(`SELECT current_contexts.selected_action_id, actions.status FROM current_contexts INNER JOIN actions ON actions.id = current_contexts.selected_action_id WHERE current_contexts.user_id = ? AND actions.user_id = ? AND actions.focus_id = ?`).get(userId, userId, goalId) as { selected_action_id: string; status: ActionStatus } | undefined;
      if (selected?.status === 'available' && status !== 'active') throw new AppError('CURRENT_ACTION_MUST_BE_HANDLED', '请先处理或释放该目标下的当前行动', 409);
      if (selected && selected.status !== 'available') this.clearCurrentAction(userId);
      const updatedAt = now();
      const completedAt = status === 'completed' ? updatedAt : null;
      const legacyStatus = status === 'completed' ? 'completed' : 'active';
      this.sqlite.prepare('UPDATE focuses SET goal_status = ?, status = ?, completed_at = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(status, legacyStatus, completedAt, updatedAt, goalId, userId);
      this.sqlite.prepare('INSERT INTO goal_status_events (id, user_id, goal_id, status, occurred_at) VALUES (?, ?, ?, ?, ?)').run(randomUUID(), userId, goalId, status, updatedAt);
      return mapGoal({ ...row, goal_status: status, status: legacyStatus, completed_at: completedAt, updated_at: updatedAt });
    });
    return change();
  }

  listGoalActions(userId: string, goalId: string, status?: ActionStatus): Action[] {
    this.getOwnedGoalRow(userId, goalId);
    const rows = status ? this.sqlite.prepare('SELECT * FROM actions WHERE user_id = ? AND focus_id = ? AND status = ? ORDER BY created_at ASC').all(userId, goalId, status) as ActionRow[] : this.sqlite.prepare('SELECT * FROM actions WHERE user_id = ? AND focus_id = ? ORDER BY created_at ASC').all(userId, goalId) as ActionRow[];
    return rows.map(mapAction);
  }

  createGoalAction(userId: string, goalId: string, input: { title: string; content?: string | null; estimatedMinutes?: AvailableMinutes | null; energyRequired?: Energy | null }): Action {
    const goal = this.getOwnedGoalRow(userId, goalId);
    if (goal.goal_status !== 'active') throw new AppError('GOAL_NOT_ACTIVE', '只能为 active 长期目标添加行动', 409);
    const title = normalizeText(input.title, 'title', 200);
    const content = normalizeOptionalText(input.content, 'content', 1000) ?? null;
    const estimatedMinutes = input.estimatedMinutes ?? null;
    const energyRequired = input.energyRequired ?? null;
    const createdAt = now();
    const action: Action = { id: randomUUID(), userId, goalId, parentActionId: null, title, content, estimatedMinutes, energyRequired, status: 'available', blockerNote: null, outcomeNote: null, resolvedAt: null, createdAt, updatedAt: createdAt };
    this.sqlite.prepare(`INSERT INTO actions (id, user_id, focus_id, parent_action_id, title, content, estimated_minutes, energy_required, status, blocker_note, outcome_note, resolved_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(action.id, userId, goalId, null, title, content, estimatedMinutes, energyRequired, 'available', null, null, null, createdAt, createdAt);
    return action;
  }

  updateActionMetadata(userId: string, actionId: string, input: { title?: string; content?: string | null; estimatedMinutes?: AvailableMinutes | null; energyRequired?: Energy | null }): Action {
    const row = this.getOwnedActionRow(userId, actionId);
    const title = input.title === undefined ? row.title : normalizeText(input.title, 'title', 200);
    const content = input.content === undefined ? row.content : normalizeOptionalText(input.content, 'content', 1000) ?? null;
    const estimatedMinutes = input.estimatedMinutes === undefined ? row.estimated_minutes : input.estimatedMinutes;
    const energyRequired = input.energyRequired === undefined ? row.energy_required : input.energyRequired;
    const updatedAt = now();
    this.sqlite.prepare('UPDATE actions SET title = ?, content = ?, estimated_minutes = ?, energy_required = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(title, content, estimatedMinutes, energyRequired, updatedAt, actionId, userId);
    return mapAction({ ...row, title, content, estimated_minutes: estimatedMinutes, energy_required: energyRequired, updated_at: updatedAt });
  }

  getCurrentContext(userId: string): CurrentContext | null {
    const row = this.sqlite.prepare('SELECT * FROM current_contexts WHERE user_id = ?').get(userId) as CurrentContextRow | undefined;
    return row ? mapContext(row) : null;
  }

  recordCurrentContext(userId: string, input: { availableMinutes?: AvailableMinutes | null; energy?: Energy | null }): CurrentContext {
    const current = this.getCurrentContext(userId);
    const availableMinutes = input.availableMinutes === undefined ? current?.availableMinutes ?? null : input.availableMinutes;
    const energy = input.energy === undefined ? current?.energy ?? null : input.energy;
    const hasStateInput = input.availableMinutes !== undefined || input.energy !== undefined;
    const stateRecordedAt = hasStateInput && (availableMinutes !== null || energy !== null) ? now() : (hasStateInput ? null : current?.stateRecordedAt ?? null);
    const updatedAt = now();
    this.sqlite.prepare(`INSERT INTO current_contexts (user_id, available_minutes, energy, state_recorded_at, selected_action_id, selected_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET available_minutes = excluded.available_minutes, energy = excluded.energy, state_recorded_at = excluded.state_recorded_at, updated_at = excluded.updated_at`).run(userId, availableMinutes, energy, stateRecordedAt, current?.selectedActionId ?? null, current?.selectedAt ?? null, updatedAt);
    return this.getCurrentContext(userId)!;
  }

  getCurrentWorkspace(userId: string): CurrentWorkspace {
    let context = this.getCurrentContext(userId);
    const selectedRow = context?.selectedActionId ? this.sqlite.prepare('SELECT * FROM actions WHERE id = ? AND user_id = ?').get(context.selectedActionId, userId) as ActionRow | undefined : undefined;
    if (selectedRow && selectedRow.status !== 'available') {
      this.clearCurrentAction(userId);
      context = this.getCurrentContext(userId);
    }
    const allAvailable = this.listAvailableActions(userId);
    const contextIsStale = isContextStale(context);
    return { context, contextIsStale, currentAction: selectedRow?.status === 'available' ? mapAction(selectedRow) : null, strictMatches: contextIsStale ? [] : this.matchActions(allAvailable, context), allAvailable };
  }

  selectCurrentAction(userId: string, actionId: string): CurrentContext {
    const select = this.sqlite.transaction(() => {
      const action = this.getOwnedActionRow(userId, actionId);
      const goal = this.getOwnedGoalRow(userId, action.focus_id);
      if (action.status !== 'available') throw new AppError('ACTION_NOT_AVAILABLE', '只有 available 行动可以成为当前行动', 409);
      if (goal.goal_status !== 'active') throw new AppError('GOAL_NOT_ACTIVE', '只有 active 长期目标下的行动可以被选择', 409);
      const current = this.getCurrentContext(userId);
      const selectedAt = now();
      const updatedAt = now();
      this.sqlite.prepare(`INSERT INTO current_contexts (user_id, available_minutes, energy, state_recorded_at, selected_action_id, selected_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET selected_action_id = excluded.selected_action_id, selected_at = excluded.selected_at, updated_at = excluded.updated_at`).run(userId, current?.availableMinutes ?? null, current?.energy ?? null, current?.stateRecordedAt ?? null, actionId, selectedAt, updatedAt);
      return this.getCurrentContext(userId)!;
    });
    return select();
  }

  clearCurrentAction(userId: string): CurrentContext | null {
    const current = this.getCurrentContext(userId);
    if (!current) return null;
    const updatedAt = now();
    this.sqlite.prepare('UPDATE current_contexts SET selected_action_id = NULL, selected_at = NULL, updated_at = ? WHERE user_id = ?').run(updatedAt, userId);
    return { ...current, selectedActionId: null, selectedAt: null, updatedAt };
  }

  completeCurrentAction(userId: string, outcomeNoteInput?: string | null): Action {
    return this.resolveCurrentAction(userId, 'completed', { outcomeNote: normalizeOptionalText(outcomeNoteInput, 'outcomeNote', 500) ?? null });
  }

  splitCurrentAction(userId: string, input: { title: string; content?: string | null; estimatedMinutes?: AvailableMinutes | null; energyRequired?: Energy | null }): { original: Action; action: Action } {
    const split = this.sqlite.transaction(() => {
      const current = this.requireCurrentActionRow(userId);
      const goal = this.getOwnedGoalRow(userId, current.focus_id);
      if (goal.goal_status !== 'active') throw new AppError('GOAL_NOT_ACTIVE', '该长期目标已经不是 active', 409);
      if (current.status !== 'available') throw new AppError('ACTION_NOT_AVAILABLE', '只有 available 行动可以拆小', 409);
      const title = normalizeText(input.title, 'title', 200);
      const content = normalizeOptionalText(input.content, 'content', 1000) ?? null;
      const estimatedMinutes = input.estimatedMinutes ?? null;
      const energyRequired = input.energyRequired ?? null;
      const timestamp = now();
      this.sqlite.prepare('UPDATE actions SET status = ?, resolved_at = ?, updated_at = ? WHERE id = ? AND user_id = ?').run('superseded', timestamp, timestamp, current.id, userId);
      const action: Action = { id: randomUUID(), userId, goalId: current.focus_id, parentActionId: current.id, title, content, estimatedMinutes, energyRequired, status: 'available', blockerNote: null, outcomeNote: null, resolvedAt: null, createdAt: timestamp, updatedAt: timestamp };
      this.sqlite.prepare(`INSERT INTO actions (id, user_id, focus_id, parent_action_id, title, content, estimated_minutes, energy_required, status, blocker_note, outcome_note, resolved_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(action.id, userId, action.goalId, action.parentActionId, title, content, estimatedMinutes, energyRequired, 'available', null, null, null, timestamp, timestamp);
      this.clearCurrentAction(userId);
      return { original: mapAction({ ...current, status: 'superseded', resolved_at: timestamp, updated_at: timestamp }), action };
    });
    return split();
  }

  blockCurrentAction(userId: string, blockerNoteInput?: string | null): Action {
    return this.resolveCurrentAction(userId, 'blocked', { blockerNote: normalizeOptionalText(blockerNoteInput, 'blockerNote', 500) ?? null });
  }

  abandonCurrentAction(userId: string, outcomeNoteInput?: string | null): Action {
    return this.resolveCurrentAction(userId, 'abandoned', { outcomeNote: normalizeOptionalText(outcomeNoteInput, 'outcomeNote', 500) ?? null });
  }

  exportData(userId: string): ExportPayload {
    const read = this.sqlite.transaction(() => {
      const goalRows = this.sqlite.prepare('SELECT * FROM focuses WHERE user_id = ? ORDER BY created_at ASC').all(userId) as FocusRow[];
      const actionRows = this.sqlite.prepare('SELECT * FROM actions WHERE user_id = ? ORDER BY created_at ASC').all(userId) as ActionRow[];
      const goalReflections = (this.sqlite.prepare('SELECT * FROM focus_reflections WHERE user_id = ? ORDER BY created_at ASC').all(userId) as ReflectionRow[]).map((row) => mapReflection(row)!);
      const profileDescriptionRow = this.sqlite.prepare('SELECT content, updated_at FROM profile_descriptions WHERE user_id = ?').get(userId) as { content: string; updated_at: string } | undefined;
      const knowledgeItems = (this.sqlite.prepare('SELECT * FROM knowledge_items WHERE user_id = ? ORDER BY created_at ASC').all(userId) as KnowledgeRow[]).map(mapKnowledge);
      const goalStatusEvents = (this.sqlite.prepare('SELECT id, goal_id, status, occurred_at FROM goal_status_events WHERE user_id = ? ORDER BY occurred_at ASC').all(userId) as GoalStatusEventRow[]).map(mapGoalStatusEvent);
      return { goals: goalRows.map(mapGoal), currentContext: this.getCurrentContext(userId), actions: actionRows.map(mapAction), goalReflections, profileDescription: profileDescriptionRow ? { content: profileDescriptionRow.content, updatedAt: profileDescriptionRow.updated_at } : null, knowledgeItems, goalStatusEvents };
    });
    return { schemaVersion: 5, exportedAt: now(), data: read() };
  }

  getProfileView(userId: string): ProfileView {
    const read = this.sqlite.transaction(() => {
      const goalRows = this.sqlite.prepare("SELECT * FROM focuses WHERE user_id = ? ORDER BY CASE goal_status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END, updated_at DESC").all(userId) as FocusRow[];
      const goalsWithProgress = goalRows.map((row) => ({ goal: mapGoal(row), progress: this.getGoalProgress(userId, row.id, row.goal_status) }));
      const completedActionCount = (this.sqlite.prepare('SELECT COUNT(*) AS count FROM actions WHERE user_id = ? AND status = ?').get(userId, 'completed') as { count: number }).count;
      const description = this.sqlite.prepare('SELECT content, updated_at FROM profile_descriptions WHERE user_id = ?').get(userId) as { content: string; updated_at: string } | undefined;
      const reflectionQuery = this.sqlite.prepare('SELECT * FROM focus_reflections WHERE focus_id = ? AND user_id = ?');
      const experiences = goalsWithProgress
        .filter(({ goal }) => goal.status === 'completed')
        .map(({ goal, progress }) => ({ goal, progress, reflection: mapReflection(reflectionQuery.get(goal.id, userId) as ReflectionRow | undefined) }));
      const knowledgeItems = (this.sqlite.prepare(`SELECT * FROM knowledge_items WHERE user_id = ? ORDER BY CASE status WHEN 'needs_consolidation' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, created_at ASC`).all(userId) as KnowledgeRow[]).map(mapKnowledge);
      const selfNodeId = `self:${userId}`;
      const goalNodes = goalsWithProgress.map(({ goal, progress }) => ({
        id: `goal:${goal.id}`,
        type: 'goal' as const,
        sourceId: goal.id,
        title: goal.title,
        subtitle: `${progress.completedTodoCount} / ${progress.totalTodoCount} · ${progress.progressPercent}%`,
        status: goal.status,
        progress
      }));
      const knowledgeNodes = knowledgeItems.map((item) => ({ id: `knowledge:${item.id}`, type: 'knowledge' as const, sourceId: item.id, title: item.title, subtitle: knowledgeStatusLabel(item.status), status: item.status, progress: null }));
      const nodes = [
        { id: selfNodeId, type: 'self' as const, sourceId: null, title: '我', subtitle: `${goalsWithProgress.length} 条主线 · ${completedActionCount} 项完成 To-do`, status: null, progress: null },
        ...goalNodes,
        ...knowledgeNodes
      ];
      const edges = [
        ...goalsWithProgress.map(({ goal }) => ({ id: `pursues:${goal.id}`, source: selfNodeId, target: `goal:${goal.id}`, relation: 'pursues' as const })),
        ...knowledgeItems.map((item) => ({ id: `develops:${item.id}`, source: `goal:${item.goalId}`, target: `knowledge:${item.id}`, relation: 'develops_knowledge' as const }))
      ];
      return {
        factSummary: {
          goalCount: goalsWithProgress.length,
          activeGoalCount: goalsWithProgress.filter(({ goal }) => goal.status === 'active').length,
          completedGoalCount: goalsWithProgress.filter(({ goal }) => goal.status === 'completed').length,
          completedActionCount,
          knowledgeCount: knowledgeItems.length
        },
        description: description ? { content: description.content, updatedAt: description.updated_at } : null,
        knowledgeItems,
        goals: goalsWithProgress,
        experiences,
        graph: { nodes, edges }
      };
    });
    return read();
  }

  upsertProfileDescription(userId: string, contentInput: string): { content: string; updatedAt: string } | null {
    const content = normalizeOptionalText(contentInput, 'content', 500);
    if (content === null || content === undefined) {
      this.sqlite.prepare('DELETE FROM profile_descriptions WHERE user_id = ?').run(userId);
      return null;
    }
    const updatedAt = now();
    this.sqlite.prepare(`INSERT INTO profile_descriptions (user_id, content, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`).run(userId, content, updatedAt);
    return { content, updatedAt };
  }

  deleteProfileDescription(userId: string): void {
    this.sqlite.prepare('DELETE FROM profile_descriptions WHERE user_id = ?').run(userId);
  }

  upsertGoalReflection(userId: string, goalId: string, summaryInput: string): GoalReflection | null {
    const goal = this.getOwnedGoalRow(userId, goalId);
    if (goal.goal_status !== 'completed') throw new AppError('GOAL_NOT_COMPLETED', '只有已完成的目标可以留下经历总结', 409);
    const summary = normalizeOptionalText(summaryInput, 'summary', 500);
    if (summary === null) {
      this.sqlite.prepare('DELETE FROM focus_reflections WHERE user_id = ? AND focus_id = ?').run(userId, goalId);
      return null;
    }
    const timestamp = now();
    this.sqlite.prepare(`INSERT INTO focus_reflections (id, user_id, focus_id, summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(focus_id) DO UPDATE SET summary = excluded.summary, updated_at = excluded.updated_at`).run(randomUUID(), userId, goalId, summary, timestamp, timestamp);
    return mapReflection(this.sqlite.prepare('SELECT * FROM focus_reflections WHERE user_id = ? AND focus_id = ?').get(userId, goalId) as ReflectionRow);
  }

  deleteGoalReflection(userId: string, goalId: string): void {
    this.getOwnedGoalRow(userId, goalId);
    this.sqlite.prepare('DELETE FROM focus_reflections WHERE user_id = ? AND focus_id = ?').run(userId, goalId);
  }

  createKnowledgeItem(userId: string, input: { goalId: string; title: string; note?: string }): KnowledgeItem {
    this.getOwnedGoalRow(userId, input.goalId);
    const title = normalizeText(input.title, 'title', 80);
    const note = normalizeOptionalText(input.note, 'note', 300) ?? null;
    const createdAt = now();
    const item = { id: randomUUID(), goalId: input.goalId, title, status: 'in_progress' as const, note, consolidatedAt: null, createdAt, updatedAt: createdAt };
    this.sqlite.prepare(`INSERT INTO knowledge_items (id, user_id, focus_id, title, status, note, consolidated_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(item.id, userId, item.goalId, item.title, item.status, item.note, null, item.createdAt, item.updatedAt);
    return item;
  }

  updateKnowledgeItem(userId: string, knowledgeId: string, input: { title?: string; note?: string; status?: KnowledgeStatus }): KnowledgeItem {
    const current = this.sqlite.prepare('SELECT * FROM knowledge_items WHERE id = ? AND user_id = ?').get(knowledgeId, userId) as KnowledgeRow | undefined;
    if (!current) throw new AppError('RESOURCE_NOT_FOUND', '知识不存在', 404);
    const title = input.title === undefined ? current.title : normalizeText(input.title, 'title', 80);
    const note = input.note === undefined ? current.note : normalizeOptionalText(input.note, 'note', 300) ?? null;
    const status = input.status ?? current.status;
    const updatedAt = now();
    const consolidatedAt = status === 'consolidated' ? current.consolidated_at ?? updatedAt : current.consolidated_at;
    this.sqlite.prepare('UPDATE knowledge_items SET title = ?, note = ?, status = ?, consolidated_at = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(title, note, status, consolidatedAt, updatedAt, knowledgeId, userId);
    return { id: current.id, goalId: current.focus_id, title, status, note, consolidatedAt, createdAt: current.created_at, updatedAt };
  }

  deleteKnowledgeItem(userId: string, knowledgeId: string): void {
    const result = this.sqlite.prepare('DELETE FROM knowledge_items WHERE id = ? AND user_id = ?').run(knowledgeId, userId);
    if (result.changes === 0) throw new AppError('RESOURCE_NOT_FOUND', '知识不存在', 404);
  }

  private getGoalProgress(userId: string, goalId: string, goalStatus: GoalStatus): GoalProgress {
    const row = this.sqlite
      .prepare(`SELECT
        COUNT(*) AS total_todo_count,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_todo_count
        FROM actions
        WHERE user_id = ? AND focus_id = ? AND status IN ('available', 'completed', 'blocked')`)
      .get(userId, goalId) as { total_todo_count: number; completed_todo_count: number | null };
    const totalTodoCount = row.total_todo_count;
    const completedTodoCount = row.completed_todo_count ?? 0;
    return {
      completedTodoCount,
      totalTodoCount,
      progressPercent: goalStatus === 'completed' ? 100 : totalTodoCount === 0 ? 0 : Math.round((completedTodoCount / totalTodoCount) * 100)
    };
  }

  private listAvailableActions(userId: string): Action[] {
    const rows = this.sqlite.prepare(`SELECT actions.* FROM actions INNER JOIN focuses ON focuses.id = actions.focus_id AND focuses.user_id = actions.user_id WHERE actions.user_id = ? AND actions.status = 'available' AND focuses.goal_status = 'active' ORDER BY actions.created_at ASC`).all(userId) as ActionRow[];
    return rows.map(mapAction);
  }

  private matchActions(actions: Action[], context: CurrentContext | null): CandidateAction[] {
    const availableMinutes = context?.availableMinutes;
    const currentEnergy = context?.energy;
    if (!availableMinutes || !currentEnergy) return [];
    return actions.flatMap((action) => {
      if (!action.estimatedMinutes || !action.energyRequired) return [];
      if (action.estimatedMinutes > availableMinutes || energyRank(action.energyRequired) > energyRank(currentEnergy)) return [];
      return [{ ...action, matchReasons: [`${action.estimatedMinutes === 60 ? '60 分钟以上' : `${action.estimatedMinutes} 分钟`}内可完成`, `${action.energyRequired === 'low' ? '低' : action.energyRequired === 'medium' ? '中' : '高'}精力匹配`] }];
    });
  }

  private requireCurrentActionRow(userId: string): ActionRow {
    const context = this.getCurrentContext(userId);
    if (!context?.selectedActionId) throw new AppError('NO_CURRENT_ACTION', '当前还没有选择行动', 409);
    const row = this.sqlite.prepare('SELECT * FROM actions WHERE id = ? AND user_id = ?').get(context.selectedActionId, userId) as ActionRow | undefined;
    if (!row || row.status !== 'available') {
      this.clearCurrentAction(userId);
      throw new AppError('NO_CURRENT_ACTION', row ? '当前行动已经处理过' : '当前行动已经不存在', 409);
    }
    return row;
  }

  private resolveCurrentAction(userId: string, status: Extract<ActionStatus, 'completed' | 'blocked' | 'abandoned'>, input: { blockerNote?: string | null; outcomeNote?: string | null }): Action {
    const resolve = this.sqlite.transaction(() => {
      const row = this.requireCurrentActionRow(userId);
      if (row.status !== 'available') throw new AppError('ACTION_NOT_AVAILABLE', '只有 available 行动可以处理', 409);
      const resolvedAt = now();
      const blockerNote = input.blockerNote === undefined ? row.blocker_note : input.blockerNote;
      const outcomeNote = input.outcomeNote === undefined ? row.outcome_note : input.outcomeNote;
      this.sqlite.prepare('UPDATE actions SET status = ?, blocker_note = ?, outcome_note = ?, resolved_at = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(status, blockerNote ?? null, outcomeNote ?? null, resolvedAt, resolvedAt, row.id, userId);
      this.clearCurrentAction(userId);
      return mapAction({ ...row, status, blocker_note: blockerNote ?? null, outcome_note: outcomeNote ?? null, resolved_at: resolvedAt, updated_at: resolvedAt });
    });
    return resolve();
  }

  private getOwnedActionRow(userId: string, actionId: string): ActionRow {
    const row = this.sqlite.prepare('SELECT * FROM actions WHERE id = ? AND user_id = ?').get(actionId, userId) as ActionRow | undefined;
    if (!row) throw new AppError('RESOURCE_NOT_FOUND', '行动不存在', 404);
    return row;
  }

  private getOwnedGoalRow(userId: string, goalId: string): FocusRow {
    const row = this.sqlite.prepare('SELECT * FROM focuses WHERE id = ? AND user_id = ?').get(goalId, userId) as FocusRow | undefined;
    if (!row) throw new AppError('RESOURCE_NOT_FOUND', '长期目标不存在', 404);
    return row;
  }

}
