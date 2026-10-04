import assert from 'node:assert/strict';
import { afterEach, test, mock } from 'node:test';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
});
Object.defineProperties(globalThis, {
  window: { value: dom.window, configurable: true },
  document: { value: dom.window.document, configurable: true },
  navigator: { value: dom.window.navigator, configurable: true },
  HTMLElement: { value: dom.window.HTMLElement, configurable: true },
  IS_REACT_ACT_ENVIRONMENT: { value: true, writable: true, configurable: true },
});
const { render, fireEvent, waitFor, cleanup, act } = await import(
  '@testing-library/react'
);
const { MemoryRouter } = await import('react-router-dom');
const { TodoPlanner } = await import('./TodoPlanner.js');
const { api, ApiError, dataChanged } = await import('./api.js');
import type { GoalAction, Mainline } from './api.js';
import { calendarDays, localDay, shiftDay } from '../../../shared/calendar.js';
const goal = (id: string): Mainline => ({
  id,
  userId: 'u',
  title: `主线 ${id}`,
  doneDefinition: null,
  status: 'active',
  completedAt: null,
  createdAt: '',
  updatedAt: '',
  progress: { completedTodoCount: 0, totalTodoCount: 0, progressPercent: 0 },
});
const action = (
  id: string,
  scheduledDate: string | null = null,
): GoalAction => ({
  id,
  userId: 'u',
  goalId: 'a',
  parentActionId: null,
  title: `任务 ${id}`,
  content: null,
  scheduledDate,
  estimatedMinutes: null,
  energyRequired: null,
  status: 'available',
  blockerNote: null,
  outcomeNote: null,
  resolvedAt: null,
  createdAt: '',
  updatedAt: '',
});
function setup(records: GoalAction[]) {
  mock.method(api, 'goals', async () => ({ goals: [goal('a'), goal('b')] }));
  mock.method(api, 'current', async () => ({
    context: null,
    contextIsStale: false,
    currentAction: null,
    strictMatches: [],
    allAvailable: [],
  }));
  mock.method(api, 'todos', async () => ({
    actions: structuredClone(records),
  }));
  const changes = mock.method(
    api,
    'changeActionStatus',
    async (source: GoalAction, status: GoalAction['status']) => {
      const todo = records.find((item) => item.id === source.id)!;
      assert.equal(
        todo.status,
        source.status,
        'UI must send the observed status',
      );
      todo.status = status;
      return { action: { ...todo } };
    },
  );
  return { records, changes };
}
function view(mode: 'list' | 'today' | 'calendar' = 'list') {
  return render(
    <MemoryRouter>
      <TodoPlanner view={mode} viewSwitch={<nav>视图切换</nav>} />
    </MemoryRouter>,
  );
}
afterEach(() => {
  cleanup();
  mock.restoreAll();
});

test('SPEC-0013：列表直接完成有即时撤销，完整列表也能取消勾选', async () => {
  const { changes } = setup([action('a'), action('b')]);
  const page = view();
  fireEvent.click(await page.findByRole('checkbox', { name: '完成 任务 a' }));
  await page.findByRole('button', { name: '撤销' });
  assert.equal(page.queryByRole('checkbox', { name: '完成 任务 a' }), null);
  fireEvent.click(page.getByRole('button', { name: '撤销' }));
  await page.findByRole('checkbox', { name: '完成 任务 a' });
  assert.equal(changes.mock.calls.length, 2);
  fireEvent.change(page.getByLabelText('筛选任务状态'), {
    target: { value: 'all' },
  });
  fireEvent.click(page.getByRole('checkbox', { name: '完成 任务 b' }));
  fireEvent.click(
    await page.findByRole('checkbox', { name: '撤销完成 任务 b' }),
  );
  await page.findByRole('checkbox', { name: '完成 任务 b' });
});

test('SPEC-0013：今日只包含今天与之前未处理，不混入无日期、未来和已完成', async () => {
  const today = localDay();
  setup([
    action('today', today),
    action('past', shiftDay(today, -1)),
    action('future', shiftDay(today, 1)),
    action('no-date'),
    { ...action('done', today), status: 'completed' },
  ]);
  const page = view('today');
  await page.findByRole('checkbox', { name: '完成 任务 today' });
  assert.ok(page.getByRole('checkbox', { name: '完成 任务 past' }));
  for (const name of ['future', 'no-date', 'done'])
    assert.equal(
      page.queryByRole('checkbox', { name: `完成 任务 ${name}` }),
      null,
    );
});

