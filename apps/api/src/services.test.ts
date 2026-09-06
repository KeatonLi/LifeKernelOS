import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { createDatabase } from './db.js';
import { LifeKernelService } from './services.js';

test('SPEC-0010 / SPEC-0011：目标、行动、画像与知识沉淀形成可追溯闭环', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'lifekernel-test-'));
  const database = createDatabase(join(directory, 'lifekernel.sqlite'));
  context.after(async () => {
    database.close();
    await rm(directory, { recursive: true, force: true });
  });

  const service = new LifeKernelService(database);
  const user = service.provisionInitialAccount('demo@lifekernel.local', 'test-password-hash');
  const goal = service.createGoal(user.id, { title: '发布第一个独立产品', doneDefinition: '三位用户完成体验' });
  const firstAction = service.createGoalAction(user.id, goal.id, { title: '完成产品原型', content: '把可以点击的关键路径做出来。' });
  service.createGoalAction(user.id, goal.id, { title: '邀请三位用户体验' });
  service.selectCurrentAction(user.id, firstAction.id);
  assert.equal(service.completeCurrentAction(user.id).status, 'completed');

  const knowledge = service.createKnowledgeItem(user.id, {
    goalId: goal.id,
    title: '用户访谈的基本方法',
    note: '正在用真实访谈验证。'
  });
  assert.equal(knowledge.status, 'in_progress');
  assert.equal(service.updateKnowledgeItem(user.id, knowledge.id, { status: 'needs_consolidation' }).status, 'needs_consolidation');
  const consolidated = service.updateKnowledgeItem(user.id, knowledge.id, { status: 'consolidated' });
  assert.equal(consolidated.status, 'consolidated');
  assert.ok(consolidated.consolidatedAt);
  assert.equal(service.updateKnowledgeItem(user.id, knowledge.id, { status: 'in_progress' }).status, 'in_progress');

  const completedGoal = service.changeGoalStatus(user.id, goal.id, 'completed', true);
  assert.equal(completedGoal.status, 'completed');
  assert.ok(completedGoal.completedAt);
  assert.equal(service.upsertGoalReflection(user.id, goal.id, '完成了从想法到可体验原型的闭环。')?.summary, '完成了从想法到可体验原型的闭环。');
  assert.equal(service.upsertProfileDescription(user.id, '我正在通过真实用户反馈打磨产品。')?.content, '我正在通过真实用户反馈打磨产品。');

  const otherUserId = 'profile-isolation-user';
  database.sqlite.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)').run(otherUserId, 'other-profile@lifekernel.local', 'test-password-hash', new Date().toISOString());
  const otherGoal = service.createGoal(otherUserId, { title: '不应出现在当前画像的目标' });
  const otherKnowledge = service.createKnowledgeItem(otherUserId, { goalId: otherGoal.id, title: '不应出现的知识' });

  const profile = service.getProfileView(user.id);
  assert.equal(profile.factSummary.goalCount, 1);
  assert.equal(profile.factSummary.completedGoalCount, 1);
  assert.equal(profile.factSummary.completedActionCount, 1);
  assert.equal(profile.experiences[0]?.goal.title, goal.title);
  assert.equal(profile.experiences[0]?.progress.completedTodoCount, 1);
  assert.equal(profile.experiences[0]?.progress.totalTodoCount, 2);
  assert.equal(profile.experiences[0]?.progress.progressPercent, 100);
  assert.equal(profile.knowledgeItems[0]?.status, 'in_progress');
  assert.ok(profile.knowledgeItems[0]?.consolidatedAt);
  assert.equal(profile.graph.nodes.filter((node) => node.type === 'self').length, 1);
  assert.equal(profile.graph.nodes.find((node) => node.id === `goal:${goal.id}`)?.sourceId, goal.id);
  assert.ok(profile.graph.edges.some((edge) => edge.source === `goal:${goal.id}` && edge.target === `knowledge:${knowledge.id}`));
  assert.equal(profile.graph.nodes.some((node) => node.sourceId === otherGoal.id || node.sourceId === otherKnowledge.id), false);
});

