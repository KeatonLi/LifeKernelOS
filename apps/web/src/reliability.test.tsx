import assert from 'node:assert/strict';
import { afterEach, test, mock } from 'node:test';
import { JSDOM } from 'jsdom';

// Install DOM before importing ReactDOM / Testing Library.
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
Object.defineProperties(globalThis, {
  window: { value: dom.window, configurable: true },
  document: { value: dom.window.document, configurable: true },
  navigator: { value: dom.window.navigator, configurable: true },
  HTMLElement: { value: dom.window.HTMLElement, configurable: true },
  IS_REACT_ACT_ENVIRONMENT: { value: true, writable: true, configurable: true }
});
const { render, fireEvent, waitFor, cleanup, act } = await import('@testing-library/react');
const { MemoryRouter, useNavigate } = await import('react-router-dom');
const { default: App, ExpectationsPage, ProfilePage, buildProfileFlow } = await import('./App.js');
const { api, dataChanged } = await import('./api.js');
import type { Capture, Mainline, GoalAction, Profile, ProfileGraphNode } from './api.js';

const user = { id: 'user', email: 'test@example.com', createdAt: '' };
const goal = (id: string): Mainline => ({ id, userId: user.id, title: `主线 ${id}`, doneDefinition: null, status: 'active', completedAt: null, createdAt: '', updatedAt: '', progress: { completedTodoCount: 0, totalTodoCount: 0, progressPercent: 0 } });
const action = (id: string, goalId = 'a'): GoalAction => ({ id, userId: user.id, goalId, parentActionId: null, title: `任务 ${id}`, content: null, scheduledDate: null, estimatedMinutes: null, energyRequired: null, status: 'available', blockerNote: null, outcomeNote: null, resolvedAt: null, createdAt: '', updatedAt: '' });
const emptyProfile = (): Profile => ({ factSummary: { goalCount: 0, activeGoalCount: 0, completedGoalCount: 0, completedActionCount: 0, knowledgeCount: 0 }, description: null, knowledgeItems: [], goals: [], experiences: [], graph: { nodes: [], edges: [] } });
function setupMainlines() {
  mock.method(api, 'goals', async () => ({ goals: [goal('a'), goal('b')] }));
  mock.method(api, 'current', async () => ({ context: null, contextIsStale: false, currentAction: null, strictMatches: [], allAvailable: [] }));
}
function Navigation() {
  const navigate = useNavigate();
  return <><button onClick={() => navigate('/expectations#goal-a')}>前往 A</button><button onClick={() => navigate('/expectations#goal-b')}>前往 B</button></>;
}
function mainlineView(route = '/expectations') {
  return render(<MemoryRouter initialEntries={[route]}><Navigation /><ExpectationsPage user={user} onLogout={() => {}} /></MemoryRouter>);
}
afterEach(() => { cleanup(); mock.restoreAll(); });

test('SPEC-0010：同一主线新增和编辑后立即刷新列表及详情', async () => {
  setupMainlines();
  let records = [action('old')];
  mock.method(api, 'goalActions', async () => ({ actions: structuredClone(records) }));
  mock.method(api, 'createGoalAction', async (_id: string, input: { title: string }) => {
    const created = { ...action('new'), ...input }; records.push(created); return { action: created };
  });
  mock.method(api, 'updateAction', async (id: string, input: { title: string; content: string }) => {
    records = records.map(item => item.id === id ? { ...item, ...input } : item);
    return { action: records.find(item => item.id === id)! };
  });
  const view = mainlineView();
  await view.findByRole('heading', { name: '任务 old' });
  fireEvent.click(view.getByRole('button', { name: '新建 To-do' }));
  fireEvent.change(view.getByLabelText('To-do 标题'), { target: { value: '新增步骤' } });
  fireEvent.click(view.getByRole('button', { name: '加入主线' }));
  await view.findByRole('heading', { name: '新增步骤' });
  assert.match(view.container.querySelector('.todo-list')!.textContent!, /新增步骤/);
  fireEvent.click(view.getByRole('button', { name: '编辑 To-do' }));
  fireEvent.change(view.getByLabelText('To-do 标题'), { target: { value: '更新步骤' } });
  fireEvent.change(view.getByLabelText(/内容/), { target: { value: '更新后的内容' } });
  fireEvent.click(view.getByRole('button', { name: '保存 To-do' }));
  await view.findByRole('heading', { name: '更新步骤' });
  assert.match(view.container.querySelector('.todo-list')!.textContent!, /更新步骤/);
  assert.match(view.container.querySelector('.todo-content')!.textContent!, /更新后的内容/);
});