test('SPEC-0013：月/周切换与选日新建使用真实日期，保存后任务在当天出现', async () => {
  const { records } = setup([]);
  mock.method(
    api,
    'createGoalAction',
    async (goalId: string, input: Partial<GoalAction>) => {
      const created = { ...action('created'), ...input, goalId };
      records.push(created);
      return { action: created };
    },
  );
  const page = view('calendar');
  await page.findByRole('grid', { name: '月日历' });
  assert.equal(page.getAllByRole('gridcell').length, 42);
  const chosen = calendarDays(localDay(), 'month')[10];
  fireEvent.click(page.getByRole('button', { name: `${chosen}，0 条任务` }));
  fireEvent.click(page.getByRole('button', { name: '在这天新建任务' }));
  assert.equal(
    (page.getByLabelText('安排日期') as HTMLInputElement).value,
    chosen,
  );
  fireEvent.change(page.getByLabelText('To-do 标题'), {
    target: { value: '安排的任务' },
  });
  fireEvent.click(page.getByRole('button', { name: '加入主线' }));
  await page.findByRole('heading', { name: '安排的任务' });
  assert.equal(records[0].scheduledDate, chosen);
  fireEvent.click(page.getByRole('button', { name: '周' }));
  assert.equal(page.getAllByRole('gridcell').length, 7);
  assert.ok(page.getByRole('button', { name: `${chosen}，1 条任务` }));
  fireEvent.click(page.getByRole('button', { name: '月' }));
  assert.equal(page.getAllByRole('gridcell').length, 42);
});

test('SPEC-0013：编辑可清除日期并保留内容，编辑期间不会被筛选操作重置', async () => {
  const { records } = setup([
    { ...action('edit', localDay()), content: '完整内容' },
  ]);
  mock.method(
    api,
    'updateAction',
    async (id: string, input: Partial<GoalAction>) => {
      Object.assign(records.find((todo) => todo.id === id)!, input);
      return { action: records[0] };
    },
  );
  const page = view();
  fireEvent.click(await page.findByRole('button', { name: /任务 edit/ }));
  fireEvent.click(page.getByRole('button', { name: '编辑任务' }));
  assert.equal(
    (page.getByLabelText('筛选主线') as HTMLSelectElement).disabled,
    true,
  );
  assert.equal((page.getByRole('button', { name: /任务 edit/ }) as HTMLButtonElement).disabled, true);
  fireEvent.click(page.getByRole('button', { name: '清除日期' }));
  fireEvent.click(page.getByRole('button', { name: '保存 To-do' }));
  await waitFor(() => assert.equal(records[0].scheduledDate, null));
  await page.findByRole('button', { name: '编辑任务' });
  assert.equal(records[0].content, '完整内容');
  assert.ok(page.getAllByText('未安排').length);
});

test('SPEC-0013：月历编辑未安排任务保留空日期，不把选定日当成新安排', async () => {
  const { records } = setup([action('unplanned')]);
  mock.method(api, 'updateAction', async (_id: string, input: Partial<GoalAction>) => {
    Object.assign(records[0], input);
    return { action: records[0] };
  });
  const page = view('calendar');
  await page.findByRole('grid', { name: '月日历' });
  fireEvent.click(page.getByText('未安排日期'));
  fireEvent.click(page.getByRole('button', { name: /任务 unplanned/ }));
  fireEvent.click(page.getByRole('button', { name: '编辑任务' }));
  assert.equal((page.getByLabelText('安排日期') as HTMLInputElement).value, '');
  fireEvent.change(page.getByLabelText('To-do 标题'), { target: { value: '只改标题' } });
  fireEvent.click(page.getByRole('button', { name: '保存 To-do' }));
  await page.findByRole('heading', { name: '只改标题' });
  assert.equal(records[0].scheduledDate, null);
});

test('SPEC-0013：移除取消不写入，确认后可在已移除中恢复', async () => {
  const { changes, records } = setup([action('remove', localDay())]);
  const page = view();
  fireEvent.click(await page.findByRole('button', { name: /任务 remove/ }));
  fireEvent.click(page.getByRole('button', { name: '移除任务' }));
  fireEvent.click(page.getByRole('button', { name: '取消' }));
  assert.equal(changes.mock.calls.length, 0);
  fireEvent.click(page.getByRole('button', { name: '移除任务' }));
  fireEvent.click(page.getByRole('button', { name: '确认移除' }));
  await page.findByRole('button', { name: '撤销' });
  assert.equal(records[0].status, 'abandoned');
  assert.equal(changes.mock.calls[0].arguments[2], true);
  fireEvent.change(page.getByLabelText('筛选任务状态'), {
    target: { value: 'abandoned' },
  });
  fireEvent.click(page.getByRole('button', { name: /任务 remove/ }));
  fireEvent.click(page.getByRole('button', { name: '恢复任务' }));
  await waitFor(() => assert.equal(records[0].status, 'available'));
  assert.equal(records[0].scheduledDate, localDay());
});

