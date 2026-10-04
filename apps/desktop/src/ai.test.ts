import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv, randomUUID } from 'node:crypto';
import { AiSettingsStore, type SecretStorage } from './ai-settings.js';
import { AiController } from './ai.js';
import { createDatabase } from '../../api/src/db.js';
import { LifeKernelService } from '../../api/src/services.js';
import { AppError } from '../../api/src/types.js';
import { DEFAULT_AI, type AiSettings, type AiCommand, type AiPreview } from '../../../shared/ai.js';
import type { Result } from './bridge.js';

const key = 'unit-test-only-secret-123';
const code = (value: string) => (error: unknown) => (error as AppError).code === value;
function cryptoStore(available = true): SecretStorage {
  const encryptionKey = randomBytes(32);
  return { available: async () => available,
    encrypt: async text => { const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
      return Buffer.concat([iv, cipher.update(text), cipher.final(), cipher.getAuthTag()]); },
    decrypt: async data => { const cipher = createDecipheriv('aes-256-gcm', encryptionKey, data.subarray(0, 12));
      cipher.setAuthTag(data.subarray(-16)); return Buffer.concat([cipher.update(data.subarray(12, -16)), cipher.final()]).toString(); } };
}
async function folder(context: { after: (fn: () => Promise<void>) => void }) {
  const path = await mkdtemp(join(tmpdir(), 'lk-ai-'));
  context.after(() => rm(path, { recursive: true, force: true })); return path;
}
const saveInput = (settings: AiSettings, persistKey = false): Extract<AiCommand, { kind: 'save-settings' }> => ({
  kind: 'save-settings', ...DEFAULT_AI, apiKey: key, persistKey, expectedRevision: settings.revision,
});

test('SPEC-0014：系统加密保存、重读不回传 Key，旧窗口不能覆盖新配置', async context => {
  const path = await folder(context), secrets = cryptoStore();
  const store = new AiSettingsStore(path, secrets);
  const initial = await store.get();
  const saved = await store.save(saveInput(initial, true));
  assert.equal(saved.storage, 'encrypted');
  assert.equal(saved.hasApiKey, true);
  assert.equal(JSON.stringify(saved).includes(key), false);
  assert.equal((await readFile(join(path, 'ai-connection.json'), 'utf8')).includes(key), false);
  assert.equal((await new AiSettingsStore(path, secrets).connection()).apiKey, key);
  await assert.rejects(store.save(saveInput(initial, true)), code('AI_CONFIG_CHANGED'));
  await assert.rejects(store.clear(initial.revision), code('AI_CONFIG_CHANGED'));
  const cleared = await store.clear(saved.revision);
  assert.equal(cleared.hasApiKey, false);
  await assert.rejects(store.connection(), code('AI_NOT_CONFIGURED'));
});
test('SPEC-0014：无安全后端拒绝持久化，会话 Key 退出后消失且不会落盘', async context => {
  const path = await folder(context), secrets = cryptoStore(false), store = new AiSettingsStore(path, secrets);
  const initial = await store.get();
  await assert.rejects(store.save(saveInput(initial, true)), code('AI_SECURE_STORAGE_UNAVAILABLE'));
  const saved = await store.save(saveInput(initial));
  assert.equal(saved.storage, 'session');
  assert.equal((await readFile(join(path, 'ai-connection.json'), 'utf8')).includes(key), false);
  assert.equal((await new AiSettingsStore(path, secrets).get()).hasApiKey, false);
});
test('SPEC-0014：改变地址需要新 Key，危险 URL 不保存，损坏配置可恢复', async context => {
  const path = await folder(context), store = new AiSettingsStore(path, cryptoStore());
  const saved = await store.save(saveInput(await store.get()));
  await assert.rejects(store.save({ ...saveInput(saved), baseUrl: 'https://another.example/v1', apiKey: '' }), code('AI_KEY_REQUIRED'));
  for (const baseUrl of ['http://remote.example/v1', 'https://user:pass@api.example/v1', 'https://api.example/v1?key=abc', 'https://api.example/v1#x', 'https://api.example/chat/completions', 'https://api.example/chat/completions/', 'file:///tmp'])
    await assert.rejects(store.save({ ...saveInput(saved), baseUrl }), code('AI_INVALID_URL'));
  assert.equal((await store.connection()).baseUrl, saved.baseUrl);
  await writeFile(join(path, 'ai-connection.json'), 'bad json');
  const recovered = new AiSettingsStore(path, cryptoStore());
  const broken = await recovered.get();
  assert.ok(broken.warning);
  assert.equal((await recovered.save(saveInput(broken))).hasApiKey, true);
});
test('SPEC-0014：解密/加密与落盘失败不暴露秘密，并行写入只有一次成功', async context => {
  const path = await folder(context), secrets = cryptoStore(), store = new AiSettingsStore(path, secrets);
  const initial = await store.get();
  const attempts = await Promise.allSettled([store.save(saveInput(initial, true)), store.save(saveInput(initial, true))]);
  assert.equal(attempts.filter(item => item.status === 'fulfilled').length, 1);
  const unreadable = new AiSettingsStore(path, { ...secrets, decrypt: async () => { throw new Error(key); } });
  const meta = await unreadable.get();
  assert.equal(meta.hasApiKey, false); assert.ok(meta.warning);
  assert.equal(JSON.stringify(meta).includes(key), false);
  const failing = new AiSettingsStore(join(path, 'absent'), secrets);
  await assert.rejects(failing.save(saveInput(await failing.get(), true)), code('AI_CONFIG_WRITE_FAILED'));
});

