import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createDatabase } from '../../api/src/db.js';
import { LifeKernelService } from '../../api/src/services.js';
import { dispatch } from '../../api/src/commands.js';
import { restoreBackup, validateImport, writeBackup } from './restore.js';

async function workspace(context: {
  after: (fn: () => Promise<void>) => void;
}) {
  const folder = await mkdtemp(join(tmpdir(), 'lifekernel-desktop-'));
  const database = createDatabase(
    join(folder, 'local.sqlite'),
    resolve('db/migrations'),
  );
  const service = new LifeKernelService(database);
  const user = service.provisionInitialAccount(
    'local@lifekernel.desktop',
    'LOCAL_ONLY_NO_LOGIN',
  );
  context.after(async () => {
    database.close();
    await rm(folder, { recursive: true, force: true });
  });
  return { folder, database, service, user };
}
const code = (expected: string) => (error: unknown) =>
  (error as { code: string }).code === expected;

test('SPEC-0012：IPC 拒绝未注册用例、非法状态和未校验的当前操作', async (context) => {
  const { service, user } = await workspace(context);
  assert.throws(
    () =>
      dispatch(service, user, {
        method: 'POST',
        path: '/api/sql',
        body: { sql: 'DELETE FROM users' },
      }),
    code('COMMAND_NOT_ALLOWED'),
  );
  assert.throws(
    () =>
      dispatch(service, user, {
        method: 'GET',
        path: '/api/goals?status=wrong',
      }),
    code('VALIDATION_ERROR'),
  );
  assert.throws(
    () =>
      dispatch(service, user, {
        method: 'POST',
        path: '/api/current/complete',
      }),
    code('VALIDATION_ERROR'),
  );
  assert.throws(
    () =>
      dispatch(service, user, {
        method: 'POST',
        path: '/api/goals',
        body: { title: '主线', userId: 'other' },
      }),
    code('VALIDATION_ERROR'),
  );
  assert.equal(service.listGoals(user.id).length, 0);
});

test('SPEC-0012：两个窗口的旧完成、拆小、卡住、放弃和释放不能处理另一行动', async (context) => {
  const { service, user } = await workspace(context);
  const goal = service.createGoal(user.id, { title: '客户端' });
  const a = service.createGoalAction(user.id, goal.id, { title: 'A' });
  const b = service.createGoalAction(user.id, goal.id, { title: 'B' });
  service.selectCurrentAction(user.id, a.id);
  service.selectCurrentAction(user.id, b.id);
  const requests = [
    {
      method: 'POST',
      path: '/api/current/complete',
      body: { expectedActionId: a.id },
    },
    {
      method: 'POST',
      path: '/api/current/block',
      body: { expectedActionId: a.id },
    },
    {
      method: 'POST',
      path: '/api/current/abandon',
      body: { expectedActionId: a.id },
    },
    {
      method: 'POST',
      path: '/api/current/split',
      body: { expectedActionId: a.id, title: '更小一步' },
    },
    {
      method: 'DELETE',
      path: '/api/current/select',
      body: { expectedActionId: a.id },
    },
  ];
  for (const request of requests)
    assert.throws(
      () => dispatch(service, user, request),
      code('CURRENT_ACTION_CHANGED'),
    );
  assert.equal(service.getCurrentWorkspace(user.id).currentAction?.id, b.id);
  assert.equal(
    service
      .listGoalActions(user.id, goal.id)
      .every((action) => action.status === 'available'),
    true,
  );
});

test('SPEC-0012：2000 字符收集完整转行动，阻塞可恢复，重开保存事实', async (context) => {
  const { service, user, folder } = await workspace(context);
  const goal = service.createGoal(user.id, { title: '保存与恢复' });
  const capture = service.createCapture(user.id, {
    content: '想'.repeat(2000),
  });
  const { action } = service.convertCaptureToAction(user.id, capture.id, {
    goalId: goal.id,
    title: '完整内容',
  });
  assert.equal(action.content?.length, 2000);
  assert.throws(
    () =>
      dispatch(service, user, {
        method: 'POST',
        path: `/api/goals/${goal.id}/actions`,
        body: { title: '太长', content: '字'.repeat(2001) },
      }),
    code('VALIDATION_ERROR'),
  );
  service.selectCurrentAction(user.id, action.id);
  service.blockCurrentAction(user.id, '等待反馈', action.id);
  assert.equal(service.resumeAction(user.id, action.id).status, 'available');
  service.selectCurrentAction(user.id, action.id);
  const second = createDatabase(
    join(folder, 'local.sqlite'),
    resolve('db/migrations'),
  );
  try {
    const reopened = new LifeKernelService(second);
    assert.equal(
      reopened.getCurrentWorkspace(user.id).currentAction?.content,
      capture.content,
    );
    assert.equal(reopened.findUserCredential(user.email)?.user.id, user.id);
  } finally {
    second.close();
  }
});