test('SPEC-0011：主线来源链接优先于当前行动，并响应同页 hash 变化', async () => {
  setupMainlines();
  mock.method(api, 'current', async () => ({ context: null, contextIsStale: false, currentAction: action('current'), strictMatches: [], allAvailable: [] }));
  mock.method(api, 'goalActions', async (id: string) => ({ actions: [action(id, id)] }));
  const view = mainlineView('/expectations#goal-b');
  await view.findByRole('heading', { name: '主线 b' });
  await view.findByRole('heading', { name: '任务 b' });
  fireEvent.click(view.getByRole('button', { name: '前往 A' }));
  await view.findByRole('heading', { name: '主线 a' });
});

test('SPEC-0010：无效来源回退到可访问主线', async () => {
  setupMainlines();
  mock.method(api, 'goalActions', async (id: string) => ({ actions: [action(id, id)] }));
  const view = mainlineView('/expectations#goal-missing');
  await view.findByRole('heading', { name: '主线 a' });
});

test('SPEC-0010：较早请求晚返回时不能覆盖新主线', async () => {
  setupMainlines();
  let resolveOld!: (value: { actions: GoalAction[] }) => void;
  const pending = new Promise<{ actions: GoalAction[] }>(resolve => { resolveOld = resolve; });
  let oldStarted = false;
  mock.method(api, 'goalActions', async (id: string) => {
    if (id === 'a') { oldStarted = true; return pending; }
    return { actions: [action('b', 'b')] };
  });
  const view = mainlineView();
  await waitFor(() => assert.ok(oldStarted));
  fireEvent.click(view.getByRole('button', { name: '前往 B' }));
  await view.findByRole('heading', { name: '任务 b' });
  await act(async () => resolveOld({ actions: [action('late')] }));
  assert.ok(view.getByRole('heading', { name: '主线 b' }));
  assert.equal(view.queryByRole('heading', { name: '任务 late' }), null);
});

test('SPEC-0011：画像首次失败停止加载，重试后恢复空状态', async () => {
  setupMainlines();
  let attempts = 0;
  mock.method(api, 'profile', async () => { if (++attempts === 1) throw new Error('offline'); return { profile: emptyProfile() }; });
  const view = render(<MemoryRouter><ProfilePage user={user} onLogout={() => {}} /></MemoryRouter>);
  await view.findByRole('alert');
  assert.equal(view.queryByText('正在读取你的记录…'), null);
  fireEvent.click(view.getByRole('button', { name: '重试' }));
  await view.findByRole('heading', { name: '画像会从第一条主线开始形成。' });
  assert.equal(view.queryByRole('alert'), null);
});

test('SPEC-0010：主线首次失败不伪装成空状态，允许重试', async () => {
  setupMainlines();
  let attempts = 0;
  mock.method(api, 'goalActions', async () => { if (++attempts === 1) throw new Error('offline'); return { actions: [action('recovered')] }; });
  const view = mainlineView();
  await view.findByRole('alert');
  assert.equal(view.queryByText('从一条想持续推进的主线开始。'), null);
  fireEvent.click(view.getByRole('button', { name: '重试' }));
  await view.findByRole('heading', { name: '任务 recovered' });
});

test('SPEC-0010：来源主线读取失败重试时保留原目标', async () => {
  setupMainlines();
  let attempts = 0;
  mock.method(api, 'goalActions', async (id: string) => {
    if (++attempts === 1) throw new Error('offline');
    return { actions: [action(id, id)] };
  });
  const view = mainlineView('/expectations#goal-b');
  await view.findByRole('alert');
  fireEvent.click(view.getByRole('button', { name: '重试' }));
  await view.findByRole('heading', { name: '主线 b' });
  await view.findByRole('heading', { name: '任务 b' });
});

test('SPEC-0010：完成当前行动后刷新状态及进度，不保留完成按钮', async () => {
  setupMainlines();
  let completed = false;
  mock.method(api, 'current', async () => ({ context: null, contextIsStale: false, currentAction: completed ? null : action('current'), strictMatches: [], allAvailable: [] }));
  mock.method(api, 'goals', async () => ({ goals: [{ ...goal('a'), progress: { completedTodoCount: completed ? 1 : 0, totalTodoCount: 1, progressPercent: completed ? 100 : 0 } }] }));
  mock.method(api, 'goalActions', async () => ({ actions: [{ ...action('current'), status: completed ? 'completed' : 'available' }] }));
  mock.method(api, 'completeCurrent', async () => { completed = true; return { action: { ...action('current'), status: 'completed' } }; });
  const view = mainlineView();
  fireEvent.click(await view.findByRole('button', { name: '完成这件事' }));
  await view.findByText('已完成 · 100%');
  assert.equal(view.queryByRole('button', { name: '完成这件事' }), null);
  assert.match(view.container.querySelector('.todo-list')!.textContent!, /已完成/);
});

