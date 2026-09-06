import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { hashPassword } from './auth.js';
import { createDatabase } from './db.js';
import { buildApp } from './server.js';

function cookieFrom(response: { headers: Record<string, string | string[] | number | undefined> }): string {
  const header = response.headers['set-cookie'];
  const value = Array.isArray(header) ? header[0] : header;
  assert.ok(value, '登录响应应设置会话 Cookie');
  return String(value).split(';', 1)[0];
}

test('SPEC-0008：HTTP 身份边界保护业务数据，并能创建和失效会话', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'lifekernel-http-test-'));
  const database = createDatabase(join(directory, 'lifekernel.sqlite'));
  const { app, service } = buildApp(database);
  context.after(async () => {
    await app.close();
    database.close();
    await rm(directory, { recursive: true, force: true });
  });

  const password = 'valid-test-password';
  const user = service.provisionInitialAccount('owner@lifekernel.local', await hashPassword(password));
  const stored = database.sqlite.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id) as { password_hash: string };
  assert.notEqual(stored.password_hash, password);
  assert.match(stored.password_hash, /^scrypt\$/);

  const anonymous = await app.inject({ method: 'GET', url: '/api/goals' });
  assert.equal(anonymous.statusCode, 401);

  const invalidLogin = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: user.email, password: 'not-the-password' }
  });
  assert.equal(invalidLogin.statusCode, 401);

  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { origin: 'http://127.0.0.1:3000', host: '127.0.0.1:3000' },
    payload: { email: user.email, password }
  });
  assert.equal(login.statusCode, 200);
  assert.match(String(login.headers['set-cookie']), /HttpOnly/);
  const ownerCookie = cookieFrom(login);

  const emptyExportResponse = await app.inject({ method: 'GET', url: '/api/export', headers: { cookie: ownerCookie } });
  assert.equal(emptyExportResponse.statusCode, 200);
  const emptyExport = emptyExportResponse.json() as { data: { goals: unknown[]; actions: unknown[]; goalReflections: unknown[]; profileDescription: unknown; knowledgeItems: unknown[]; goalStatusEvents: unknown[] } };
  assert.deepEqual(emptyExport.data.goals, []);
  assert.deepEqual(emptyExport.data.actions, []);
  assert.deepEqual(emptyExport.data.goalReflections, []);
  assert.equal(emptyExport.data.profileDescription, null);
  assert.deepEqual(emptyExport.data.knowledgeItems, []);
  assert.deepEqual(emptyExport.data.goalStatusEvents, []);

  const createGoal = await app.inject({
    method: 'POST',
    url: '/api/goals',
    headers: { cookie: ownerCookie },
    payload: { title: '发布第一个独立产品' }
  });
  assert.equal(createGoal.statusCode, 201);
  const goalId = (createGoal.json() as { goal: { id: string } }).goal.id;

  const anonymousExport = await app.inject({ method: 'GET', url: '/api/export' });
  assert.equal(anonymousExport.statusCode, 401);

  const createAction = await app.inject({
    method: 'POST',
    url: `/api/goals/${goalId}/actions`,
    headers: { cookie: ownerCookie },
    payload: { title: '整理项目说明', content: '从用户问题、解决方案和结果三个部分说明项目。' }
  });
  assert.equal(createAction.statusCode, 201);
  const actionId = (createAction.json() as { action: { id: string; content: string | null } }).action.id;
  assert.equal((createAction.json() as { action: { content: string | null } }).action.content, '从用户问题、解决方案和结果三个部分说明项目。');
  const updateAction = await app.inject({
    method: 'PATCH',
    url: `/api/actions/${actionId}`,
    headers: { cookie: ownerCookie },
    payload: { content: '用真实用户反馈补充项目说明。' }
  });
  assert.equal(updateAction.statusCode, 200);
  assert.equal((updateAction.json() as { action: { content: string | null } }).action.content, '用真实用户反馈补充项目说明。');
  const listedMainlines = await app.inject({ method: 'GET', url: '/api/goals', headers: { cookie: ownerCookie } });
  assert.deepEqual((listedMainlines.json() as { goals: Array<{ progress: unknown }> }).goals[0]?.progress, { completedTodoCount: 0, totalTodoCount: 1, progressPercent: 0 });
  const exportResponse = await app.inject({ method: 'GET', url: '/api/export', headers: { cookie: ownerCookie } });
  assert.equal(exportResponse.statusCode, 200);
  assert.match(String(exportResponse.headers['content-disposition']), /lifekernel-export\.json/);
  const exported = exportResponse.json() as { schemaVersion: number; data: { goals: unknown[]; actions: unknown[]; goalReflections: unknown[]; profileDescription: unknown; knowledgeItems: unknown[]; goalStatusEvents: unknown[] } };
  assert.equal(exported.schemaVersion, 5);
  assert.equal(exported.data.goals.length, 1);
  assert.equal(exported.data.actions.length, 1);
  assert.equal((exported.data.actions[0] as { content: string | null }).content, '用真实用户反馈补充项目说明。');
  assert.deepEqual(exported.data.goalReflections, []);
  assert.equal(exported.data.profileDescription, null);
  assert.deepEqual(exported.data.knowledgeItems, []);
  assert.deepEqual(exported.data.goalStatusEvents, []);
  assert.equal(JSON.stringify(exported).includes('password_hash'), false);

  const otherUserId = randomUUID();
  database.sqlite
    .prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .run(otherUserId, 'other@lifekernel.local', await hashPassword('other-password'), new Date().toISOString());
  const otherLogin = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: 'other@lifekernel.local', password: 'other-password' }
  });
  const otherCookie = cookieFrom(otherLogin);
  const otherUserRead = await app.inject({ method: 'GET', url: `/api/goals/${goalId}/actions`, headers: { cookie: otherCookie } });
  assert.equal(otherUserRead.statusCode, 404);
  const otherExport = (await app.inject({ method: 'GET', url: '/api/export', headers: { cookie: otherCookie } })).json() as { data: { goals: unknown[]; actions: unknown[] } };
  assert.deepEqual(otherExport.data.goals, []);
  assert.deepEqual(otherExport.data.actions, []);
  assert.equal((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: ownerCookie } })).statusCode, 200);

  const logout = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie: ownerCookie } });
  assert.equal(logout.statusCode, 200);
  const afterLogout = await app.inject({ method: 'GET', url: '/api/goals', headers: { cookie: ownerCookie } });
  assert.equal(afterLogout.statusCode, 401);
});