test('SPEC-0007：导出当前用户的完整数据，并支持空数据导出', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'lifekernel-export-test-'));
  const database = createDatabase(join(directory, 'lifekernel.sqlite'));
  context.after(async () => {
    database.close();
    await rm(directory, { recursive: true, force: true });
  });

  const service = new LifeKernelService(database);
  const user = service.provisionInitialAccount('export@lifekernel.local', 'test-password-hash');
  const emptyExport = service.exportData(user.id);
  assert.equal(emptyExport.schemaVersion, 5);
  assert.deepEqual(emptyExport.data.goals, []);
  assert.deepEqual(emptyExport.data.actions, []);
  assert.deepEqual(emptyExport.data.goalReflections, []);
  assert.equal(emptyExport.data.profileDescription, null);
  assert.deepEqual(emptyExport.data.knowledgeItems, []);
  assert.deepEqual(emptyExport.data.goalStatusEvents, []);

  const goal = service.createGoal(user.id, { title: '整理个人作品集' });
  const action = service.createGoalAction(user.id, goal.id, { title: '完成项目说明', content: '说明项目解决的问题、做法与结果。' });
  service.selectCurrentAction(user.id, action.id);
  service.completeCurrentAction(user.id);
  service.changeGoalStatus(user.id, goal.id, 'completed', true);
  service.upsertGoalReflection(user.id, goal.id, '留下了完整的项目记录。');
  service.upsertProfileDescription(user.id, '我在持续整理自己的作品。');
  service.createKnowledgeItem(user.id, { goalId: goal.id, title: '项目复盘方法', note: '先记录事实。' });

  const exported = service.exportData(user.id);
  assert.equal(exported.schemaVersion, 5);
  assert.match(exported.exportedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(exported.data.goals.length, 1);
  assert.equal(exported.data.actions.length, 1);
  assert.equal(exported.data.actions[0]?.content, '说明项目解决的问题、做法与结果。');
  assert.equal(exported.data.goalReflections.length, 1);
  assert.equal(exported.data.profileDescription?.content, '我在持续整理自己的作品。');
  assert.equal(exported.data.knowledgeItems.length, 1);
  assert.equal(exported.data.goalStatusEvents.length, 1);
  assert.equal(JSON.stringify(exported).includes('password_hash'), false);
  assert.equal(service.findUserCredential(user.email)?.user.id, user.id);
});

test('SPEC-0010：多个目标共享唯一当前行动，并支持匹配与四种行动结果', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'lifekernel-v05-test-'));
  const database = createDatabase(join(directory, 'lifekernel.sqlite'));
  context.after(async () => {
    database.close();
    await rm(directory, { recursive: true, force: true });
  });

  const service = new LifeKernelService(database);
  const user = service.provisionInitialAccount('v05@lifekernel.local', 'test-password-hash');
  const firstGoal = service.createGoal(user.id, { title: '完成独立产品', doneDefinition: '有用户开始使用' });
  const secondGoal = service.createGoal(user.id, { title: '建立稳定运动习惯' });
  assert.equal(service.listGoals(user.id, 'active').length, 2);

  const firstAction = service.createGoalAction(user.id, firstGoal.id, { title: '整理产品首页文案', estimatedMinutes: 15, energyRequired: 'low' });
  const secondAction = service.createGoalAction(user.id, firstGoal.id, { title: '实现支付流程', estimatedMinutes: 60, energyRequired: 'high' });
  const thirdAction = service.createGoalAction(user.id, secondGoal.id, { title: '安排一次短跑', estimatedMinutes: 30, energyRequired: 'low' });
  const currentContext = service.recordCurrentContext(user.id, { availableMinutes: 30, energy: 'low' });
  assert.equal(currentContext.availableMinutes, 30);
  assert.deepEqual(service.getCurrentWorkspace(user.id).strictMatches.map((action) => action.id).sort(), [firstAction.id, thirdAction.id].sort());

  service.selectCurrentAction(user.id, firstAction.id);
  assert.equal(service.getCurrentWorkspace(user.id).currentAction?.id, firstAction.id);
  assert.equal(service.listGoalActions(user.id, firstGoal.id).find((action) => action.id === firstAction.id)?.status, 'available');
  service.selectCurrentAction(user.id, thirdAction.id);
  assert.equal(service.getCurrentWorkspace(user.id).currentAction?.id, thirdAction.id);
  database.sqlite.prepare('UPDATE current_contexts SET state_recorded_at = ? WHERE user_id = ?').run(new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), user.id);
  assert.equal(service.getCurrentWorkspace(user.id).contextIsStale, true);
  assert.deepEqual(service.getCurrentWorkspace(user.id).strictMatches, []);
  service.recordCurrentContext(user.id, { availableMinutes: 30, energy: 'low' });
  assert.equal(service.getCurrentWorkspace(user.id).contextIsStale, false);
  assert.throws(() => service.changeGoalStatus(user.id, secondGoal.id, 'paused'), /请先处理/);

  const completed = service.completeCurrentAction(user.id, '已经完成第一次尝试');
  assert.equal(completed.status, 'completed');
  assert.equal(service.getCurrentContext(user.id)?.selectedActionId, null);

  service.selectCurrentAction(user.id, firstAction.id);
  const split = service.splitCurrentAction(user.id, { title: '只整理首页第一屏', estimatedMinutes: 5, energyRequired: 'low' });
  assert.equal(split.original.status, 'superseded');
  assert.equal(split.action.parentActionId, firstAction.id);
  service.selectCurrentAction(user.id, split.action.id);
  assert.equal(service.blockCurrentAction(user.id, '需要先拿到接口权限').status, 'blocked');
  service.selectCurrentAction(user.id, secondAction.id);
  assert.equal(service.abandonCurrentAction(user.id, '本周不做支付').status, 'abandoned');

  const paused = service.changeGoalStatus(user.id, firstGoal.id, 'paused');
  assert.equal(paused.status, 'paused');
  assert.equal(service.changeGoalStatus(user.id, firstGoal.id, 'active').status, 'active');
  assert.equal(service.changeGoalStatus(user.id, secondGoal.id, 'completed', true).status, 'completed');
  assert.equal(service.changeGoalStatus(user.id, secondGoal.id, 'active').status, 'active');
  assert.equal((database.sqlite.prepare('SELECT COUNT(*) AS count FROM goal_status_events WHERE user_id = ? AND goal_id = ?').get(user.id, secondGoal.id) as { count: number }).count, 2);
  assert.equal(service.changeGoalStatus(user.id, secondGoal.id, 'active').status, 'active');
  assert.equal((database.sqlite.prepare('SELECT COUNT(*) AS count FROM goal_status_events WHERE user_id = ? AND goal_id = ?').get(user.id, secondGoal.id) as { count: number }).count, 2);
});