test('SPEC-0012：旧服务端 JSON 在新本地身份恢复所有关系，导入前留备份', async (context) => {
  const { folder, database, service, user } = await workspace(context);
  const goal = service.createGoal(user.id, { title: '完成来源' });
  const original = service.createGoalAction(user.id, goal.id, {
    title: '原始步骤',
  });
  service.selectCurrentAction(user.id, original.id);
  const { action: child } = service.splitCurrentAction(user.id, {
    title: '更小的步骤',
    expectedActionId: original.id,
  });
  const capture = service.createCapture(user.id, {
    content: '保留来源',
    type: 'inspiration',
  });
  const converted = service.convertCaptureToAction(user.id, capture.id, {
    goalId: goal.id,
    title: '来源行动',
  });
  service.selectCurrentAction(user.id, converted.action.id);
  service.completeCurrentAction(user.id, '成功', converted.action.id);
  service.createKnowledgeItem(user.id, {
    goalId: goal.id,
    title: '领域知识',
    note: '知识内容',
  });
  service.upsertProfileDescription(user.id, '真实的我');
  const completed = service.createGoal(user.id, { title: '已完成主线' });
  service.changeGoalStatus(user.id, completed.id, 'completed', true);
  service.upsertGoalReflection(user.id, completed.id, '经历');
  service.selectCurrentAction(user.id, child.id);
  const snapshot = service.exportData(user.id);
  assert.equal(JSON.stringify(snapshot).includes('password'), false);
  const replacement = service.createGoal(user.id, { title: '导入前的记录' });
  restoreBackup(database, service, user.id, snapshot, join(folder, 'backups'));
  assert.deepEqual(service.exportData(user.id).data, snapshot.data);
  const backup = JSON.parse(
    readFileSync(
      join(folder, 'backups', readdirSync(join(folder, 'backups'))[0]),
      'utf8',
    ),
  );
  assert.equal(
    backup.data.goals.some(
      (item: { id: string }) => item.id === replacement.id,
    ),
    true,
  );
  const another = createDatabase(
    join(folder, 'fresh.sqlite'),
    resolve('db/migrations'),
  );
  try {
    const freshService = new LifeKernelService(another);
    const freshUser = freshService.provisionInitialAccount(
      'fresh@local.desktop',
      'LOCAL_ONLY',
    );
    restoreBackup(
      another,
      freshService,
      freshUser.id,
      snapshot,
      join(folder, 'fresh-backups'),
    );
    const result = freshService.exportData(freshUser.id);
    assert.equal(result.data.actions.length, snapshot.data.actions.length);
    assert.equal(result.data.actions[0].userId, freshUser.id);
    assert.equal(result.data.currentContext?.selectedActionId, child.id);
    assert.deepEqual(
      freshService.getProfileView(freshUser.id).factSummary,
      service.getProfileView(user.id).factSummary,
    );
  } finally {
    another.close();
  }
});

test('SPEC-0012：坏备份与事务插入失败保留全部原记录，最多 10 份备份', async (context) => {
  const { folder, database, service, user } = await workspace(context);
  const goal = service.createGoal(user.id, { title: '必须保留' });
  service.createGoalAction(user.id, goal.id, { title: '不能丢失' });
  const before = service.exportData(user.id);
  const invalid = structuredClone(before);
  invalid.data.actions[0].goalId = '00000000-0000-4000-8000-000000000000';
  assert.throws(
    () =>
      restoreBackup(
        database,
        service,
        user.id,
        invalid,
        join(folder, 'backups'),
      ),
    code('INVALID_BACKUP'),
  );
  assert.deepEqual(service.exportData(user.id).data, before.data);
  database.sqlite.exec(
    "CREATE TRIGGER reject_import BEFORE INSERT ON focuses BEGIN SELECT RAISE(ABORT, 'forced failure'); END;",
  );
  assert.throws(
    () =>
      restoreBackup(
        database,
        service,
        user.id,
        before,
        join(folder, 'backups'),
      ),
    /forced failure/,
  );
  assert.deepEqual(service.exportData(user.id).data, before.data);
  for (let i = 0; i < 12; i++) writeBackup(join(folder, 'backups'), before);
  assert.equal(readdirSync(join(folder, 'backups')).length, 10);
  assert.throws(
    () => validateImport({ ...before, schemaVersion: 99 }),
    code('INVALID_BACKUP'),
  );
});
