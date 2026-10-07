import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createDatabase } from './db.js';
import { LifeKernelService } from './services.js';
import { restoreBackup } from '../../desktop/src/restore.js';
import type { AppError } from './types.js';
const code = (value: string) => (error: unknown) => (error as AppError).code === value;
async function fixture(context: { after: (fn: () => Promise<void>) => void }) {
  const folder = await mkdtemp(join(tmpdir(), 'lk-ai-domain-'));
  let database = createDatabase(join(folder, 'db.sqlite'));
  let service = new LifeKernelService(database);
  const user = service.provisionInitialAccount('local@lk.test', 'LOCAL');
  const otherUser = { id: randomUUID() };
  database.sqlite.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .run(otherUser.id, 'other@lk.test', 'LOCAL', new Date().toISOString());
  const goal = service.createGoal(user.id, { title: '产品' });
  const action = service.createGoalAction(user.id, goal.id, { title: '实现功能', content: '原内容', scheduledDate: '2026-10-04' });
  context.after(async () => { database.close(); await rm(folder, { recursive: true, force: true }); });
  return { folder, user, otherUser, goal, action, get database() { return database; }, get service() { return service; },
    input() { return { operationId: randomUUID(), actionId: action.id, sourceRevision: service.getSplitSource(user.id, action.id).revision,
      steps: [{ title: '第一步', content: '完整内容' }, { title: '第二步' }] }; },
    reopen() { database.close(); database = createDatabase(join(folder, 'db.sqlite')); service = new LifeKernelService(database); } };
}
test('SPEC-0014：拆解与撤销原子更新进度、来源、日期与当前选择，重启后重试不重复', async context => {
  const f = await fixture(context);
  f.service.selectCurrentAction(f.user.id, f.action.id);
  const input = f.input(), result = f.service.applyAiSplit(f.user.id, input);
  assert.equal(result.original.status, 'superseded');
  assert.equal(result.actions.length, 2);
  assert.equal(f.service.getCurrentWorkspace(f.user.id).currentAction, null);
  assert.equal(f.service.listGoals(f.user.id).find(goal => goal.id === f.goal.id)!.progress.totalTodoCount, 2);
  assert.ok(result.actions.every(item => item.parentActionId === f.action.id && item.scheduledDate === f.action.scheduledDate));
  f.reopen();
  assert.deepEqual(f.service.applyAiSplit(f.user.id, input), result);
  assert.equal(f.service.listTodos(f.user.id).length, 3);
  assert.throws(() => f.service.applyAiSplit(f.user.id, { ...input, steps: [{ title: '不同请求' }] }), code('AI_OPERATION_CHANGED'));
  const undo = f.service.undoAiSplit(f.user.id, result.operationId);
  assert.equal(undo.original.status, 'available'); assert.equal(undo.original.content, f.action.content);
  assert.ok(undo.actions.every(item => item.status === 'abandoned'));
  assert.equal(f.service.listGoals(f.user.id).find(goal => goal.id === f.goal.id)!.progress.totalTodoCount, 1);
  assert.equal(f.service.undoAiSplit(f.user.id, result.operationId).undone, true);
});
test('SPEC-0014：撤销恢复被卡住的原任务，不抹掉原因', async context => {
  const f = await fixture(context);
  f.service.selectCurrentAction(f.user.id, f.action.id);
  f.service.blockCurrentAction(f.user.id, '不知道从哪里开始', f.action.id);
  const input = f.input(), result = f.service.applyAiSplit(f.user.id, input);
  const undo = f.service.undoAiSplit(f.user.id, result.operationId);
  assert.equal(undo.original.status, 'blocked'); assert.equal(undo.original.blockerNote, '不知道从哪里开始');
});
test('SPEC-0014：撤销后重启并重试采纳返回已撤销事实，不重复创建步骤', async context => {
  const f = await fixture(context), input = f.input();
  const applied = f.service.applyAiSplit(f.user.id, input);
  const undone = f.service.undoAiSplit(f.user.id, applied.operationId);
  f.reopen();
  assert.deepEqual(f.service.applyAiSplit(f.user.id, input), undone);
  assert.equal(f.service.listTodos(f.user.id).length, 3);
  assert.equal(undone.original.status, 'available');
  assert.ok(undone.actions.every(action => action.status === 'abandoned'));
});
for (const change of ['edit', 'complete', 'current', 'source', 'paused'] as const) {
  test(`SPEC-0014：${change} 后拒绝撤销，保留用户后续工作`, async context => {
    const f = await fixture(context), result = f.service.applyAiSplit(f.user.id, f.input());
    if (change === 'edit') f.service.updateActionMetadata(f.user.id, result.actions[0].id, { content: '新的用户内容' });
    if (change === 'complete') f.service.changeActionStatus(f.user.id, result.actions[0].id, 'completed', 'available');
    if (change === 'current') f.service.selectCurrentAction(f.user.id, result.actions[0].id);
    if (change === 'source') f.service.updateActionMetadata(f.user.id, result.original.id, { title: '修改原任务' });
    if (change === 'paused') f.service.changeGoalStatus(f.user.id, f.goal.id, 'paused');
    const before = f.service.exportData(f.user.id).data;
    assert.throws(() => f.service.undoAiSplit(f.user.id, result.operationId), code('AI_UNDO_CONFLICT'));
    assert.deepEqual(f.service.exportData(f.user.id).data, before);
  });
}
test('SPEC-0014：部分步骤写入失败全部回滚，源内容/主线变更与越权拒绝', async context => {
  const f = await fixture(context), input = f.input();
  f.service.selectCurrentAction(f.user.id, f.action.id);
  f.database.sqlite.exec("CREATE TRIGGER fail_ai_step BEFORE INSERT ON actions WHEN NEW.title = 'fail' BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
  assert.throws(() => f.service.applyAiSplit(f.user.id, { ...input, steps: [{ title: '可以写入' }, { title: 'fail' }] }));
  assert.equal(f.service.listTodos(f.user.id).length, 1);
  assert.equal(f.service.getCurrentWorkspace(f.user.id).currentAction?.id, f.action.id);
  assert.equal((f.database.sqlite.prepare('SELECT count(*) AS n FROM action_split_batches').get() as { n: number }).n, 0);
  assert.throws(() => f.service.getSplitSource(f.otherUser.id, f.action.id));
  assert.throws(() => f.service.applyAiSplit(f.otherUser.id, input));
  f.service.updateActionMetadata(f.user.id, f.action.id, { title: '同毫秒也能识别的修改' });
  assert.throws(() => f.service.applyAiSplit(f.user.id, input), code('AI_SOURCE_CHANGED'));
});
test('SPEC-0014：v7 任务来源完整恢复，导入清除旧操作回执', async context => {
  const f = await fixture(context), input = f.input();
  f.service.applyAiSplit(f.user.id, input);
  const data = f.service.exportData(f.user.id);
  assert.equal(data.schemaVersion, 7); assert.equal('apiKey' in data, false);
  restoreBackup(f.database, f.service, f.user.id, data, join(f.folder, 'backups'));
  assert.equal(f.service.listTodos(f.user.id).filter(item => item.parentActionId === f.action.id).length, 2);
  assert.throws(() => f.service.undoAiSplit(f.user.id, input.operationId), code('AI_OPERATION_NOT_FOUND'));
});
