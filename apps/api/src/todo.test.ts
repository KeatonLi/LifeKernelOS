import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readdirSync } from 'node:fs';
import { createDatabase } from './db.js';
import { LifeKernelService } from './services.js';
import { dispatch } from './commands.js';
import { restoreBackup, validateImport } from '../../desktop/src/restore.js';
import {
  calendarDays,
  isCalendarDate,
  localDay,
  shiftDay,
  shiftMonth,
} from '../../../shared/calendar.js';

async function workspace(context: {
  after: (fn: () => Promise<void>) => void;
}) {
  const folder = await mkdtemp(join(tmpdir(), 'lifekernel-todo-'));
  const database = createDatabase(join(folder, 'todo.sqlite'));
  const service = new LifeKernelService(database);
  const user = service.provisionInitialAccount(
    'todo@lifekernel.local',
    'test-hash',
  );
  const goal = service.createGoal(user.id, { title: '基础 Todo' });
  context.after(async () => {
    database.close();
    await rm(folder, { recursive: true, force: true });
  });
  return { folder, database, service, user, goal };
}
const code = (expected: string) => (error: unknown) =>
  (error as { code: string }).code === expected;

test('SPEC-0013：真实日期、闰年、跨月周与固定六行，不把本地日期转成 UTC', () => {
  for (const value of ['2024-02-29', '2000-02-29', '1900-01-01', '9999-12-31'])
    assert.ok(isCalendarDate(value));
  for (const value of [
    '2023-02-29',
    '1900-02-29',
    '2026-04-31',
    '2026-2-01',
    '2026-00-01',
    '2026-01-00',
    '10000-01-01',
    '2026-10-04T00:00:00Z',
  ])
    assert.equal(isCalendarDate(value), false);
  const leap = calendarDays('2024-02-20', 'month');
  assert.equal(leap.length, 42);
  assert.equal(leap[0], '2024-01-29');
  assert.ok(leap.includes('2024-02-29'));
  assert.deepEqual(calendarDays('2026-10-04', 'week'), [
    '2026-09-28',
    '2026-09-29',
    '2026-09-30',
    '2026-10-01',
    '2026-10-02',
    '2026-10-03',
    '2026-10-04',
  ]);
  assert.equal(shiftDay('2024-02-28', 1), '2024-02-29');
  assert.equal(shiftMonth('2026-01-31', 1), '2026-02-01');
  assert.equal(calendarDays('9999-12-31', 'month').length, 42);
  assert.equal(calendarDays('1900-01-01', 'month')[0], '1900-01-01');
  const original = process.env.TZ;
  try {
    for (const timezone of [
      'Asia/Shanghai',
      'America/Los_Angeles',
      'Pacific/Auckland',
    ]) {
      process.env.TZ = timezone;
      assert.equal(localDay(new Date(2026, 9, 4, 0, 15)), '2026-10-04');
      assert.equal(shiftDay('2026-03-08', 1), '2026-03-09');
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

test('SPEC-0013：日期创建、编辑、清除与非法日期拒绝保持完整内容', async (context) => {
  const { service, user, goal } = await workspace(context);
  const action = service.createGoalAction(user.id, goal.id, {
    title: '安排',
    content: '完整说明',
    scheduledDate: '2026-10-04',
  });
  assert.equal(service.listTodos(user.id)[0].scheduledDate, '2026-10-04');
  service.updateActionMetadata(user.id, action.id, {
    scheduledDate: '2026-10-06',
  });
  assert.equal(
    service.listGoalActions(user.id, goal.id)[0].scheduledDate,
    '2026-10-06',
  );
  assert.throws(
    () =>
      service.updateActionMetadata(user.id, action.id, {
        title: '不应保存',
        scheduledDate: '2026-02-30',
      }),
    code('VALIDATION_ERROR'),
  );
  assert.equal(service.listTodos(user.id)[0].title, '安排');
  const cleared = service.updateActionMetadata(user.id, action.id, {
    scheduledDate: null,
  });
  assert.equal(cleared.scheduledDate, null);
  assert.equal(cleared.content, '完整说明');
  service.updateActionMetadata(user.id, action.id, { scheduledDate: '2026-10-06' });
  service.selectCurrentAction(user.id, action.id);
  assert.throws(() => service.splitCurrentAction(user.id, { title: '无效拆分', scheduledDate: '2026-02-30' }), code('VALIDATION_ERROR'));
  assert.equal(service.getCurrentWorkspace(user.id).currentAction?.id, action.id);
  const inherited = service.splitCurrentAction(user.id, { title: '继承安排' }).action;
  assert.equal(inherited.scheduledDate, '2026-10-06');
  service.selectCurrentAction(user.id, inherited.id);
  const rescheduled = service.splitCurrentAction(user.id, { title: '更改安排', scheduledDate: '2026-10-08' }).action;
  assert.equal(rescheduled.scheduledDate, '2026-10-08');
  service.selectCurrentAction(user.id, rescheduled.id);
  assert.equal(service.splitCurrentAction(user.id, { title: '清除安排', scheduledDate: null }).action.scheduledDate, null);
});

test('SPEC-0013：直接勾选、撤销和移除只释放对应当前任务并重算进度', async (context) => {
  const { service, user, goal } = await workspace(context);
  const first = service.createGoalAction(user.id, goal.id, { title: 'A' });
  const second = service.createGoalAction(user.id, goal.id, {
    title: 'B',
    scheduledDate: '2026-10-04',
  });
  service.selectCurrentAction(user.id, first.id);
  service.changeActionStatus(user.id, second.id, 'completed', 'available');
  assert.equal(
    service.getCurrentWorkspace(user.id).currentAction?.id,
    first.id,
  );
  assert.equal(service.listGoals(user.id)[0].progress.progressPercent, 50);
  const reopened = service.changeActionStatus(
    user.id,
    second.id,
    'available',
    'completed',
  );
  assert.equal(reopened.resolvedAt, null);
  assert.equal(reopened.scheduledDate, '2026-10-04');
  assert.throws(
    () =>
      service.changeActionStatus(user.id, first.id, 'abandoned', 'available'),
    code('CONFIRMATION_REQUIRED'),
  );
  assert.equal(
    service.getCurrentWorkspace(user.id).currentAction?.id,
    first.id,
  );
  service.changeActionStatus(user.id, first.id, 'abandoned', 'available', true);
  assert.equal(service.getCurrentWorkspace(user.id).currentAction, null);
  assert.equal(service.listGoals(user.id)[0].progress.totalTodoCount, 1);
  service.changeActionStatus(user.id, first.id, 'available', 'abandoned');
  assert.equal(service.listGoals(user.id)[0].progress.totalTodoCount, 2);
  service.selectCurrentAction(user.id, second.id);
  service.changeActionStatus(user.id, second.id, 'completed', 'available');
  assert.equal(service.getCurrentWorkspace(user.id).currentAction, null);
});

test('SPEC-0013：旧窗口、越权用户、非 active 主线与已拆分任务不得错误处理', async (context) => {
  const { database, service, user, goal } = await workspace(context);
  const action = service.createGoalAction(user.id, goal.id, {
    title: '受保护',
  });
  service.changeActionStatus(user.id, action.id, 'completed', 'available');
  assert.throws(
    () =>
      service.changeActionStatus(
        user.id,
        action.id,
        'abandoned',
        'available',
        true,
      ),
    code('ACTION_CHANGED'),
  );
  assert.throws(
    () =>
      service.changeActionStatus(
        'other-user',
        action.id,
        'available',
        'completed',
      ),
    code('RESOURCE_NOT_FOUND'),
  );
  assert.deepEqual(service.listTodos('other-user'), []);
  service.changeGoalStatus(user.id, goal.id, 'paused');
  assert.throws(
    () =>
      service.changeActionStatus(user.id, action.id, 'available', 'completed'),
    code('GOAL_NOT_ACTIVE'),
  );
  service.changeGoalStatus(user.id, goal.id, 'active');
  service.changeActionStatus(user.id, action.id, 'available', 'completed');
  service.selectCurrentAction(user.id, action.id);
  service.splitCurrentAction(user.id, { title: '新的小步骤' });
  assert.throws(
    () =>
      service.changeActionStatus(user.id, action.id, 'available', 'superseded'),
    code('ACTION_SUPERSEDED'),
  );
  assert.equal(
    (
      database.sqlite
        .prepare('SELECT status FROM actions WHERE id = ?')
        .get(action.id) as { status: string }
    ).status,
    'superseded',
  );
});

test('SPEC-0013：IPC 日期与状态用例严格校验，不接受任意状态或身份', async (context) => {
  const { service, user, goal } = await workspace(context);
  const action = service.createGoalAction(user.id, goal.id, { title: 'IPC' });
  for (const body of [
    { status: 'completed' },
    { status: 'wrong', expectedStatus: 'available' },
    { status: 'completed', expectedStatus: 'available', userId: 'other' },
  ]) {
    assert.throws(
      () =>
        dispatch(service, user, {
          method: 'POST',
          path: `/api/actions/${action.id}/status`,
          body,
        }),
      code('VALIDATION_ERROR'),
    );
  }
  assert.throws(
    () =>
      dispatch(service, user, {
        method: 'PATCH',
        path: `/api/actions/${action.id}`,
        body: { scheduledDate: '2026-13-01' },
      }),
    code('VALIDATION_ERROR'),
  );
  assert.equal(
    (
      dispatch(service, user, { method: 'GET', path: '/api/todos' }) as {
        actions: unknown[];
      }
    ).actions.length,
    1,
  );
  dispatch(service, user, {
    method: 'POST',
    path: `/api/actions/${action.id}/status`,
    body: { status: 'completed', expectedStatus: 'available' },
  });
  assert.equal(service.listTodos(user.id)[0].status, 'completed');
});

test('SPEC-0013：v7 日期完整恢复，v6 补空，非法/缺失日期拒绝且不改原记录', async (context) => {
  const { service, database, user, goal, folder } = await workspace(context);
  service.createGoalAction(user.id, goal.id, {
    title: '备份日期',
    scheduledDate: '2024-02-29',
  });
  const payload = service.exportData(user.id);
  assert.equal(payload.schemaVersion, 7);
  restoreBackup(database, service, user.id, payload, join(folder, 'backups'));
  assert.equal(service.listTodos(user.id)[0].scheduledDate, '2024-02-29');
  const legacy = JSON.parse(JSON.stringify(payload));
  legacy.schemaVersion = 6;
  delete legacy.data.actions[0].scheduledDate;
  assert.equal(validateImport(legacy).data.actions[0].scheduledDate, null);
  restoreBackup(database, service, user.id, legacy, join(folder, 'backups'));
  assert.equal(service.listTodos(user.id)[0].scheduledDate, null);
  for (const value of ['2023-02-29', undefined]) {
    const invalid = structuredClone(payload);
    invalid.data.actions[0].scheduledDate = value as string;
    assert.throws(() => validateImport(invalid), code('INVALID_BACKUP'));
  }
  assert.equal(service.listTodos(user.id)[0].title, '备份日期');
});

test('SPEC-0013：真实 v6 数据库升级与重开不丢任务和当前选择', async (context) => {
  const folder = await mkdtemp(join(tmpdir(), 'lifekernel-v6-'));
  const migrations = join(folder, 'migrations');
  await mkdir(migrations);
  for (const name of readdirSync('db/migrations').filter(
    (name) => name < '007',
  ))
    await copyFile(join('db/migrations', name), join(migrations, name));
  let database = createDatabase(join(folder, 'old.sqlite'), migrations);
  context.after(async () => {
    database.close();
    await rm(folder, { recursive: true, force: true });
  });
  const service = new LifeKernelService(database);
  const user = service.provisionInitialAccount('v6@lifekernel.local', 'hash');
  const goal = service.createGoal(user.id, { title: '旧主线' });
  // Insert through the old SQL shape; the new service correctly requires migration 7.
  database.sqlite
    .prepare(
      'INSERT INTO actions (id,user_id,focus_id,title,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
    )
    .run(
      'old-action',
      user.id,
      goal.id,
      '旧内容',
      'available',
      new Date().toISOString(),
      new Date().toISOString(),
    );
  service.selectCurrentAction(user.id, 'old-action');
  database.close();
  database = createDatabase(join(folder, 'old.sqlite'));
  const upgraded = new LifeKernelService(database);
  assert.equal(upgraded.listTodos(user.id)[0].scheduledDate, null);
  assert.equal(
    upgraded.getCurrentWorkspace(user.id).currentAction?.id,
    'old-action',
  );
  assert.equal(database.sqlite.pragma('user_version', { simple: true }), 7);
  upgraded.updateActionMetadata(user.id, 'old-action', {
    scheduledDate: '2026-10-04',
  });
  database.close();
  database = createDatabase(join(folder, 'old.sqlite'));
  assert.equal(
    new LifeKernelService(database).listTodos(user.id)[0].scheduledDate,
    '2026-10-04',
  );
});