test('SPEC-0010：HTTP API 暴露目标、状态匹配和唯一当前行动', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'lifekernel-v05-http-test-'));
  const database = createDatabase(join(directory, 'lifekernel.sqlite'));
  const { app, service } = buildApp(database);
  context.after(async () => {
    await app.close();
    database.close();
    await rm(directory, { recursive: true, force: true });
  });

  const user = service.provisionInitialAccount('v05-http@lifekernel.local', await hashPassword('valid-test-password'));
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: user.email, password: 'valid-test-password' } });
  const ownerCookie = cookieFrom(login);
  const firstGoalResponse = await app.inject({ method: 'POST', url: '/api/goals', headers: { cookie: ownerCookie }, payload: { title: '完成一个产品' } });
  const secondGoalResponse = await app.inject({ method: 'POST', url: '/api/goals', headers: { cookie: ownerCookie }, payload: { title: '保持运动' } });
  assert.equal(firstGoalResponse.statusCode, 201);
  assert.equal(secondGoalResponse.statusCode, 201);
  const firstGoalId = (firstGoalResponse.json() as { goal: { id: string } }).goal.id;
  const secondGoalId = (secondGoalResponse.json() as { goal: { id: string } }).goal.id;
  const firstActionResponse = await app.inject({ method: 'POST', url: `/api/goals/${firstGoalId}/actions`, headers: { cookie: ownerCookie }, payload: { title: '写首页草稿', estimatedMinutes: 15, energyRequired: 'low' } });
  const secondActionResponse = await app.inject({ method: 'POST', url: `/api/goals/${secondGoalId}/actions`, headers: { cookie: ownerCookie }, payload: { title: '走路 20 分钟', estimatedMinutes: 30, energyRequired: 'low' } });
  assert.equal(firstActionResponse.statusCode, 201);
  assert.equal(secondActionResponse.statusCode, 201);
  const firstActionId = (firstActionResponse.json() as { action: { id: string } }).action.id;
  const secondActionId = (secondActionResponse.json() as { action: { id: string } }).action.id;

  const state = await app.inject({ method: 'PUT', url: '/api/current/context', headers: { cookie: ownerCookie }, payload: { availableMinutes: 30, energy: 'low' } });
  assert.equal(state.statusCode, 200);
  const current = await app.inject({ method: 'GET', url: '/api/current', headers: { cookie: ownerCookie } });
  assert.deepEqual((current.json() as { strictMatches: Array<{ id: string }> }).strictMatches.map((action) => action.id).sort(), [firstActionId, secondActionId].sort());
  assert.equal((await app.inject({ method: 'POST', url: '/api/current/select', headers: { cookie: ownerCookie }, payload: { actionId: firstActionId } })).statusCode, 200);
  assert.equal((await app.inject({ method: 'POST', url: '/api/current/select', headers: { cookie: ownerCookie }, payload: { actionId: secondActionId } })).statusCode, 200);
  const completed = await app.inject({ method: 'POST', url: '/api/current/complete', headers: { cookie: ownerCookie }, payload: { outcomeNote: '完成' } });
  assert.equal(completed.statusCode, 200);
  assert.equal((completed.json() as { action: { status: string } }).action.status, 'completed');
  assert.equal((await app.inject({ method: 'GET', url: '/api/current', headers: { cookie: ownerCookie } })).json().currentAction, null);
  assert.equal((await app.inject({ method: 'DELETE', url: '/api/data', headers: { cookie: ownerCookie } })).statusCode, 404);
});
