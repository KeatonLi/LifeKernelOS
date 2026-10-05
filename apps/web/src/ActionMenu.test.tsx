import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
Object.defineProperties(globalThis, {
  window: { value: dom.window, configurable: true },
  document: { value: dom.window.document, configurable: true },
  navigator: { value: dom.window.navigator, configurable: true },
  HTMLElement: { value: dom.window.HTMLElement, configurable: true },
  IS_REACT_ACT_ENVIRONMENT: { value: true, writable: true, configurable: true },
});
const { render, fireEvent, cleanup, act } = await import('@testing-library/react');
const { ActionMenu } = await import('./ActionMenu.js');

afterEach(cleanup);

test('SPEC-0015：更多菜单键盘进入，循环导航与首尾跳转跳过禁用操作', () => {
  const view = render(<ActionMenu items={[
    { label: '不可操作', onSelect: () => {}, disabled: true },
    { label: '拆小', onSelect: () => {} },
    { label: '卡住', onSelect: () => {}, disabled: true },
    { label: '暂时放下', onSelect: () => {} },
  ]} />);
  const trigger = view.getByRole('button', { name: '更多任务操作' });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  const first = view.getByRole('menuitem', { name: '拆小' });
  const last = view.getByRole('menuitem', { name: '暂时放下' });
  assert.ok(document.activeElement === first);
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  assert.equal(trigger.getAttribute('aria-controls'), view.getByRole('menu').id);
  fireEvent.keyDown(first, { key: 'ArrowUp' });
  assert.ok(document.activeElement === last);
  fireEvent.keyDown(last, { key: 'ArrowDown' });
  assert.ok(document.activeElement === first);
  fireEvent.keyDown(first, { key: 'ArrowDown' });
  assert.ok(document.activeElement === last);
  fireEvent.keyDown(last, { key: 'Home' });
  assert.ok(document.activeElement === first);
  fireEvent.keyDown(first, { key: 'End' });
  assert.ok(document.activeElement === last);
});

test('SPEC-0015：向上进入末项，Escape 返回触发器，选择关闭后执行一次操作', () => {
  let selected = 0;
  let focusAtSelection: Element | null = null;
  const view = render(<ActionMenu items={[
    { label: '编辑', onSelect: () => { selected++; focusAtSelection = document.activeElement; } },
    { label: '移除', onSelect: () => {}, danger: true },
  ]} />);
  const trigger = view.getByRole('button', { name: '更多任务操作' });
  fireEvent.keyDown(trigger, { key: 'ArrowUp' });
  assert.ok(document.activeElement === view.getByRole('menuitem', { name: '移除' }));
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  assert.equal(view.queryByRole('menu'), null);
  assert.ok(document.activeElement === trigger);
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(selected, 0);
  fireEvent.click(trigger);
  fireEvent.click(view.getByRole('menuitem', { name: '编辑' }));
  assert.equal(view.queryByRole('menu'), null);
  assert.equal(selected, 1);
  assert.ok(focusAtSelection === trigger);
});

test('SPEC-0015：Tab 不拦截原生焦点移动，外部点击与外部焦点关闭菜单', async () => {
  const view = render(<><ActionMenu items={[{ label: '拆小', onSelect: () => {} }]} /><button>外部操作</button></>);
  const trigger = view.getByRole('button', { name: '更多任务操作' });
  const outside = view.getByRole('button', { name: '外部操作' });
  fireEvent.click(trigger);
  await act(async () => {
    assert.equal(fireEvent.keyDown(view.getByRole('menuitem'), { key: 'Tab' }), true);
    // Flush the deferred close and React update without racing a polling timeout.
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  });
  assert.equal(view.queryByRole('menu'), null);
  fireEvent.click(trigger);
  await act(async () => {
    assert.equal(fireEvent.keyDown(view.getByRole('menuitem'), { key: 'Tab', shiftKey: true }), true);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  });
  assert.equal(view.queryByRole('menu'), null);
  fireEvent.click(trigger);
  fireEvent.pointerDown(outside);
  assert.equal(view.queryByRole('menu'), null);
  fireEvent.click(trigger);
  act(() => outside.focus());
  assert.equal(view.queryByRole('menu'), null);
  assert.ok(document.activeElement === outside);
});

test('SPEC-0015：禁用项目不执行，写入期间关闭菜单并禁止再次打开', () => {
  let selected = 0;
  const items = [
    { label: '不可操作', onSelect: () => { selected++; }, disabled: true },
    { label: '可操作', onSelect: () => { selected++; } },
  ];
  const view = render(<ActionMenu items={items} />);
  const trigger = view.getByRole('button', { name: '更多任务操作' });
  fireEvent.click(trigger);
  fireEvent.click(view.getByRole('menuitem', { name: '不可操作' }));
  assert.equal(selected, 0);
  assert.ok(view.getByRole('menu'));
  view.rerender(<ActionMenu items={items} disabled />);
  assert.equal(view.queryByRole('menu'), null);
  fireEvent.click(trigger);
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  assert.equal(view.queryByRole('menu'), null);
  assert.equal(selected, 0);
  view.rerender(<ActionMenu items={items} />);
  assert.equal(view.queryByRole('menu'), null);
  fireEvent.click(trigger);
  fireEvent.click(view.getByRole('menuitem', { name: '可操作' }));
  assert.equal(selected, 1);
});

test('SPEC-0015：多个菜单拥有独立身份，打开另一个或切换任务不保留旧菜单', () => {
  let firstSelected = 0;
  let secondSelected = 0;
  const firstItems = [{ label: '处理第一条', onSelect: () => { firstSelected++; } }];
  const secondItems = [{ label: '处理第二条', onSelect: () => { secondSelected++; } }];
  function Menus({ taskId = 'one' }: { taskId?: string }) {
    return <><ActionMenu key={taskId} ariaLabel="第一条的更多操作" items={firstItems} />
      <ActionMenu ariaLabel="第二条的更多操作" items={secondItems} /></>;
  }
  const view = render(<Menus />);
  const firstTrigger = view.getByRole('button', { name: '第一条的更多操作' });
  const secondTrigger = view.getByRole('button', { name: '第二条的更多操作' });
  assert.notEqual(firstTrigger.getAttribute('aria-controls'), secondTrigger.getAttribute('aria-controls'));
  fireEvent.click(firstTrigger);
  fireEvent.click(secondTrigger);
  assert.equal(view.queryByRole('menu', { name: '第一条的更多操作' }), null);
  assert.ok(view.getByRole('menu', { name: '第二条的更多操作' }));
  fireEvent.click(view.getByRole('menuitem', { name: '处理第二条' }));
  assert.equal(firstSelected, 0);
  assert.equal(secondSelected, 1);
  fireEvent.click(firstTrigger);
  view.rerender(<Menus taskId="replacement" />);
  assert.equal(view.queryByRole('menu'), null);
  fireEvent.click(view.getByRole('button', { name: '第一条的更多操作' }));
  fireEvent.click(view.getByRole('menuitem', { name: '处理第一条' }));
  assert.equal(firstSelected, 1);
  assert.equal(secondSelected, 1);
});