test('SPEC-0010：To-do 内容与主线进度由有效 To-do 自动推导', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'lifekernel-progress-test-'));
  const database = createDatabase(join(directory, 'lifekernel.sqlite'));
  context.after(async () => {
    database.close();
    await rm(directory, { recursive: true, force: true });
  });

  const service = new LifeKernelService(database);
  const user = service.provisionInitialAccount('progress@lifekernel.local', 'test-password-hash');
  const goal = service.createGoal(user.id, { title: '完成作品集重构' });
  const completed = service.createGoalAction(user.id, goal.id, { title: '整理首页', content: '列出三个代表作品和各自成果。' });
  const available = service.createGoalAction(user.id, goal.id, { title: '补充案例页' });
  const blocked = service.createGoalAction(user.id, goal.id, { title: '补齐截图素材' });
  const abandoned = service.createGoalAction(user.id, goal.id, { title: '制作宣传视频' });
  const splitOrigin = service.createGoalAction(user.id, goal.id, { title: '搭建作品详情页' });

  assert.equal(service.updateActionMetadata(user.id, available.id, { content: '先补充问题、方案和最终结果。' }).content, '先补充问题、方案和最终结果。');
  service.selectCurrentAction(user.id, completed.id);
  service.completeCurrentAction(user.id);
  service.selectCurrentAction(user.id, blocked.id);
  service.blockCurrentAction(user.id, '等待素材授权');
  service.selectCurrentAction(user.id, abandoned.id);
  service.abandonCurrentAction(user.id, '现阶段不需要');
  service.selectCurrentAction(user.id, splitOrigin.id);
  const replacement = service.splitCurrentAction(user.id, { title: '只搭建详情页结构', content: '先建立标题、问题、方案和结果四个区块。' }).action;

  const progress = service.listGoals(user.id).find((mainline) => mainline.id === goal.id)?.progress;
  assert.deepEqual(progress, { completedTodoCount: 1, totalTodoCount: 4, progressPercent: 25 });
  assert.equal(service.listGoalActions(user.id, goal.id).find((action) => action.id === replacement.id)?.content, '先建立标题、问题、方案和结果四个区块。');
  assert.deepEqual(service.getProfileView(user.id).graph.nodes.find((node) => node.id === `goal:${goal.id}`)?.progress, progress);

  service.changeGoalStatus(user.id, goal.id, 'completed', true);
  assert.equal(service.listGoals(user.id).find((mainline) => mainline.id === goal.id)?.progress.progressPercent, 100);
  assert.equal(service.getProfileView(user.id).graph.nodes.find((node) => node.id === `goal:${goal.id}`)?.progress?.progressPercent, 100);
});