test('SPEC-0015：更多进入卡住流程，失败保留原因并按原行动重试', async () => {
  setupMainlines();
  mock.method(api, 'captures', async () => ({ captures: [] }));
  let blocked = false;
  const writes: Array<{ id: string; note: string | undefined }> = [];
  mock.method(api, 'current', async () => ({ context: null, contextIsStale: false, currentAction: blocked ? null : action('current'), strictMatches: [], allAvailable: [] }));
  mock.method(api, 'goalActions', async () => ({ actions: [{ ...action('current'), status: blocked ? 'blocked' : 'available', blockerNote: blocked ? '需要先拿到资料' : null }] }));
  mock.method(api, 'blockCurrent', async (id: string, note?: string) => {
    writes.push({ id, note });
    if (writes.length === 1) throw new Error('暂时未能保存');
    blocked = true;
    return { action: { ...action('current'), status: 'blocked' as const } };
  });
  const view = mainlineView();
  const trigger = await view.findByRole('button', { name: '更多当前任务操作' });
  assert.equal(view.queryByRole('menuitem', { name: '卡住' }), null);
  fireEvent.click(trigger);
  fireEvent.click(view.getByRole('menuitem', { name: '卡住' }));
  const input = view.getByLabelText('卡住的原因（可选）') as HTMLTextAreaElement;
  await waitFor(() => assert.equal(document.activeElement, input));
  assert.equal(view.queryByRole('menu'), null);
  fireEvent.change(input, { target: { value: '需要先拿到资料' } });
  fireEvent.click(view.getByRole('button', { name: '确认保存' }));
  await view.findByRole('alert');
  assert.equal(input.value, '需要先拿到资料');
  fireEvent.click(view.getByRole('button', { name: '确认保存' }));
  await view.findByRole('button', { name: '恢复这件事' });
  assert.deepEqual(writes, [{ id: 'current', note: '需要先拿到资料' }, { id: 'current', note: '需要先拿到资料' }]);
});

test('SPEC-0015：取消更多中的拆小不写任务，返回焦点且切任务关闭旧菜单', async () => {
  setupMainlines();
  mock.method(api, 'captures', async () => ({ captures: [] }));
  mock.method(api, 'current', async () => ({ context: null, contextIsStale: false, currentAction: action('current'), strictMatches: [], allAvailable: [] }));
  mock.method(api, 'goalActions', async () => ({ actions: [action('current'), action('other')] }));
  let writes = 0;
  mock.method(api, 'splitCurrent', async () => { writes++; throw new Error('不应调用'); });
  const view = mainlineView();
  fireEvent.click(await view.findByRole('button', { name: '更多当前任务操作' }));
  fireEvent.click(view.getByRole('menuitem', { name: '拆小' }));
  fireEvent.change(view.getByLabelText('更小的一步'), { target: { value: '只整理一个文件' } });
  fireEvent.click(view.getByRole('button', { name: '取消' }));
  const trigger = view.getByRole('button', { name: '更多当前任务操作' });
  await waitFor(() => assert.equal(document.activeElement, trigger));
  fireEvent.click(trigger);
  fireEvent.click(view.getByRole('button', { name: /任务 other/ }));
  await view.findByRole('heading', { name: '任务 other' });
  assert.equal(view.queryByRole('menu'), null);
  assert.equal(writes, 0);
});

test('SPEC-0015：编辑期间锁定选择，背景刷新保留草稿并保存原任务', async () => {
  setupMainlines();
  mock.method(api, 'captures', async () => ({ captures: [] }));
  let records = [action('a'), { ...action('b'), status: 'completed' as const }];
  const read = mock.method(api, 'goalActions', async () => ({ actions: structuredClone(records) }));
  const writes: Array<{ id: string; title: string }> = [];
  mock.method(api, 'updateAction', async (id: string, input: { title: string }) => {
    writes.push({ id, title: input.title });
    records = records.map(item => item.id === id ? { ...item, ...input } : item);
    return { action: records.find(item => item.id === id)! };
  });
  const view = mainlineView();
  fireEvent.click(await view.findByRole('button', { name: '编辑 To-do' }));
  fireEvent.change(view.getByLabelText('To-do 标题'), { target: { value: '任务 A 的草稿' } });
  for (const name of ['已完成', /任务 b/, '任务列表'])
    assert.equal((view.getByRole('button', { name }) as HTMLButtonElement).disabled, true);
  assert.equal((view.getByLabelText('当前主线') as HTMLSelectElement).disabled, true);
  fireEvent.click(view.getByRole('button', { name: '已完成' }));
  fireEvent.click(view.getByRole('button', { name: /任务 b/ }));
  await act(async () => dataChanged());
  await waitFor(() => {
    assert.equal(read.mock.calls.length, 2);
    assert.equal((view.getByRole('button', { name: '保存 To-do' }) as HTMLButtonElement).disabled, false);
    assert.equal((view.getByLabelText('To-do 标题') as HTMLInputElement).value, '任务 A 的草稿');
  });
  fireEvent.click(view.getByRole('button', { name: '保存 To-do' }));
  await view.findByRole('heading', { name: '任务 A 的草稿' });
  assert.deepEqual(writes, [{ id: 'a', title: '任务 A 的草稿' }]);
  assert.equal(records[1].title, '任务 b');
});