async function controllerFixture(context: Parameters<typeof folder>[0], implementation?: typeof fetch, timeoutMs?: number) {
  const path = await mkdtemp(join(tmpdir(), 'lk-ai-controller-'));
  const database = createDatabase(join(path, 'db.sqlite'));
  context.after(async () => {
    database.close();
    await rm(path, { recursive: true, force: true });
  });
  const service = new LifeKernelService(database);
  const user = service.provisionInitialAccount('unit@lk.test', 'LOCAL');
  const goal = service.createGoal(user.id, { title: '做一个小产品', doneDefinition: '能实际使用' });
  const action = service.createGoalAction(user.id, goal.id, { title: '实现导出', content: '先跑通最小闭环', scheduledDate: '2026-10-04' });
  const settings = new AiSettingsStore(path, cryptoStore(false));
  const meta = await settings.save(saveInput(await settings.get()));
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const workerPayloads: unknown[] = [];
  let changes = 0;
  const controller = new AiController(settings, {
    changed: () => changes++, timeoutMs,
    fetch: (async (url, init) => { requests.push({ url: String(url), init });
      return implementation ? implementation(url, init) : new Response(JSON.stringify({ choices: [{ message: {
        content: JSON.stringify({ steps: [{ title: '列出导出字段', content: '确认所需数据' }, { title: '导出一份备份', content: '读取 JSON' }] }),
      }, finish_reason: 'stop' }] })); }) as typeof fetch,
    rpc: async (kind, payload): Promise<Result> => {
      workerPayloads.push(payload);
      try {
        const value = payload as { actionId: string; operationId: string };
        const data = kind === 'ai-source' ? service.getSplitSource(user.id, value.actionId)
          : kind === 'ai-apply' ? service.applyAiSplit(user.id, payload as Parameters<LifeKernelService['applyAiSplit']>[1])
          : service.undoAiSplit(user.id, value.operationId);
        return { ok: true, data };
      } catch (error) { const e = error as AppError; return { ok: false, error: { code: e.code, message: e.message } }; }
    },
  });
  const generate: AiCommand = { kind: 'generate', actionId: action.id, sourceRevision: service.getSplitSource(user.id, action.id).revision,
    configRevision: meta.revision!, requestId: randomUUID(), instruction: '每步清楚可开始' };
  return { controller, service, user, action, goal, requests, workerPayloads, meta, settings, generate, changes: () => changes };
}
test('SPEC-0014：模型请求仅必要上下文，预览不写入，选择采纳幂等并保留另一当前任务', async context => {
  const f = await controllerFixture(context);
  const other = f.service.createGoalAction(f.user.id, f.goal.id, { title: '另一当前任务' });
  f.service.selectCurrentAction(f.user.id, other.id);
  const generated = await f.controller.invoke(1, f.generate);
  assert.equal(generated.ok, true);
  if (!generated.ok) return;
  const preview = generated.data as AiPreview;
  assert.equal(f.service.listTodos(f.user.id).length, 2);
  const network = f.requests[0];
  assert.equal(network.init?.redirect, 'error');
  assert.equal(network.init?.credentials, 'omit');
  assert.equal((network.init?.headers as Record<string, string>).Authorization, `Bearer ${key}`);
  const body = String(network.init?.body);
  assert.match(body, /实现导出/); assert.equal(body.includes(key), false);
  assert.equal(body.includes(f.user.id), false); assert.equal(body.includes(other.title), false);
  assert.equal(JSON.stringify(f.workerPayloads).includes(key), false);
  const command: AiCommand = { kind: 'apply', previewId: preview.previewId, steps: [{ title: '用户修改后的第一步', content: '只采纳一条' }] };
  const denied = await f.controller.invoke(2, command); assert.equal(denied.ok, false);
  const [a, b] = await Promise.all([f.controller.invoke(1, command), f.controller.invoke(1, command)]);
  assert.equal(a.ok, true); assert.deepEqual(a, b);
  const children = f.service.listTodos(f.user.id).filter(item => item.parentActionId === f.action.id);
  assert.equal(children.length, 1); assert.equal(children[0].scheduledDate, f.action.scheduledDate);
  assert.equal(f.service.getCurrentWorkspace(f.user.id).currentAction?.id, other.id);
  assert.equal((await f.controller.invoke(1, { kind: 'undo', operationId: preview.previewId })).ok, true);
  assert.equal(f.service.getCurrentWorkspace(f.user.id).currentAction?.id, other.id);
});
test('SPEC-0014：错误与不可信响应不暴露 Key，不写入任务', async context => {
  for (const response of [new Response(key, { status: 401 }), new Response(key, { status: 429 }),
    new Response('not json'), new Response(JSON.stringify({ choices: [{ message: { content: '{"steps":[]}' } }] })),
    new Response('x'.repeat(256 * 1024 + 1))]) {
    const f = await controllerFixture(context, (async () => response) as typeof fetch);
    const result = await f.controller.invoke(1, f.generate);
    assert.equal(result.ok, false); assert.equal(JSON.stringify(result).includes(key), false);
    assert.equal(f.service.listTodos(f.user.id).length, 1);
  }
});
test('SPEC-0014：恶意服务回显 Key 的有效建议也被脱敏', async context => {
  const f = await controllerFixture(context, (async () => new Response(JSON.stringify({ choices: [{ message: {
    content: JSON.stringify({ steps: [{ title: `echo ${key}`, content: key }] }),
  } }] }))) as typeof fetch);
  const result = await f.controller.invoke(1, f.generate);
  assert.equal(result.ok, true); assert.equal(JSON.stringify(result).includes(key), false);
});
test('SPEC-0014：取消忽略晚到响应，重复生成不会重复请求，超时可恢复', async context => {
  let release!: (value: Response) => void, started!: () => void;
  const entered = new Promise<void>(resolve => { started = resolve; });
  const f = await controllerFixture(context, (async () => { started(); return new Promise<Response>(resolve => { release = resolve; }); }) as typeof fetch);
  const request = f.controller.invoke(1, f.generate);
  await entered;
  assert.equal((await f.controller.invoke(1, f.generate)).ok, false);
  const id = (f.generate as Extract<AiCommand, { kind: 'generate' }>).requestId;
  await f.controller.invoke(1, { kind: 'cancel', requestId: id });
  release(new Response(JSON.stringify({ choices: [{ message: { content: '{"steps":[{"title":"迟到"}]}' } }] })));
  const cancelled = await request;
  assert.equal(cancelled.ok, false); if (!cancelled.ok) assert.equal(cancelled.error.code, 'AI_CANCELLED');
  assert.equal(f.requests.length, 1); assert.equal(f.service.listTodos(f.user.id).length, 1);
  const timed = await controllerFixture(context, (async (_url, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error(key)), { once: true });
  })) as typeof fetch, 10);
  const result = await timed.controller.invoke(1, timed.generate);
  assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, 'AI_TIMEOUT');
  assert.equal(JSON.stringify(result).includes(key), false);
});
test('SPEC-0014：旧任务/配置在发请求前拒绝，预览后源变更不采纳', async context => {
  const changedConfig = await controllerFixture(context);
  const saved = await changedConfig.controller.invoke(2, { ...saveInput(changedConfig.meta), model: 'changed-model' });
  assert.equal(saved.ok, true);
  const stale = await changedConfig.controller.invoke(1, changedConfig.generate);
  assert.equal(stale.ok, false); if (!stale.ok) assert.equal(stale.error.code, 'AI_CONFIG_CHANGED');
  assert.equal(changedConfig.requests.length, 0);
  const f = await controllerFixture(context);
  f.service.updateActionMetadata(f.user.id, f.action.id, { title: '已在另一窗口修改' });
  assert.equal((await f.controller.invoke(1, f.generate)).ok, false);
  assert.equal(f.requests.length, 0);
  const fresh = { ...f.generate, sourceRevision: f.service.getSplitSource(f.user.id, f.action.id).revision };
  const generated = await f.controller.invoke(1, fresh);
  assert.equal(generated.ok, true); if (!generated.ok) return;
  f.service.changeGoalStatus(f.user.id, f.goal.id, 'paused');
  const applied = await f.controller.invoke(1, { kind: 'apply', previewId: (generated.data as AiPreview).previewId, steps: [{ title: '新步骤' }] });
  assert.equal(applied.ok, false); assert.equal(f.service.listTodos(f.user.id).length, 1);
});