test('兼容接口不会留下失效的当前行动选择', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'lifekernel-legacy-state-test-'));
  const database = createDatabase(join(directory, 'lifekernel.sqlite'));
  context.after(async () => {
    database.close();
    await rm(directory, { recursive: true, force: true });
  });

  const service = new LifeKernelService(database);
  const user = service.provisionInitialAccount('legacy-state@lifekernel.local', 'test-password-hash');
  const goal = service.createGoal(user.id, { title: '兼容旧客户端' });
  const action = service.createGoalAction(user.id, goal.id, { title: '完成兼容测试' });
  service.selectCurrentAction(user.id, action.id);

  assert.equal(service.completeAction(user.id, action.id).status, 'completed');
  assert.equal(service.getCurrentContext(user.id)?.selectedActionId, null);

  const secondAction = service.createGoalAction(user.id, goal.id, { title: '完成第二次兼容测试' });
  service.selectCurrentAction(user.id, secondAction.id);
  assert.throws(
    () => service.updateLegacyFocusProgress(user.id, goal.id, 100),
    (error: unknown) => (error as { code?: string }).code === 'CURRENT_ACTION_MUST_BE_HANDLED'
  );
  service.completeAction(user.id, secondAction.id);
  assert.equal(service.updateLegacyFocusProgress(user.id, goal.id, 100).status, 'completed');
  assert.equal((database.sqlite.prepare('SELECT COUNT(*) AS count FROM goal_status_events WHERE user_id = ? AND goal_id = ? AND status = ?').get(user.id, goal.id, 'completed') as { count: number }).count, 1);

  const staleGoal = service.createGoal(user.id, { title: '清理历史残留选择' });
  const staleAction = service.createGoalAction(user.id, staleGoal.id, { title: '制造一个旧状态' });
  service.selectCurrentAction(user.id, staleAction.id);
  database.sqlite.prepare("UPDATE actions SET status = 'blocked' WHERE id = ?").run(staleAction.id);
  assert.equal(service.getCurrentWorkspace(user.id).currentAction, null);
  assert.equal(service.getCurrentContext(user.id)?.selectedActionId, null);
});

test('SPEC-0010：旧 Focus / Action 数据迁移到产品 0.5 且可重复启动', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'lifekernel-migration-test-'));
  const databasePath = join(directory, 'lifekernel.sqlite');
  const legacy = new Database(databasePath);
  legacy.pragma('foreign_keys = ON');
  legacy.exec(readFileSync(resolve(process.cwd(), 'db/migrations/001_initial.sql'), 'utf8'));
  legacy.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)').run('legacy-user', 'legacy@lifekernel.local', 'legacy-hash', new Date().toISOString());
  legacy.prepare('INSERT INTO focuses (id, user_id, title, progress_percent, status, completed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('legacy-focus', 'legacy-user', '迁移前的目标', 42, 'active', null, new Date().toISOString(), new Date().toISOString());
  legacy.prepare('INSERT INTO actions (id, user_id, focus_id, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('legacy-action', 'legacy-user', 'legacy-focus', '迁移前的行动', 'available', new Date().toISOString(), new Date().toISOString());
  legacy.close();

  const database = createDatabase(databasePath);
  let databaseClosed = false;
  let reopened: ReturnType<typeof createDatabase> | null = null;
  context.after(async () => {
    if (!databaseClosed) database.close();
    reopened?.close();
    await rm(directory, { recursive: true, force: true });
  });
  const service = new LifeKernelService(database);
  assert.equal(database.sqlite.pragma('user_version', { simple: true }), 5);
  assert.ok(database.sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'current_contexts'").get());
  assert.ok(database.sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'goal_status_events'").get());
  assert.ok(database.sqlite.prepare("SELECT 1 FROM pragma_table_info('actions') WHERE name = 'content'").get());
  assert.equal(service.listGoals('legacy-user')[0]?.status, 'active');
  assert.equal(service.listGoalActions('legacy-user', 'legacy-focus')[0]?.title, '迁移前的行动');
  assert.equal(service.listGoalActions('legacy-user', 'legacy-focus')[0]?.content, null);
  service.createGoal('legacy-user', { title: '迁移后的第二个并行目标' });
  assert.equal(service.listGoals('legacy-user', 'active').length, 2);
  const migratedGoal = database.sqlite.prepare('SELECT goal_status, done_definition FROM focuses WHERE id = ?').get('legacy-focus') as { goal_status: string; done_definition: string | null };
  assert.equal(migratedGoal.goal_status, 'active');

  database.close();
  databaseClosed = true;
  reopened = createDatabase(databasePath);
  assert.equal(reopened.sqlite.pragma('user_version', { simple: true }), 5);
  assert.equal((reopened.sqlite.prepare('SELECT COUNT(*) AS count FROM actions').get() as { count: number }).count, 1);
  assert.equal((reopened.sqlite.prepare("SELECT COUNT(*) AS count FROM focuses WHERE goal_status = 'active'").get() as { count: number }).count, 2);
});