test('SPEC-0015：切换主线读取期间不能进入旧任务编辑器', async () => {
  setupMainlines();
  mock.method(api, 'captures', async () => ({ captures: [] }));
  let finishLoad!: (value: { actions: GoalAction[] }) => void;
  const pending = new Promise<{ actions: GoalAction[] }>(resolve => { finishLoad = resolve; });
  mock.method(api, 'goalActions', async (id: string) => id === 'b' ? pending : { actions: [action('a')] });
  const view = mainlineView();
  await view.findByRole('heading', { name: '任务 a' });
  fireEvent.change(view.getByLabelText('当前主线'), { target: { value: 'b' } });
  for (const name of ['编辑 To-do', '新建 To-do', /任务 a/])
    assert.equal((view.getByRole('button', { name }) as HTMLButtonElement).disabled, true);
  fireEvent.click(view.getByRole('button', { name: '编辑 To-do' }));
  assert.equal(view.queryByLabelText('To-do 标题'), null);
  await act(async () => finishLoad({ actions: [action('b', 'b')] }));
  await view.findByRole('heading', { name: '任务 b' });
  await waitFor(() => assert.equal((view.getByRole('button', { name: '编辑 To-do' }) as HTMLButtonElement).disabled, false));
});

test('SPEC-0015：处理表单刷新后仍校验原当前任务，冲突保留原因', async () => {
  setupMainlines();
  mock.method(api, 'captures', async () => ({ captures: [] }));
  let current = action('a');
  mock.method(api, 'current', async () => ({ context: null, contextIsStale: false, currentAction: current, strictMatches: [], allAvailable: [] }));
  const records = [action('a'), action('b')];
  let finishRefresh!: (value: { actions: GoalAction[] }) => void;
  const refreshing = new Promise<{ actions: GoalAction[] }>(resolve => { finishRefresh = resolve; });
  let reads = 0;
  const read = mock.method(api, 'goalActions', async () =>
    ++reads === 2 ? refreshing : { actions: structuredClone(records) },
  );
  const writes: string[] = [];
  mock.method(api, 'blockCurrent', async (id: string) => {
    writes.push(id);
    throw new ApiError('当前任务已被另一个窗口更改', undefined, 'CURRENT_ACTION_CHANGED');
  });
  const { ApiError } = await import('./api.js');
  const view = mainlineView();
  fireEvent.click(await view.findByRole('button', { name: '更多当前任务操作' }));
  fireEvent.click(view.getByRole('menuitem', { name: '卡住' }));
  const input = view.getByLabelText('卡住的原因（可选）');
  fireEvent.change(input, { target: { value: '原任务的原因' } });
  current = action('b');
  await act(async () => dataChanged());
  const submit = view.getByRole('button', { name: '确认保存' }) as HTMLButtonElement;
  // dataChanged schedules a debounced read; act alone does not wait for that refresh.
  await waitFor(() => {
    assert.equal(read.mock.calls.length, 2);
    assert.equal(submit.disabled, true);
  });
  fireEvent.click(submit);
  assert.deepEqual(writes, [], 'refreshing form must not submit');
  await act(async () => finishRefresh({ actions: records }));
  await waitFor(() => {
    assert.match(view.getByRole('button', { name: /任务 b/ }).textContent!, /现在做/);
    assert.equal(submit.disabled, false);
  });
  assert.equal((input as HTMLTextAreaElement).value, '原任务的原因');
  fireEvent.click(submit);
  await view.findByRole('alert');
  assert.deepEqual(writes, ['a']);
  assert.equal((view.getByLabelText('卡住的原因（可选）') as HTMLTextAreaElement).value, '原任务的原因');
  assert.equal((view.getByRole('button', { name: '编辑 To-do' }) as HTMLButtonElement).disabled, true);
});

