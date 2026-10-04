import {
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { DatabaseContext } from '../../api/src/db.js';
import { LifeKernelService } from '../../api/src/services.js';
import { AppError, type ExportPayload } from '../../api/src/types.js';
import { isCalendarDate } from '../../../shared/calendar.js';
const id = z.string().uuid();
const date = z.string().datetime({ offset: true });
const nullableText = (max: number) => z.string().max(max).nullable();
const minutes = z
  .union([z.literal(5), z.literal(15), z.literal(30), z.literal(60)])
  .nullable();
const energy = z.enum(['low', 'medium', 'high']).nullable();
const timestamps = { createdAt: date, updatedAt: date };
const goalStatus = z.enum(['active', 'paused', 'completed', 'abandoned']);
const schema = z.object({
  schemaVersion: z.union([z.literal(6), z.literal(7)]),
  exportedAt: date,
  data: z.object({
    goals: z.array(
      z.object({
        id,
        userId: z.string(),
        title: z.string().trim().min(1).max(100),
        doneDefinition: nullableText(300),
        status: goalStatus,
        completedAt: date.nullable(),
        ...timestamps,
      }),
    ),
    actions: z.array(
      z.object({
        id,
        userId: z.string(),
        goalId: id,
        parentActionId: id.nullable(),
        title: z.string().trim().min(1).max(200),
        content: nullableText(2000),
        scheduledDate: z.string().refine(isCalendarDate).nullable().optional(),
        estimatedMinutes: minutes,
        energyRequired: energy,
        status: z.enum([
          'available',
          'completed',
          'blocked',
          'abandoned',
          'superseded',
        ]),
        blockerNote: nullableText(500),
        outcomeNote: nullableText(500),
        resolvedAt: date.nullable(),
        ...timestamps,
      }),
    ),
    currentContext: z
      .object({
        userId: z.string(),
        availableMinutes: minutes,
        energy,
        stateRecordedAt: date.nullable(),
        selectedActionId: id.nullable(),
        selectedAt: date.nullable(),
        updatedAt: date,
      })
      .nullable(),
    goalReflections: z.array(
      z.object({ id, goalId: id, summary: z.string().max(500), ...timestamps }),
    ),
    profileDescription: z
      .object({ content: z.string().max(500), updatedAt: date })
      .nullable(),
    knowledgeItems: z.array(
      z.object({
        id,
        goalId: id,
        title: z.string().trim().min(1).max(80),
        status: z.enum(['in_progress', 'needs_consolidation', 'consolidated']),
        note: nullableText(300),
        consolidatedAt: date.nullable(),
        ...timestamps,
      }),
    ),
    goalStatusEvents: z.array(
      z.object({ id, goalId: id, status: goalStatus, occurredAt: date }),
    ),
    captures: z.array(
      z.object({
        id,
        userId: z.string(),
        content: z.string().trim().min(1).max(2000),
        type: z
          .enum(['idea', 'task', 'event', 'feeling', 'inspiration'])
          .nullable(),
        status: z.enum(['inbox', 'converted', 'archived']),
        convertedActionId: id.nullable(),
        ...timestamps,
      }),
    ),
  }),
}).superRefine((payload, context) => {
  if (payload.schemaVersion === 7) payload.data.actions.forEach((action, index) => {
    if (action.scheduledDate === undefined) context.addIssue({ code: 'custom', path: ['data', 'actions', index, 'scheduledDate'], message: 'v7 备份必须包含安排日期字段' });
  });
});
export function validateImport(raw: unknown): ExportPayload {
  const parsed = schema.safeParse(raw);
  if (!parsed.success)
    throw new AppError(
      'INVALID_BACKUP',
      '文件不是有效的 LifeKernelOS v6/v7 备份，请检查版本和内容。',
    );
  const payload: ExportPayload = { ...parsed.data, schemaVersion: 7, data: { ...parsed.data.data, actions: parsed.data.data.actions.map(action => ({ ...action, scheduledDate: action.scheduledDate ?? null })) } };
  const data = payload.data;
  const allIds = [
    data.goals,
    data.actions,
    data.knowledgeItems,
    data.goalReflections,
    data.goalStatusEvents,
    data.captures,
  ]
    .flat()
    .map((item) => item.id);
  const goals = new Map(data.goals.map((item) => [item.id, item]));
  const actions = new Map(data.actions.map((item) => [item.id, item]));
  const invalid = () => {
    throw new AppError(
      'INVALID_BACKUP',
      '备份中的记录关系不完整或状态冲突，原数据未更改。',
    );
  };
  if (allIds.length !== new Set(allIds).size) invalid();
  if (
    new Set(data.goalReflections.map((item) => item.goalId)).size !==
    data.goalReflections.length
  )
    invalid();
  for (const item of data.actions) {
    if (!goals.has(item.goalId)) invalid();
    if (
      item.parentActionId &&
      (item.parentActionId === item.id ||
        actions.get(item.parentActionId)?.goalId !== item.goalId)
    )
      invalid();
    const seen = new Set([item.id]);
    let parent = item.parentActionId;
    while (parent) {
      if (seen.has(parent)) invalid();
      seen.add(parent);
      parent = actions.get(parent)?.parentActionId ?? null;
    }
  }
  for (const item of [
    ...data.knowledgeItems,
    ...data.goalReflections,
    ...data.goalStatusEvents,
  ])
    if (!goals.has(item.goalId)) invalid();
  for (const item of data.captures) {
    if (item.convertedActionId && !actions.has(item.convertedActionId))
      invalid();
    if ((item.status === 'converted') !== Boolean(item.convertedActionId))
      invalid();
  }
  const current = data.currentContext?.selectedActionId;
  if (current) {
    const action = actions.get(current);
    if (
      action?.status !== 'available' ||
      goals.get(action.goalId)?.status !== 'active'
    )
      invalid();
  }
  return payload;
}
export function readBackup(path: string) {
  if (statSync(path).size > 16 * 1024 * 1024)
    throw new AppError('BACKUP_TOO_LARGE', '备份文件超过 16 MB。');
  const content = readFileSync(path, 'utf8');
  try {
    return validateImport(JSON.parse(content));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('INVALID_BACKUP', '无法读取这个 JSON 文件。');
  }
}
export function writeBackup(folder: string, payload: ExportPayload): string {
  mkdirSync(folder, { recursive: true });
  const filename = `lifekernel-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}.json`;
  const destination = join(folder, filename);
  const temporary = `${destination}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(payload, null, 2), { mode: 0o600 });
    renameSync(temporary, destination);
  } finally {
    try {
      unlinkSync(temporary);
    } catch {
      /* already renamed */
    }
  }
  const backups = readdirSync(folder)
    .filter((name) => /^lifekernel-.*\.json$/.test(name))
    .sort()
    .reverse();
  for (const old of backups.slice(10)) unlinkSync(join(folder, old));
  return destination;
}
export function restoreBackup(
  database: DatabaseContext,
  service: LifeKernelService,
  userId: string,
  raw: unknown,
  backupFolder: string,
) {
  const payload = validateImport(raw);
  writeBackup(backupFolder, service.exportData(userId));
  const data = payload.data;
  database.sqlite.transaction(() => {
    const sql = database.sqlite;
    sql.exec('PRAGMA defer_foreign_keys = ON');
    for (const table of [
      'current_contexts',
      'captures',
      'action_split_batches',
      'actions',
      'focus_reflections',
      'knowledge_items',
      'goal_status_events',
      'profile_descriptions',
      'focuses',
    ])
      sql.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(userId);
    for (const item of data.goals)
      sql
        .prepare(
          'INSERT INTO focuses (id, user_id, title, progress_percent, status, completed_at, created_at, updated_at, done_definition, goal_status) VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          item.id,
          userId,
          item.title,
          item.status === 'completed' ? 'completed' : 'active',
          item.completedAt,
          item.createdAt,
          item.updatedAt,
          item.doneDefinition,
          item.status,
        );
    for (const item of data.actions)
      sql
        .prepare(
          'INSERT INTO actions (id, user_id, focus_id, parent_action_id, title, content, scheduled_date, estimated_minutes, energy_required, status, blocker_note, outcome_note, resolved_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          item.id,
          userId,
          item.goalId,
          item.parentActionId,
          item.title,
          item.content,
          item.scheduledDate,
          item.estimatedMinutes,
          item.energyRequired,
          item.status,
          item.blockerNote,
          item.outcomeNote,
          item.resolvedAt,
          item.createdAt,
          item.updatedAt,
        );
    for (const item of data.goalReflections)
      sql
        .prepare(
          'INSERT INTO focus_reflections (id,user_id,focus_id,summary,created_at,updated_at) VALUES (?,?,?,?,?,?)',
        )
        .run(
          item.id,
          userId,
          item.goalId,
          item.summary,
          item.createdAt,
          item.updatedAt,
        );
    for (const item of data.knowledgeItems)
      sql
        .prepare(
          'INSERT INTO knowledge_items (id,user_id,focus_id,title,status,note,consolidated_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
        )
        .run(
          item.id,
          userId,
          item.goalId,
          item.title,
          item.status,
          item.note,
          item.consolidatedAt,
          item.createdAt,
          item.updatedAt,
        );
    for (const item of data.goalStatusEvents)
      sql
        .prepare(
          'INSERT INTO goal_status_events (id,user_id,goal_id,status,occurred_at) VALUES (?,?,?,?,?)',
        )
        .run(item.id, userId, item.goalId, item.status, item.occurredAt);
    for (const item of data.captures)
      sql
        .prepare(
          'INSERT INTO captures (id,user_id,content,type,status,converted_action_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
        )
        .run(
          item.id,
          userId,
          item.content,
          item.type,
          item.status,
          item.convertedActionId,
          item.createdAt,
          item.updatedAt,
        );
    const context = data.currentContext;
    if (context)
      sql
        .prepare(
          'INSERT INTO current_contexts (user_id,available_minutes,energy,state_recorded_at,selected_action_id,selected_at,updated_at) VALUES (?,?,?,?,?,?,?)',
        )
        .run(
          userId,
          context.availableMinutes,
          context.energy,
          context.stateRecordedAt,
          context.selectedActionId,
          context.selectedAt,
          context.updatedAt,
        );
    if (data.profileDescription)
      sql
        .prepare(
          'INSERT INTO profile_descriptions (user_id,content,updated_at) VALUES (?,?,?)',
        )
        .run(
          userId,
          data.profileDescription.content,
          data.profileDescription.updatedAt,
        );
  })();
  return {
    goals: data.goals.length,
    actions: data.actions.length,
    captures: data.captures.length,
  };
}