test('SPEC-0013：浏览器 input 日期事件立即更新，编辑其他字段不会重置日期', async () => {
  const { records } = setup([action('date-input')]);
  mock.method(api, 'updateAction', async (_id: string, input: Partial<GoalAction>) => {
    Object.assign(records[0], input); return {action: records[0]};
  });
  const page = view();
  fireEvent.click(await page.findByRole('button', {name: /任务 date-input/}));
  page.getByRole('button', {name: '编辑任务'}).focus();
  fireEvent.click(page.getByRole('button', {name: '编辑任务'}));
  fireEvent.input(page.getByLabelText('安排日期'), {target: {value: '2026-10-08'}});
  assert.ok(page.getByRole('button', {name: '清除日期'}));
  fireEvent.change(page.getByLabelText('To-do 标题'), {target: {value: '修改后的标题'}});
  assert.equal((page.getByLabelText('安排日期') as HTMLInputElement).value, '2026-10-08');
  fireEvent.click(page.getByRole('button', {name: '保存 To-do'}));
  await page.findByRole('heading', {name: '修改后的标题'});
  assert.equal(records[0].scheduledDate, '2026-10-08');
  assert.equal(document.activeElement?.textContent, '新建任务');
});

test('SPEC-0013：搜索与主线筛选操作同一份任务，不改变记录', async () => {
  setup([action('alpha'), { ...action('beta'), goalId: 'b' }]);
  const page = view();
  await page.findByRole('checkbox', { name: '完成 任务 alpha' });
  fireEvent.change(page.getByLabelText('搜索任务'), {
    target: { value: 'beta' },
  });
  assert.equal(page.queryByRole('checkbox', { name: '完成 任务 alpha' }), null);
  assert.ok(page.getByRole('checkbox', { name: '完成 任务 beta' }));
  fireEvent.change(page.getByLabelText('筛选主线'), { target: { value: 'a' } });
  assert.ok(page.getByText('没有找到符合搜索条件的任务。'));
  fireEvent.change(page.getByLabelText('搜索任务'), { target: { value: '' } });
  assert.ok(page.getByRole('checkbox', { name: '完成 任务 alpha' }));
});

test('SPEC-0013：读取失败保留事实；状态冲突刷新且不显示假成功', async () => {
  const { records } = setup([action('stable')]);
  const page = view();
  await page.findByRole('checkbox', { name: '完成 任务 stable' });
  mock.method(api, 'todos', async () => {
    throw new Error('读取失败');
  });
  await act(async () => dataChanged());
  await page.findByRole('alert');
  assert.ok(page.getByRole('checkbox', { name: '完成 任务 stable' }));
  mock.method(api, 'todos', async () => ({
    actions: structuredClone(records),
  }));
  fireEvent.click(page.getByRole('button', { name: '重试' }));
  await waitFor(() => assert.equal(page.queryByRole('alert'), null));
  mock.method(api, 'changeActionStatus', async () => {
    records[0].status = 'completed';
    throw new ApiError('窗口状态已改变', undefined, 'ACTION_CHANGED');
  });
  fireEvent.click(page.getByRole('checkbox', { name: '完成 任务 stable' }));
  await page.findByText('窗口状态已改变');
  assert.equal(page.queryByRole('button', { name: '撤销' }), null);
  assert.equal(
    page.queryByRole('checkbox', { name: '完成 任务 stable' }),
    null,
  );
});

test('SPEC-0013：更早的读取迟到不能覆盖最新任务', async () => {
  setup([action('new')]);
  let resolveOld!: (value: { actions: GoalAction[] }) => void;
  const pending = new Promise<{ actions: GoalAction[] }>((resolve) => {
    resolveOld = resolve;
  });
  let count = 0;
  mock.method(api, 'todos', async () =>
    ++count === 1 ? pending : { actions: [action('new')] },
  );
  const page = view();
  await waitFor(() => assert.equal(count, 1));
  await act(async () => dataChanged());
  await page.findByRole('checkbox', { name: '完成 任务 new' });
  await act(async () => resolveOld({ actions: [action('old')] }));
  assert.equal(page.queryByRole('checkbox', { name: '完成 任务 old' }), null);
});