test('SPEC-0005：从全局抽屉快速保存并转为指定主线 To-do', async () => {
  setupMainlines();
  mock.method(api, 'goalActions', async () => ({ actions: [] }));
  let records: Capture[] = [];
  mock.method(api, 'captures', async () => ({ captures: structuredClone(records) }));
  mock.method(api, 'createCapture', async ({ content }: { content: string }) => {
    const capture: Capture = { id: 'capture-a', userId: user.id, content, type: null, status: 'inbox', convertedActionId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    records = [capture];
    return { capture };
  });
  mock.method(api, 'convertCapture', async (id: string, input: { goalId: string; title: string }) => {
    records = records.filter((item) => item.id !== id);
    return { capture: { id, userId: user.id, content: '突然想到的事', type: null, status: 'converted' as const, convertedActionId: 'todo-a', createdAt: '', updatedAt: '' }, action: { ...action('todo-a', input.goalId), title: input.title } };
  });
  const view = mainlineView();
  await view.findByRole('heading', { name: '主线 a' });
  fireEvent.click(view.getByRole('button', { name: '快速记下' }));
  fireEvent.change(await view.findByPlaceholderText('想到什么，就写一句……'), { target: { value: '突然想到的事' } });
  fireEvent.click(view.getByRole('button', { name: '保存' }));
  await view.findByText('突然想到的事');
  fireEvent.click(view.getByRole('button', { name: '转为 To-do' }));
  assert.equal((view.getByLabelText('归入主线') as HTMLSelectElement).value, 'a');
  fireEvent.click(view.getByRole('button', { name: '转为 To-do' }));
  await view.findByText('收集箱已经清空。');
});

test('SPEC-0011：多于五条主线及密集知识节点不重叠，边保持来源', () => {
  for (const count of [0, 1, 5, 6, 12]) {
    const profile = emptyProfile();
    const node = (id: string, type: ProfileGraphNode['type']): ProfileGraphNode => ({ id, type, sourceId: id, title: id, subtitle: '', status: null, progress: null });
    profile.graph.nodes.push(node('self', 'self'));
    for (let i = 0; i < count; i++) {
      profile.graph.nodes.push(node(`g${i}`, 'goal'));
      profile.graph.edges.push({ id: `e${i}`, source: 'self', target: `g${i}`, relation: 'pursues' });
      for (let j = 0; j < 8; j++) {
        profile.graph.nodes.push(node(`k${i}-${j}`, 'knowledge'));
        profile.graph.edges.push({ id: `ek${i}-${j}`, source: `g${i}`, target: `k${i}-${j}`, relation: 'develops_knowledge' });
      }
    }
    const flow = buildProfileFlow(profile);
    assert.equal(flow.nodes.length, profile.graph.nodes.length);
    assert.equal(flow.edges.length, profile.graph.edges.length);
    for (let i = 0; i < flow.nodes.length; i++) for (let j = i + 1; j < flow.nodes.length; j++) {
      const a = flow.nodes[i].position, b = flow.nodes[j].position;
      assert.ok(Math.abs(a.x - b.x) >= 218 || Math.abs(a.y - b.y) >= 120, `${flow.nodes[i].id} overlaps ${flow.nodes[j].id}`);
    }
  }
});

test('SPEC-0012：快速收集转换立即刷新主线列表与派生进度', async () => {
  let records = [action('old')];
  mock.method(api, 'goals', async () => ({ goals: [{ ...goal('a'), progress: { completedTodoCount: 0, totalTodoCount: records.length, progressPercent: 0 } }] }));
  mock.method(api, 'current', async () => ({ context: null, contextIsStale: false, currentAction: null, strictMatches: [], allAvailable: records }));
  mock.method(api, 'goalActions', async () => ({ actions: [...records] }));
  const item: Capture = { id: 'capture', userId: user.id, content: '立即出现的新步骤', type: null, status: 'inbox', convertedActionId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  let captures = [item];
  mock.method(api, 'captures', async () => ({ captures: [...captures] }));
  mock.method(api, 'convertCapture', async () => { const created = { ...action('new'), title: item.content, content: item.content }; records.push(created); captures = []; return { capture: { ...item, status: 'converted' as const }, action: created }; });
  const view = mainlineView();
  await view.findByRole('heading', { name: '任务 old' });
  fireEvent.click(view.getByRole('button', { name: /快速记下/ }));
  fireEvent.click(await view.findByRole('button', { name: '转为 To-do' }));
  fireEvent.click(view.getByRole('button', { name: '转为 To-do' }));
  await waitFor(() => assert.match(view.container.querySelector('.todo-list')!.textContent!, /立即出现的新步骤/));
  assert.match(view.container.querySelector('.progress-copy')!.textContent!, /0 \/ 2/);
});

test('SPEC-0012：收集抽屉 Escape 关闭并返回原键盘焦点', async () => {
  setupMainlines();
  mock.method(api, 'goalActions', async () => ({ actions: [] }));
  mock.method(api, 'captures', async () => ({ captures: [] }));
  const view = mainlineView();
  const launcher = await view.findByRole('button', { name: '快速记下' });
  launcher.focus(); fireEvent.click(launcher);
  await view.findByRole('dialog', { name: '快速收集箱' });
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => assert.equal(view.queryByRole('dialog', { name: '快速收集箱' }), null));
  await waitFor(() => assert.equal(document.activeElement, launcher));
});

test('SPEC-0012：已打开的收集抽屉同步其他窗口的新记录', async () => {
  setupMainlines();
  mock.method(api, 'goalActions', async () => ({ actions: [] }));
  let records: Capture[] = [];
  mock.method(api, 'captures', async () => ({ captures: [...records] }));
  const view = mainlineView();
  fireEvent.click(await view.findByRole('button', { name: '快速记下' }));
  await view.findByText('收集箱已经清空。');
  records = [{ id: 'from-other-window', userId: user.id, content: '另一个窗口记下的想法', type: null, status: 'inbox', convertedActionId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
  await act(async () => dataChanged());
  await view.findByText('另一个窗口记下的想法');
  assert.equal(view.queryByText('收集箱已经清空。'), null);
});

test('SPEC-0012：工作区读取故障显示重试，不能伪装成登录失效', async () => {
  const { default: App } = await import('./App.js');
  const { ApiError } = await import('./api.js');
  let attempts = 0;
  mock.method(api, 'me', async () => { if (++attempts === 1) throw new ApiError('本地进程暂时未连接', undefined, 'LOCAL_UNAVAILABLE'); return { user }; });
  setupMainlines(); mock.method(api, 'goalActions', async () => ({ actions: [] })); mock.method(api, 'captures', async () => ({ captures: [] }));
  const view = render(<MemoryRouter initialEntries={['/expectations']}><App /></MemoryRouter>);
  await view.findByRole('heading', { name: '工作区暂时没有打开' });
  assert.equal(view.queryByLabelText('密码'), null);
  fireEvent.click(view.getByRole('button', { name: '重新打开' }));
  await view.findByRole('heading', { name: '主线' });
});

function capture(id = 'capture'): Capture {
  return { id, userId: user.id, content: `记录 ${id}`, type: null, status: 'inbox', convertedActionId: null, createdAt: new Date().toISOString(), updatedAt: '' };
}
function captureView() {
  mock.method(api, 'me', async () => ({ user }));
  mock.method(api, 'goals', async () => ({ goals: [goal('a')] }));
  return render(<MemoryRouter initialEntries={['/capture']}><App /></MemoryRouter>);
}

test('SPEC-0005：收集箱首次读取失败不显示清空，可重试且保留收集草稿', async () => {
  let attempts = 0;
  mock.method(api, 'captures', async () => {
    if (++attempts === 1) throw new Error('收集箱未能读取');
    return { captures: [capture()] };
  });
  const view = captureView();
  const input = await view.findByLabelText('收集内容');
  fireEvent.change(input, { target: { value: '读取失败时继续记下' } });
  await view.findByRole('alert');
  assert.equal(view.queryByText('收集箱已经清空。'), null);
  fireEvent.click(view.getByRole('button', { name: '重试读取收集箱' }));
  await view.findByText('记录 capture');
  assert.equal(view.queryByRole('alert'), null);
  assert.equal((view.getByLabelText('收集内容') as HTMLTextAreaElement).value, '读取失败时继续记下');
});

test('SPEC-0005：收集箱较早读取迟到不能覆盖最新记录', async () => {
  let release!: (value: { captures: Capture[] }) => void;
  let reads = 0;
  mock.method(api, 'captures', async () => {
    if (++reads === 1) return new Promise(resolve => { release = resolve; });
    return { captures: [capture('latest')] };
  });
  const view = captureView();
  await waitFor(() => assert.equal(reads, 1));
  await act(async () => dataChanged());
  await view.findByText('记录 latest');
  await act(async () => release({ captures: [capture('old')] }));
  assert.equal(view.queryByText('记录 old'), null);
  assert.ok(view.getByText('记录 latest'));
});

test('SPEC-0005：保存期间不能重复提交或关闭，失败保留输入并可重试', async () => {
  setupMainlines();
  mock.method(api, 'goalActions', async () => ({ actions: [] }));
  mock.method(api, 'captures', async () => ({ captures: [] }));
  let rejectWrite!: (error: Error) => void;
  const write = mock.method(api, 'createCapture', async () => new Promise<{ capture: Capture }>((_resolve, reject) => { rejectWrite = reject; }));
  const view = mainlineView();
  fireEvent.click(await view.findByRole('button', { name: '快速记下' }));
  const input = await view.findByLabelText('收集内容') as HTMLTextAreaElement;
  fireEvent.change(input, { target: { value: '不能丢掉的草稿' } });
  const form = input.closest('form')!;
  fireEvent.submit(form);
  fireEvent.submit(form);
  assert.equal(write.mock.calls.length, 1);
  assert.equal(input.disabled, true);
  assert.equal((view.getByRole('button', { name: '关闭' }) as HTMLButtonElement).disabled, true);
  fireEvent.keyDown(document, { key: 'Escape' });
  assert.ok(view.getByRole('dialog', { name: '快速收集箱' }));
  fireEvent.mouseDown(view.container.querySelector('.capture-backdrop')!);
  assert.ok(view.getByRole('dialog', { name: '快速收集箱' }));
  await act(async () => rejectWrite(new Error('保存暂时失败')));
  await view.findByRole('alert');
  assert.equal(input.value, '不能丢掉的草稿');
  assert.equal(input.disabled, false);
  mock.method(api, 'createCapture', async () => ({ capture: capture('saved') }));
  fireEvent.submit(form);
  await waitFor(() => assert.equal(input.value, ''));
});

test('SPEC-0005：转换写入锁定整理操作，失败保留目标和标题', async () => {
  mock.method(api, 'captures', async () => ({ captures: [capture('first'), capture('second')] }));
  let rejectWrite!: (error: Error) => void;
  const write = mock.method(api, 'convertCapture', async () => new Promise<{ capture: Capture; action: GoalAction }>((_resolve, reject) => { rejectWrite = reject; }));
  const view = captureView();
  fireEvent.click((await view.findAllByRole('button', { name: '转为 To-do' }))[0]);
  const input = view.getByLabelText('To-do 标题') as HTMLInputElement;
  fireEvent.change(input, { target: { value: '用户确认的标题' } });
  fireEvent.submit(input.closest('form')!);
  fireEvent.submit(input.closest('form')!);
  assert.equal(write.mock.calls.length, 1);
  for (const button of view.getAllByRole('button', { name: /归档|删除|取消|转为 To-do/ })) {
    assert.equal((button as HTMLButtonElement).disabled, true);
  }
  assert.equal(input.disabled, true);
  await act(async () => rejectWrite(new Error('目标主线已暂停')));
  await view.findByRole('alert');
  assert.equal(input.value, '用户确认的标题');
  assert.equal((view.getByLabelText('归入主线') as HTMLSelectElement).value, 'a');
  assert.ok(view.getByText('记录 first'));
});

test('SPEC-0005：整理目标被后台停用时保留选择，要求重新选主线', async () => {
  mock.method(api, 'captures', async () => ({ captures: [capture()] }));
  const view = captureView();
  fireEvent.click(await view.findByRole('button', { name: '转为 To-do' }));
  let goals = [goal('b')];
  const read = mock.method(api, 'goals', async () => ({ goals }));
  const write = mock.method(api, 'convertCapture', async (_id: string, input: { goalId: string; title: string }) => ({ capture: capture(), action: action(input.title, input.goalId) }));
  await act(async () => dataChanged());
  await view.findByRole('option', { name: '原主线已不可用，请重新选择' });
  assert.equal(read.mock.calls.length, 1);
  const target = view.getByLabelText('归入主线') as HTMLSelectElement;
  assert.equal(target.value, 'a');
  assert.ok(view.getByRole('option', { name: '原主线已不可用，请重新选择' }));
  assert.equal((view.getByRole('button', { name: '转为 To-do' }) as HTMLButtonElement).disabled, true);
  fireEvent.submit(target.closest('form')!);
  assert.equal(write.mock.calls.length, 0);
  fireEvent.change(target, { target: { value: 'b' } });
  fireEvent.click(view.getByRole('button', { name: '转为 To-do' }));
  await waitFor(() => assert.equal(write.mock.calls.length, 1));
  assert.equal(write.mock.calls[0].arguments[1].goalId, 'b');
});

test('SPEC-0005：侧栏待整理数量不被抽屉加载前的旧读取回退', async () => {
  setupMainlines();
  mock.method(api, 'goalActions', async () => ({ actions: [] }));
  let release!: (value: { captures: Capture[] }) => void;
  let reads = 0;
  mock.method(api, 'captures', async () => {
    if (++reads === 1) return new Promise(resolve => { release = resolve; });
    return { captures: [capture('new')] };
  });
  const view = mainlineView();
  fireEvent.click(await view.findByRole('button', { name: '快速记下' }));
  await view.findByText('记录 new');
  assert.equal(view.container.querySelector('[aria-label="1 条待整理"]')?.textContent, '1');
  await act(async () => release({ captures: [] }));
  assert.equal(view.container.querySelector('[aria-label="1 条待整理"]')?.textContent, '1');
});

test('SPEC-0011：画像后台刷新保留自述、经历与知识草稿和键盘焦点', async () => {
  setupMainlines();
  mock.method(api, 'captures', async () => ({ captures: [] }));
  const profile = emptyProfile();
  profile.description = { content: '原描述', updatedAt: '' };
  profile.goals = [{ goal: goal('a'), progress: goal('a').progress }];
  profile.experiences = [{ goal: { ...goal('a'), status: 'completed' }, progress: goal('a').progress, reflection: { id: 'reflection', goalId: 'a', summary: '原总结', createdAt: '', updatedAt: '' } }];
  const read = mock.method(api, 'profile', async () => ({ profile: structuredClone(profile) }));
  const view = render(<MemoryRouter><ProfilePage user={user} onLogout={() => {}} /></MemoryRouter>);
  const description = await view.findByPlaceholderText('写下你想如何理解自己，或暂时留白。') as HTMLTextAreaElement;
  const summary = view.getByPlaceholderText('这条主线带给你的经历或认识…') as HTMLTextAreaElement;
  fireEvent.change(description, { target: { value: '尚未保存的自述' } });
  fireEvent.change(summary, { target: { value: '尚未保存的经历' } });
  fireEvent.change(view.getByLabelText('知识标题'), { target: { value: '尚未保存的知识' } });
  summary.focus();
  profile.description.content = '其他窗口的新描述';
  profile.experiences[0].reflection!.summary = '其他窗口的新总结';
  profile.factSummary.completedActionCount = 1;
  await act(async () => dataChanged());
  await waitFor(() => assert.equal(view.getByText('步已完成').previousElementSibling!.textContent, '1'));
  assert.equal(read.mock.calls.length, 2);
  assert.equal(view.getByPlaceholderText('写下你想如何理解自己，或暂时留白。'), description);
  assert.equal(view.getByPlaceholderText('这条主线带给你的经历或认识…'), summary);
  assert.equal(description.value, '尚未保存的自述');
  assert.equal(summary.value, '尚未保存的经历');
  assert.equal((view.getByLabelText('知识标题') as HTMLInputElement).value, '尚未保存的知识');
  assert.equal(document.activeElement, summary);
});

test('SPEC-0011：画像过期读取不能覆盖新事实或未编辑的自述', async () => {
  setupMainlines();
  mock.method(api, 'captures', async () => ({ captures: [] }));
  let release!: (value: { profile: Profile }) => void;
  let reads = 0;
  mock.method(api, 'profile', async () => {
    if (++reads === 1) return new Promise(resolve => { release = resolve; });
    const profile = emptyProfile();
    profile.description = { content: '最新描述', updatedAt: '' };
    return { profile };
  });
  const view = render(<MemoryRouter><ProfilePage user={user} onLogout={() => {}} /></MemoryRouter>);
  await waitFor(() => assert.equal(reads, 1));
  await act(async () => dataChanged());
  await view.findByDisplayValue('最新描述');
  await act(async () => release({ profile: emptyProfile() }));
  assert.ok(view.getByDisplayValue('最新描述'));
});

test('SPEC-0011：自述保存失败保留草稿，写入时锁定表单并防止重复保存', async () => {
  setupMainlines();
  mock.method(api, 'captures', async () => ({ captures: [] }));
  const read = mock.method(api, 'profile', async () => ({ profile: emptyProfile() }));
  let rejectWrite!: (error: Error) => void;
  const write = mock.method(api, 'saveDescription', async () => new Promise<{ description: Profile['description'] }>((_resolve, reject) => { rejectWrite = reject; }));
  const view = render(<MemoryRouter><ProfilePage user={user} onLogout={() => {}} /></MemoryRouter>);
  const description = await view.findByPlaceholderText('写下你想如何理解自己，或暂时留白。') as HTMLTextAreaElement;
  fireEvent.change(description, { target: { value: '失败后保留' } });
  const button = view.getByRole('button', { name: '保存描述' });
  fireEvent.click(button);
  fireEvent.click(button);
  assert.equal(write.mock.calls.length, 1);
  assert.equal(description.disabled, true);
  assert.equal((view.getByLabelText('知识标题') as HTMLInputElement).disabled, true);
  await act(async () => rejectWrite(new Error('描述保存失败')));
  await view.findByRole('alert');
  assert.equal(description.value, '失败后保留');
  assert.equal(description.disabled, false);
  await act(async () => dataChanged());
  await waitFor(() => assert.equal(read.mock.calls.length, 2));
  assert.equal(description.value, '失败后保留');
  assert.match(view.getByRole('alert').textContent!, /描述保存失败/);
});

test('SPEC-0015：主线编辑任务被后台替换后仍保留原草稿和保存目标', async () => {
  setupMainlines();
  mock.method(api, 'captures', async () => ({ captures: [] }));
  let records = [action('original'), action('other')];
  const read = mock.method(api, 'goalActions', async () => ({ actions: structuredClone(records) }));
  const write = mock.method(api, 'updateAction', async () => { throw new Error('原任务已不存在'); });
  const view = mainlineView();
  fireEvent.click(await view.findByRole('button', { name: '编辑 To-do' }));
  fireEvent.change(view.getByLabelText('To-do 标题'), { target: { value: '原任务的未保存内容' } });
  records = [action('other')];
  await act(async () => dataChanged());
  await waitFor(() => {
    assert.equal(read.mock.calls.length, 2);
    assert.equal(view.queryByRole('button', { name: /任务 original/ }), null);
    assert.equal((view.getByRole('button', { name: '保存 To-do' }) as HTMLButtonElement).disabled, false);
  });
  assert.equal((view.getByLabelText('To-do 标题') as HTMLInputElement).value, '原任务的未保存内容');
  fireEvent.click(view.getByRole('button', { name: '保存 To-do' }));
  await view.findByRole('alert');
  assert.equal(write.mock.calls[0].arguments[0], 'original');
  assert.equal((view.getByLabelText('To-do 标题') as HTMLInputElement).value, '原任务的未保存内容');
});
