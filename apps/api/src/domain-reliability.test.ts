import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDatabase } from './db.js';
import { LifeKernelService } from './services.js';
import { dispatch } from './commands.js';
import type { GoalStatus } from './types.js';

async function fixture(context: { after: (fn: () => Promise<void>) => void }) {
  const folder = await mkdtemp(join(tmpdir(), 'lk-domain-reliability-'));
  const path = join(folder, 'db.sqlite');
  const database = createDatabase(path);
  const service = new LifeKernelService(database);
  const user = service.provisionInitialAccount('domain@lk.test', 'LOCAL');
  context.after(async () => {
    database.close();
    await rm(folder, { recursive: true, force: true });
  });
  return { database, service, user, path };
}

test('SPEC-0010：主线与进度读取保持同一快照，不混入读取期间其他连接的新写入', async context => {
  const f = await fixture(context);
  const goal = f.service.createGoal(f.user.id, { title: '写入前的主线' });
  const action = f.service.createGoalAction(f.user.id, goal.id, { title: '尚未完成' });
  const concurrentDatabase = createDatabase(f.path);
  const concurrent = new LifeKernelService(concurrentDatabase);
  try {
    const prepare = f.database.sqlite.prepare.bind(f.database.sqlite);
    let interleaved = false;
    context.mock.method(f.database.sqlite, 'prepare', (sql: string) => {
      const statement = prepare(sql);
      return {
        ...statement,
        all: (...parameters: Parameters<typeof statement.all>) => {
          const rows = statement.all(...parameters);
          if (!interleaved && /FROM focuses\b/.test(sql)) {
            interleaved = true;
            concurrentDatabase.sqlite.transaction(() => {
              concurrent.updateGoal(f.user.id, goal.id, { title: '写入后的主线' });
              concurrent.changeActionStatus(f.user.id, action.id, 'completed', 'available');
            })();
          }
          return rows;
        },
      };
    });
    const snapshot = f.service.listGoals(f.user.id)[0];
    assert.equal(interleaved, true);
    assert.equal(snapshot.title, '写入前的主线');
    assert.deepEqual(snapshot.progress, { completedTodoCount: 0, totalTodoCount: 1, progressPercent: 0 });
    const latest = f.service.listGoals(f.user.id)[0];
    assert.equal(latest.title, '写入后的主线');
    assert.equal(latest.progress.progressPercent, 100);
  } finally {
    concurrentDatabase.close();
  }
});

test('SPEC-0010 / SPEC-0014：空 IPC 编辑被拒绝，不改变任务来源版本和当前状态', async context => {
  const { service, user } = await fixture(context);
  const goal = service.createGoal(user.id, { title: '保留来源版本' });
  const action = service.createGoalAction(user.id, goal.id, { title: '保留任务' });
  const knowledge = service.createKnowledgeItem(user.id, { goalId: goal.id, title: '保留知识' });
  const source = service.getSplitSource(user.id, action.id);
  const before = service.exportData(user.id).data;
  for (const request of [
    { method: 'PATCH', path: `/api/goals/${goal.id}` },
    { method: 'PATCH', path: `/api/actions/${action.id}` },
    { method: 'PATCH', path: `/api/knowledge/${knowledge.id}` },
    { method: 'PUT', path: '/api/current/context' },
  ]) {
    assert.throws(() => dispatch(service, user, { ...request, body: {} }), (error: unknown) => (error as { code: string }).code === 'VALIDATION_ERROR');
  }
  assert.deepEqual(service.exportData(user.id).data, before);
  assert.equal(service.getSplitSource(user.id, action.id).revision, source.revision);
  dispatch(service, user, { method: 'PATCH', path: `/api/actions/${action.id}`, body: { content: null } });
  assert.equal(service.listTodos(user.id)[0].content, null);
});

test('SPEC-0010 / SPEC-0011：聚合进度覆盖空主线、全部状态和跨用户隔离', async context => {
  const { database, service, user } = await fixture(context);
  const empty = service.createGoal(user.id, { title: '没有任务' });
  const statuses: GoalStatus[] = ['active', 'paused', 'completed', 'abandoned'];
  const mainlines = statuses.map(status => {
    const goal = service.createGoal(user.id, { title: `${status} 主线` });
    service.createGoalAction(user.id, goal.id, { title: '可用任务' });
    const complete = service.createGoalAction(user.id, goal.id, { title: '完成任务' });
    service.changeActionStatus(user.id, complete.id, 'completed', 'available');
    const blocked = service.createGoalAction(user.id, goal.id, { title: '阻塞任务' });
    service.selectCurrentAction(user.id, blocked.id);
    service.blockCurrentAction(user.id, '等待资料', blocked.id);
    const removed = service.createGoalAction(user.id, goal.id, { title: '移除任务' });
    service.changeActionStatus(user.id, removed.id, 'abandoned', 'available', true);
    const original = service.createGoalAction(user.id, goal.id, { title: '拆分原任务' });
    service.selectCurrentAction(user.id, original.id);
    service.splitCurrentAction(user.id, { expectedActionId: original.id, title: '新步骤' });
    if (status !== 'active') service.changeGoalStatus(user.id, goal.id, status, true);
    return goal.id;
  });
  const otherUser = randomUUID();
  database.sqlite.prepare('INSERT INTO users (id,email,password_hash,created_at) VALUES (?,?,?,?)')
    .run(otherUser, 'other-domain@lk.test', 'LOCAL', new Date().toISOString());
  const otherGoal = service.createGoal(otherUser, { title: '其他用户主线' });
  const otherAction = service.createGoalAction(otherUser, otherGoal.id, { title: '其他完成事实' });
  service.changeActionStatus(otherUser, otherAction.id, 'completed', 'available');
  const all = service.listGoals(user.id);
  assert.equal(all.length, 5);
  assert.deepEqual(all.find(goal => goal.id === empty.id)?.progress, { completedTodoCount: 0, totalTodoCount: 0, progressPercent: 0 });
  for (let index = 0; index < statuses.length; index++) {
    const listed = service.listGoals(user.id, statuses[index]);
    const goal = listed.find(item => item.id === mainlines[index])!;
    assert.deepEqual(goal.progress, { completedTodoCount: 1, totalTodoCount: 4, progressPercent: statuses[index] === 'completed' ? 100 : 25 });
  }
  const profile = service.getProfileView(user.id);
  assert.equal(profile.factSummary.completedActionCount, 4);
  assert.equal(profile.goals.length, 5);
  assert.equal(profile.graph.nodes.some(node => node.sourceId === otherGoal.id), false);
  for (const goal of all) assert.deepEqual(profile.goals.find(item => item.goal.id === goal.id)?.progress, goal.progress);
});

for (const status of ['paused', 'completed', 'abandoned'] as const) {
  test(`SPEC-0013：兼容完成接口不能处理 ${status} 主线下的任务`, async context => {
    const { service, user } = await fixture(context);
    const goal = service.createGoal(user.id, { title: '受保护的主线' });
    const action = service.createGoalAction(user.id, goal.id, { title: '保留任务' });
    service.changeGoalStatus(user.id, goal.id, status, true);
    const before = service.exportData(user.id).data;
    assert.throws(() => service.completeAction(user.id, action.id), (error: unknown) => (error as { code: string }).code === 'GOAL_NOT_ACTIVE');
    assert.deepEqual(service.exportData(user.id).data, before);
    service.changeGoalStatus(user.id, goal.id, 'active');
    assert.equal(service.completeAction(user.id, action.id).status, 'completed');
  });
}
