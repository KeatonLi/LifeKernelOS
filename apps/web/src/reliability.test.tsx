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
const { ExpectationsPage, ProfilePage, buildProfileFlow } = await import('./App.js');
const { api } = await import('./api.js');
import type { Mainline, GoalAction, Profile, ProfileGraphNode } from './api.js';

const user = { id: 'user', email: 'test@example.com', createdAt: '' };
const goal = (id: string): Mainline => ({ id, userId: user.id, title: `主线 ${id}`, doneDefinition: null, status: 'active', completedAt: null, createdAt: '', updatedAt: '', progress: { completedTodoCount: 0, totalTodoCount: 0, progressPercent: 0 } });
const action = (id: string, goalId = 'a'): GoalAction => ({ id, userId: user.id, goalId, parentActionId: null, title: `任务 ${id}`, content: null, estimatedMinutes: null, energyRequired: null, status: 'available', blockerNote: null, outcomeNote: null, resolvedAt: null, createdAt: '', updatedAt: '' });
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
