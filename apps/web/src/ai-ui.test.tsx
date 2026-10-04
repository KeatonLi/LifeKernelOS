import assert from 'node:assert/strict';
import { test, afterEach, mock } from 'node:test';
import { JSDOM } from 'jsdom';
import { randomUUID } from 'node:crypto';
import type { AiCommand, AiSettings, SplitSource, AiPreview, SplitResult } from '../../../shared/ai.js';
import type { Result, DesktopBridge } from '../../desktop/src/bridge.js';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
Object.defineProperties(globalThis, {
  window: { value: dom.window, configurable: true }, document: { value: dom.window.document, configurable: true },
  navigator: { value: dom.window.navigator, configurable: true }, HTMLElement: { value: dom.window.HTMLElement, configurable: true },
  IS_REACT_ACT_ENVIRONMENT: { value: true, writable: true, configurable: true },
});
const { render, fireEvent, waitFor, cleanup, act } = await import('@testing-library/react');
const { MemoryRouter } = await import('react-router-dom');
const { AiSettingsPanel } = await import('./AiSettings.js');
const { AiWorkspace, AiSplitButton } = await import('./AiTask.js');
const { ExpectationsPage } = await import('./App.js');
const { api } = await import('./api.js');
const ok = (data: unknown): Result => ({ ok: true, data });
const fail = (message: string): Result => ({ ok: false, error: { code: 'TEST_FAILURE', message } });
const settings: AiSettings = { baseUrl: 'https://api.example/v1', model: 'model', hasApiKey: true,
  storage: 'session', canPersistKey: false, revision: randomUUID(), warning: null };
const source: SplitSource = {
  action: { id: randomUUID(), userId: randomUUID(), goalId: randomUUID(), parentActionId: null, title: '实现一个导出功能',
    content: '只做最小闭环', scheduledDate: '2026-10-04', estimatedMinutes: null, energyRequired: null,
    status: 'available', blockerNote: null, outcomeNote: null, resolvedAt: null, createdAt: '', updatedAt: '' },
  goal: { id: '', userId: '', title: '做一个小产品', doneDefinition: '能实际使用', status: 'active', completedAt: null, createdAt: '', updatedAt: '' },
  revision: 'a'.repeat(64),
};
source.goal.id = source.action.goalId; source.goal.userId = source.action.userId;
const preview: AiPreview = { previewId: randomUUID(), model: 'model', steps: [{ title: '第一步', content: '确认字段' }, { title: '第二步', content: '保存 JSON' }] };
function bridge(handler: (command: AiCommand) => Promise<Result>) {
  window.lifeKernel = { platform: 'linux', ai: handler, request: async () => ok(null), desktop: async () => ok(null), onChange: () => () => {} } satisfies DesktopBridge;
}
afterEach(() => { cleanup(); mock.restoreAll(); delete window.lifeKernel; });
function result(steps = preview.steps): SplitResult {
  return { operationId: preview.previewId, original: { ...source.action, status: 'superseded' },
    actions: steps.map(step => ({ ...source.action, id: randomUUID(), parentActionId: source.action.id, ...step, content: step.content ?? null })), undone: false };
}
test('SPEC-0014：Key 保存失败保留输入，成功清空，测试与移除使用已保存版本', async () => {
  const calls: AiCommand[] = [];
  let stored = { ...settings, hasApiKey: false }, attempts = 0;
  bridge(async command => {
    calls.push(command);
    if (command.kind === 'settings') return ok(stored);
    if (command.kind === 'save-settings') {
      if (++attempts === 1) return fail('磁盘未能写入');
      stored = { ...stored, hasApiKey: true, revision: randomUUID() }; return ok(stored);
    }
    if (command.kind === 'clear-key') { stored = { ...stored, hasApiKey: false }; return ok(stored); }
    return ok({ connected: true });
  });
  const view = render(<AiSettingsPanel />);
  const save = await view.findByRole('button', { name: '保存 AI 配置' });
  await waitFor(() => assert.equal((save as HTMLButtonElement).disabled, false));
  const input = view.getByLabelText('API Key') as HTMLInputElement;
  assert.equal(input.type, 'password');
  fireEvent.change(input, { target: { value: 'test-only-key' } }); fireEvent.click(save);
  await view.findByRole('alert'); assert.equal(input.value, 'test-only-key');
  fireEvent.click(save);
  await waitFor(() => assert.equal(input.value, ''));
  fireEvent.click(view.getByRole('button', { name: '测试连接' }));
  await view.findByText('连接成功，已保存的模型可响应请求。');
  const testCall = calls.find(command => command.kind === 'test');
  assert.ok(testCall && testCall.kind === 'test'); assert.equal(testCall.configRevision, stored.revision);
  fireEvent.click(view.getByRole('button', { name: '移除 Key' }));
  fireEvent.click(view.getByRole('button', { name: '确认移除 Key' }));
  await view.findByText('Key 已移除，本地任务仍可使用。');
  assert.equal(window.localStorage.length, 0);
});
test('SPEC-0014：预览可编辑和勾选，应用只提交所选内容，结果面板可撤销', async () => {
  const calls: AiCommand[] = [];
  let receipt: SplitResult;
  bridge(async command => {
    calls.push(command);
    if (command.kind === 'source') return ok(source);
    if (command.kind === 'settings') return ok(settings);
    if (command.kind === 'generate') return ok(preview);
    if (command.kind === 'apply') { receipt = result(command.steps); return ok(receipt); }
    if (command.kind === 'undo') return ok({ ...receipt, undone: true });
    return ok(null);
  });
  const view = render(<MemoryRouter><AiWorkspace><AiSplitButton actionId={source.action.id} /></AiWorkspace></MemoryRouter>);
  const opener = view.getByRole('button', { name: 'AI 拆解' }); opener.focus(); fireEvent.click(opener);
  await view.findByRole('dialog');
  await waitFor(() => assert.equal((view.getByRole('button', { name: '生成拆解建议' }) as HTMLButtonElement).disabled, false));
  fireEvent.change(view.getByLabelText('补充要求（可选）'), { target: { value: '先做最小版本' } });
  fireEvent.click(view.getByRole('button', { name: '生成拆解建议' }));
  await view.findByLabelText('步骤 1 标题');
  assert.equal(calls.filter(command => command.kind === 'apply').length, 0);
  fireEvent.change(view.getByLabelText('步骤 1 标题'), { target: { value: '用户修改后的步骤' } });
  fireEvent.click(view.getByLabelText('选择步骤 2'));
  fireEvent.click(view.getByRole('button', { name: '应用所选步骤' }));
  await view.findByRole('heading', { name: '已加入 1 个步骤' });
  const applied = calls.find(command => command.kind === 'apply');
  assert.ok(applied && applied.kind === 'apply'); assert.equal(applied.steps.length, 1); assert.equal(applied.steps[0].title, '用户修改后的步骤');
  fireEvent.click(view.getByRole('button', { name: '撤销本次拆解' }));
  await view.findByRole('heading', { name: '已撤销本次拆解' });
  fireEvent.keyDown(document, { key: 'Escape' });
  assert.equal(view.queryByRole('dialog'), null); assert.equal(document.activeElement, opener);
});
test('SPEC-0014：取消后晚到建议不显示，错误保留补充要求，模型文本不执行 HTML', async () => {
  let release!: (value: Result) => void;
  let attempt = 0;
  bridge(async command => {
    if (command.kind === 'source') return ok(source);
    if (command.kind === 'settings') return ok(settings);
    if (command.kind === 'generate') {
      if (++attempt === 1) return new Promise(resolve => { release = resolve; });
      if (attempt === 2) return fail('服务限流，请重试');
      return ok({ ...preview, steps: [{ title: '<script>alert(1)</script>', content: '<img src=x onerror=alert(1)>' }] });
    }
    return ok(null);
  });
  const view = render(<MemoryRouter><AiWorkspace><AiSplitButton actionId={source.action.id} /></AiWorkspace></MemoryRouter>);
  fireEvent.click(view.getByRole('button', { name: 'AI 拆解' }));
  const input = await view.findByLabelText('补充要求（可选）');
  fireEvent.change(input, { target: { value: '保留我的要求' } });
  fireEvent.click(view.getByRole('button', { name: '生成拆解建议' }));
  fireEvent.click(await view.findByRole('button', { name: '取消生成' }));
  await act(async () => release(ok(preview)));
  assert.equal(view.queryByLabelText('拆解建议'), null);
  fireEvent.click(view.getByRole('button', { name: '生成拆解建议' }));
  await view.findByRole('alert'); assert.equal((input as HTMLTextAreaElement).value, '保留我的要求');
  fireEvent.click(view.getByRole('button', { name: '生成拆解建议' }));
  await view.findByLabelText('步骤 1 标题');
  assert.equal(view.container.querySelector('script'), null); assert.equal(view.container.querySelector('img'), null);
});
test('SPEC-0014：真实主线数据刷新后仍保留应用结果与撤销入口', async () => {
  const mainline = { ...source.goal, progress: { completedTodoCount: 0, totalTodoCount: 1, progressPercent: 0 } };
  let actions = [source.action], receipt: SplitResult;
  mock.method(api, 'goals', async () => ({ goals: [mainline] }));
  mock.method(api, 'captures', async () => ({ captures: [] }));
  mock.method(api, 'current', async () => ({ context: null, contextIsStale: false, currentAction: null, strictMatches: [], allAvailable: [] }));
  mock.method(api, 'goalActions', async () => ({ actions: structuredClone(actions) }));
  bridge(async command => {
    if (command.kind === 'source') return ok(source);
    if (command.kind === 'settings') return ok(settings);
    if (command.kind === 'generate') return ok(preview);
    if (command.kind === 'apply') { receipt = result(command.steps); actions = [receipt.original, ...receipt.actions]; return ok(receipt); }
    return ok(null);
  });
  const view = render(<MemoryRouter><ExpectationsPage user={{ id: source.action.userId, email: 'local@lifekernel.desktop', createdAt: '' }} onLogout={() => {}} /></MemoryRouter>);
  fireEvent.click(await view.findByRole('button', { name: 'AI 拆解' }));
  fireEvent.click(await view.findByRole('button', { name: '生成拆解建议' }));
  fireEvent.click(await view.findByRole('button', { name: '应用所选步骤' }));
  await view.findByRole('heading', { name: '已加入 2 个步骤' });
  await waitFor(() => assert.ok(view.container.querySelector('.todo-list')?.textContent?.includes('第一步')));
  assert.ok(view.getByRole('button', { name: '撤销本次拆解' }));
});
