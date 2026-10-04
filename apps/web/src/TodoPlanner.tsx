import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArchiveIcon,
  ArrowCounterClockwiseIcon,
  CalendarBlankIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CheckCircleIcon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  PlusIcon,
  TargetIcon,
  XIcon,
} from '@phosphor-icons/react';
import {
  api,
  ApiError,
  subscribeData,
  type GoalAction,
  type Mainline,
} from './api.js';
import { TodoEditor } from './TodoEditor.js';
import {
  calendarDays,
  civilDate,
  dayLabel,
  isCalendarDate,
  localDay,
  shiftDay,
  shiftMonth,
} from '../../../shared/calendar.js';

type View = 'list' | 'today' | 'calendar';
type Filter = 'pending' | 'all' | 'completed' | 'abandoned';
const stateName = {
  available: '待进行',
  completed: '已完成',
  blocked: '已卡住',
  abandoned: '已移除',
  superseded: '已拆分',
};

export function TodoPlanner({
  view,
  viewSwitch,
}: {
  view: View;
  viewSwitch: ReactNode;
}) {
  const navigate = useNavigate();
  const [goals, setGoals] = useState<Mainline[]>([]);
  const [todos, setTodos] = useState<GoalAction[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [undoAction, setUndoAction] = useState<GoalAction | null>(null);
  const [query, setQuery] = useState('');
  const [goalFilter, setGoalFilter] = useState('all');
  const [filter, setFilter] = useState<Filter>('pending');
  const [today, setToday] = useState(localDay);
  const [selectedDay, setSelectedDay] = useState(localDay);
  const [anchor, setAnchor] = useState(localDay);
  const [calendarView, setCalendarView] = useState<'month' | 'week'>('month');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<'new' | 'edit' | null>(null);
  const [editorGoalId, setEditorGoalId] = useState('');
  const [removeConfirm, setRemoveConfirm] = useState(false);
  const version = useRef(0);
  const returnFocus = useRef<HTMLElement | null>(null);
  const inspector = useRef<HTMLElement | null>(null);
  const newTaskButton = useRef<HTMLButtonElement | null>(null);
  const focusAfterClose = useRef(false);
  const goalMap = new Map(goals.map((goal) => [goal.id, goal]));
  const selected = todos.find((todo) => todo.id === selectedId) ?? null;
  const activeGoals = goals.filter((goal) => goal.status === 'active');
  const canChange =
    selected && goalMap.get(selected.goalId)?.status === 'active';

  async function load() {
    const request = ++version.current;
    setLoading(true);
    try {
      const [goalResult, todoResult, workspace] = await Promise.all([
        api.goals(),
        api.todos(),
        api.current(),
      ]);
      if (request !== version.current) return;
      setGoals(goalResult.goals);
      setTodos(todoResult.actions);
      setCurrentId(workspace.currentAction?.id ?? null);
      setInitialized(true);
    } catch (reason) {
      if (request === version.current) setError(message(reason));
    } finally {
      if (request === version.current) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const unsubscribe = subscribeData(() => void load());
    const clock = setInterval(() => setToday(localDay()), 30000);
    const onFocus = () => setToday(localDay());
    window.addEventListener('focus', onFocus);
    return () => {
      version.current++;
      unsubscribe();
      clearInterval(clock);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  useEffect(() => {
    setSelectedId(null);
    setEditor(null);
    setRemoveConfirm(false);
  }, [view]);
  useEffect(() => {
    if (editor) inspector.current?.scrollIntoView?.({ block: 'nearest' });
    else if (focusAfterClose.current) {
      focusAfterClose.current = false;
      if (returnFocus.current?.isConnected) returnFocus.current.focus();
      else newTaskButton.current?.focus();
    }
  }, [editor]);

  const filtered = todos
    .filter((todo) => {
      if (todo.status === 'superseded') return false;
      if (goalFilter !== 'all' && todo.goalId !== goalFilter) return false;
      if (
        filter === 'pending' &&
        todo.status !== 'available' &&
        todo.status !== 'blocked'
      )
        return false;
      if (filter === 'all' && todo.status === 'abandoned') return false;
      if (
        (filter === 'completed' || filter === 'abandoned') &&
        todo.status !== filter
      )
        return false;
      return `${todo.title} ${todo.content ?? ''}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase());
    })
    .sort(
      (a, b) =>
        (a.scheduledDate ?? '9999-99-99').localeCompare(
          b.scheduledDate ?? '9999-99-99',
        ) || a.createdAt.localeCompare(b.createdAt),
    );
  const onDay = filtered.filter((todo) => todo.scheduledDate === selectedDay);
  const unplanned = filtered.filter((todo) => !todo.scheduledDate);
  const overdue = filtered.filter(
    (todo) =>
      todo.scheduledDate &&
      todo.scheduledDate < today &&
      (todo.status === 'available' || todo.status === 'blocked'),
  );
  const todayTasks = filtered.filter((todo) => todo.scheduledDate === today);
  const days = calendarDays(anchor, calendarView);
  const previousPeriod =
    calendarView === 'month' ? shiftMonth(anchor, -1) : shiftDay(anchor, -7);
  const nextPeriod =
    calendarView === 'month' ? shiftMonth(anchor, 1) : shiftDay(anchor, 7);

  async function write(operation: () => Promise<unknown>, success: string) {
    if (saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await operation();
      setNotice(success);
      await load();
      return true;
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === 'ACTION_CHANGED')
        await load();
      setError(message(reason));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(
    todo: GoalAction,
    status: 'available' | 'completed' | 'abandoned',
    confirmed = false,
  ) {
    const success = await write(
      () => api.changeActionStatus(todo, status, confirmed),
      status === 'completed'
        ? '任务已完成，主线进度已更新。'
        : status === 'abandoned'
          ? '任务已移除，可以恢复。'
          : '任务已恢复为待进行。',
    );
    if (success)
      setUndoAction(
        status === 'completed' || status === 'abandoned'
          ? { ...todo, status }
          : null,
      );
    return success;
  }

  function choose(todo: GoalAction) {
    setSelectedId(todo.id);
    setEditor(null);
    setRemoveConfirm(false);
  }
  function startEditor(mode: 'new' | 'edit') {
    returnFocus.current = document.activeElement as HTMLElement;
    setEditorGoalId(
      mode === 'edit' && selected
        ? selected.goalId
        : (activeGoals.find((goal) => goal.id === goalFilter)?.id ??
            activeGoals[0]?.id ??
            ''),
    );
    setEditor(mode);
    setRemoveConfirm(false);
  }
  function closeEditor() {
    focusAfterClose.current = true;
    setEditor(null);
  }
  function pickDay(day: string) {
    setSelectedDay(day);
    setSelectedId(null);
    setEditor(null);
    setRemoveConfirm(false);
  }
  function row(todo: GoalAction) {
    const editable = goalMap.get(todo.goalId)?.status === 'active';
    return (
      <li
        key={todo.id}
        className={`planner-row ${todo.status === 'completed' ? 'done' : ''} ${todo.id === selectedId ? 'selected' : ''}`}
      >
        {todo.status === 'abandoned' ? (
          <ArchiveIcon size={19} />
        ) : (
          <input
            type="checkbox"
            aria-label={`${todo.status === 'completed' ? '撤销完成' : '完成'} ${todo.title}`}
            checked={todo.status === 'completed'}
            disabled={saving || !editable || Boolean(editor)}
            onChange={() =>
              void changeStatus(
                todo,
                todo.status === 'completed' ? 'available' : 'completed',
              )
            }
          />
        )}
        <button className="planner-row-copy" disabled={saving || Boolean(editor)} onClick={() => choose(todo)}>
          <strong>{todo.title}</strong>
          <small>
            {goalMap.get(todo.goalId)?.title ?? '主线'}
            {todo.status === 'blocked' ? ' · 已卡住' : ''}
            {todo.id === currentId ? ' · 现在做' : ''}
          </small>
        </button>
        <span
          className={`planner-date ${todo.scheduledDate && todo.scheduledDate < today && todo.status !== 'completed' ? 'past' : ''}`}
        >
          {todo.scheduledDate ? dayLabel(todo.scheduledDate) : '未安排'}
        </span>
      </li>
    );
  }
  function group(title: string, records: GoalAction[], empty: string) {
    return (
      <section className="planner-group">
        <div className="planner-group-heading">
          <h2>{title}</h2>
          <span>{records.length}</span>
        </div>
        {records.length ? (
          <ul className="planner-list">{records.map(row)}</ul>
        ) : (
          <p className="planner-empty">{empty}</p>
        )}
      </section>
    );
  }

  return (
    <div className="mainline-page planner-page">
      <header className="workspace-heading">
        <div>
          <p className="eyebrow">A PLACE FOR WHAT MATTERS</p>
          <h1>
            {view === 'calendar'
              ? '给想做的事，留一天'
              : view === 'today'
                ? '今天，从一件事开始'
                : '把想法，变成行动'}
            <span>。</span>
          </h1>
          <p>记录、安排、完成。每个视图都是你的同一份清单。</p>
        </div>
        <div className="workspace-date">
          <span>{dayLabel(today)}</span>
          <small>
            {civilDate(today).toLocaleDateString('zh-CN', { weekday: 'long' })}
          </small>
        </div>
      </header>
      {viewSwitch}
      {error && (
        <div className="page-error" role="alert">
          {error}
          <button
            className="secondary-button"
            disabled={loading}
            onClick={() => {
              setError('');
              void load();
            }}
          >
            重试
          </button>
        </div>
      )}
      {notice && (
        <div className="page-notice" role="status">
          <CheckCircleIcon size={16} weight="fill" />
          {notice}
          {undoAction && (
            <button
              className="text-link"
              disabled={saving}
              onClick={() => void changeStatus(undoAction, 'available')}
            >
              撤销
            </button>
          )}
        </div>
      )}
      <div className="planner-toolbar">
        <label className="planner-search">
          <MagnifyingGlassIcon size={18} />
          <input
            type="search"
            disabled={Boolean(editor)}
            aria-label="搜索任务"
            placeholder="搜索任务…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedId(null);
            }}
          />
        </label>
        <select
          disabled={Boolean(editor)}
          aria-label="筛选主线"
          value={goalFilter}
          onChange={(event) => {
            setGoalFilter(event.target.value);
            setSelectedId(null);
          }}
        >
          <option value="all">全部主线</option>
          {goals.map((goal) => (
            <option key={goal.id} value={goal.id}>
              {goal.title}
            </option>
          ))}
        </select>
        <select
          disabled={Boolean(editor)}
          aria-label="筛选任务状态"
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value as Filter);
            setSelectedId(null);
          }}
        >
          <option value="pending">未完成</option>
          <option value="all">全部任务</option>
          <option value="completed">已完成</option>
          <option value="abandoned">已移除</option>
        </select>
        <button
          ref={newTaskButton}
          className="primary-button"
          disabled={
            !activeGoals.length || saving || !initialized || Boolean(editor)
          }
          onClick={() => startEditor('new')}
        >
          <PlusIcon size={18} weight="bold" />
          新建任务
        </button>
      </div>
      {!initialized ? (
        loading ? (
          <p className="planner-empty" role="status">
            正在读取任务…
          </p>
        ) : null
      ) : !goals.length ? (
        <div className="planner-zero">
          <TargetIcon size={36} weight="thin" />
          <h2>先建一条主线，开始你的清单。</h2>
          <p>任务会留在属于它的方向里。</p>
          <button
            className="primary-button"
            onClick={() => navigate('/expectations')}
          >
            去建立主线
          </button>
        </div>
      ) : (
        <div
          className={`planner-layout ${view === 'calendar' ? 'with-calendar' : ''}`}
          aria-busy={loading}
        >
          <div className="planner-main">
            {view === 'calendar' ? (
              <>
                <div className="calendar-toolbar">
                  <div>
                    <p className="eyebrow">YOUR SCHEDULE</p>
                    <h2>
                      {calendarView === 'month'
                        ? civilDate(anchor).toLocaleDateString('zh-CN', {
                            year: 'numeric',
                            month: 'long',
                          })
                        : `${dayLabel(days[0])} — ${dayLabel(days[6])}`}
                    </h2>
                  </div>
                  <div className="calendar-controls">
                    <button
                      className="secondary-button"
                      disabled={Boolean(editor)}
                      onClick={() => {
                        setAnchor(today);
                        pickDay(today);
                      }}
                    >
                      今天
                    </button>
                    <button
                      className="icon-control"
                      disabled={
                        Boolean(editor) || !isCalendarDate(previousPeriod)
                      }
                      aria-label={
                        calendarView === 'month' ? '上个月' : '上一周'
                      }
                      onClick={() => {
                        const next = previousPeriod;
                        setAnchor(next);
                        pickDay(next);
                      }}
                    >
                      <CaretLeftIcon size={18} />
                    </button>
                    <button
                      className="icon-control"
                      disabled={Boolean(editor) || !isCalendarDate(nextPeriod)}
                      aria-label={
                        calendarView === 'month' ? '下个月' : '下一周'
                      }
                      onClick={() => {
                        const next = nextPeriod;
                        setAnchor(next);
                        pickDay(next);
                      }}
                    >
                      <CaretRightIcon size={18} />
                    </button>
                    <div className="calendar-mode" aria-label="日历范围">
                      <button
                        disabled={Boolean(editor)}
                        aria-pressed={calendarView === 'month'}
                        onClick={() => {
                          setCalendarView('month');
                          setAnchor(selectedDay);
                        }}
                      >
                        月
                      </button>
                      <button
                        disabled={Boolean(editor)}
                        aria-pressed={calendarView === 'week'}
                        onClick={() => {
                          setCalendarView('week');
                          setAnchor(selectedDay);
                        }}
                      >
                        周
                      </button>
                    </div>
                  </div>
                </div>
                <div className="calendar-scroll">
                  <div
                    className={`calendar-grid ${calendarView}`}
                    role="grid"
                    aria-label={calendarView === 'month' ? '月日历' : '周日历'}
                  >
                    <div role="row" className="calendar-weekdays">
                      {['一', '二', '三', '四', '五', '六', '日'].map((day) => (
                        <span role="columnheader" key={day}>
                          周{day}
                        </span>
                      ))}
                    </div>
                    {Array.from(
                      { length: calendarView === 'month' ? 6 : 1 },
                      (_, week) => (
                        <div className="calendar-week" role="row" key={week}>
                          {days.slice(week * 7, week * 7 + 7).map((day) => {
                            const records = filtered.filter(
                              (todo) => todo.scheduledDate === day,
                            );
                            const previewCount =
                              calendarView === 'week'
                                ? 8
                                : records.length > 2
                                  ? 1
                                  : 2;
                            return (
                              <div
                                role="gridcell"
                                aria-selected={selectedDay === day}
                                key={day}
                                className={`calendar-cell ${selectedDay === day ? 'selected' : ''} ${day.slice(0, 7) !== anchor.slice(0, 7) && calendarView === 'month' ? 'outside' : ''}`}
                              >
                                <button
                                  disabled={
                                    Boolean(editor) || !isCalendarDate(day)
                                  }
                                  className={`calendar-day ${day === today ? 'is-today' : ''}`}
                                  aria-label={`${day}，${records.length} 条任务`}
                                  onClick={() => pickDay(day)}
                                >
                                  {Number(day.split('-')[2])}
                                </button>
                                <div className="calendar-events">
                                  {records
                                    .slice(0, previewCount)
                                    .map((todo) => (
                                      <button
                                        disabled={Boolean(editor)}
                                        key={todo.id}
                                        title={todo.title}
                                        className={
                                          todo.status === 'completed'
                                            ? 'done'
                                            : ''
                                        }
                                        onClick={() => {
                                          setSelectedDay(day);
                                          choose(todo);
                                        }}
                                      >
                                        {todo.title}
                                      </button>
                                    ))}
                                  {records.length > previewCount && (
                                    <button
                                      className="calendar-more"
                                      disabled={Boolean(editor)}
                                      onClick={() => pickDay(day)}
                                    >
                                      还有 {records.length - previewCount} 条
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ),
                    )}
                  </div>
                </div>
                <details className="unplanned-tasks">
                  <summary>
                    未安排日期 <span>{unplanned.length}</span>
                  </summary>
                  {unplanned.length ? (
                    <ul className="planner-list">{unplanned.map(row)}</ul>
                  ) : (
                    <p className="planner-empty">每件事都有了自己的日期。</p>
                  )}
                </details>
              </>
            ) : view === 'today' ? (
              <>
                {group('之前未处理', overdue, '没有之前遗留的任务。')}
                {group(
                  '安排在今天',
                  todayTasks,
                  '今天还没有安排任务，可以从一件小事开始。',
                )}
                <button
                  className="text-link unplanned-link"
                  onClick={() => navigate('/expectations?view=list')}
                >
                  查看任务列表与未安排任务
                </button>
              </>
            ) : (
              group(
                filter === 'abandoned' ? '已移除的任务' : '我的任务',
                filtered,
                query.trim()
                  ? '没有找到符合搜索条件的任务。'
                  : '这个筛选下还没有任务。',
              )
            )}
          </div>
          <aside
            className="planner-inspector"
            ref={inspector}
            aria-label="任务详情"
          >
            {editor ? (
              <>
                <div className="pane-heading">
                  <h2>{editor === 'new' ? '新建任务' : '编辑任务'}</h2>
                </div>
                {editor === 'new' && (
                  <label className="planner-goal-field">
                    所属主线
                    <select
                      aria-label="新任务所属主线"
                      value={editorGoalId}
                      onChange={(event) => setEditorGoalId(event.target.value)}
                    >
                      {activeGoals.map((goal) => (
                        <option key={goal.id} value={goal.id}>
                          {goal.title}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <TodoEditor
                  key={`${editor}:${selected?.id ?? selectedDay}`}
                  action={
                    editor === 'edit' ? (selected ?? undefined) : undefined
                  }
                  initialDate={
                    view === 'calendar'
                      ? selectedDay
                      : view === 'today'
                        ? today
                        : undefined
                  }
                  saving={saving}
                  onCancel={closeEditor}
                  onSaved={async (input) => {
                    if (!editorGoalId) return;
                    let nextId = selected?.id;
                    const success = await write(async () => {
                      const result =
                        editor === 'new'
                          ? await api.createGoalAction(editorGoalId, input)
                          : await api.updateAction(selected!.id, input);
                      nextId = result.action.id;
                    }, '任务已保存。');
                    if (success) {
                      setSelectedId(nextId ?? null);
                      if (view === 'calendar' && input.scheduledDate) {
                        setSelectedDay(input.scheduledDate);
                        setAnchor(input.scheduledDate);
                      }
                      closeEditor();
                    }
                  }}
                />
              </>
            ) : selected ? (
              <>
                <div className="todo-detail-top">
                  <span className="status-label">
                    {selected.id === currentId
                      ? '现在做这件事'
                      : stateName[selected.status]}
                  </span>
                  <div className="inspector-actions">
                    <button
                      className="icon-control"
                      aria-label="编辑任务"
                      disabled={saving}
                      onClick={() => startEditor('edit')}
                    >
                      <PencilSimpleIcon size={18} />
                    </button>
                    <button
                      className="icon-control"
                      aria-label="关闭任务详情"
                      onClick={() => {
                        setSelectedId(null);
                        setRemoveConfirm(false);
                      }}
                    >
                      <XIcon size={18} />
                    </button>
                  </div>
                </div>
                <h2>{selected.title}</h2>
                <p className="inspector-content">
                  {selected.content || '还没有补充内容。'}
                </p>
                <dl className="inspector-facts">
                  <div>
                    <dt>所属主线</dt>
                    <dd>{goalMap.get(selected.goalId)?.title}</dd>
                  </div>
                  <div>
                    <dt>安排日期</dt>
                    <dd>
                      {selected.scheduledDate
                        ? dayLabel(selected.scheduledDate)
                        : '未安排'}
                    </dd>
                  </div>
                </dl>
                {selected.status === 'blocked' && selected.blockerNote && (
                  <p className="blocker-note">
                    卡住的原因：{selected.blockerNote}
                  </p>
                )}
                {selected.status !== 'superseded' && (
                  <div className="inspector-task-actions">
                    <button
                      className="primary-button"
                      disabled={saving || !canChange}
                      onClick={() =>
                        void changeStatus(
                          selected,
                          selected.status === 'completed' ||
                            selected.status === 'abandoned' ||
                            selected.status === 'blocked'
                            ? 'available'
                            : 'completed',
                        )
                      }
                    >
                      {selected.status === 'completed' ? (
                        <>
                          <ArrowCounterClockwiseIcon size={17} />
                          撤销完成
                        </>
                      ) : selected.status === 'abandoned' ||
                        selected.status === 'blocked' ? (
                        '恢复任务'
                      ) : (
                        <>
                          <CheckCircleIcon size={18} />
                          完成任务
                        </>
                      )}
                    </button>
                    {selected.status === 'available' && (
                      <button
                        className="secondary-button"
                        disabled={
                          saving || !canChange || selected.id === currentId
                        }
                        onClick={() =>
                          void write(
                            () => api.selectCurrent(selected.id),
                            '已设为当前行动。',
                          )
                        }
                      >
                        <TargetIcon size={17} />
                        {selected.id === currentId ? '正在做' : '设为现在要做'}
                      </button>
                    )}
                  </div>
                )}
                {!canChange && (
                  <p className="planner-hint">
                    所属主线已暂停或结束，先恢复主线即可继续处理。
                  </p>
                )}
                {selected.status !== 'abandoned' &&
                  selected.status !== 'superseded' &&
                  !removeConfirm && (
                    <button
                      className="text-link inspector-remove"
                      disabled={saving}
                      onClick={() => setRemoveConfirm(true)}
                    >
                      <ArchiveIcon size={16} />
                      移除任务
                    </button>
                  )}
                {removeConfirm && (
                  <div
                    className="remove-confirm"
                    role="group"
                    aria-label="确认移除任务"
                  >
                    <p>移除「{selected.title}」？之后可在“已移除”中恢复。</p>
                    <button
                      className="danger-button"
                      disabled={saving}
                      onClick={async () => {
                        if (await changeStatus(selected, 'abandoned', true)) {
                          setRemoveConfirm(false);
                          setSelectedId(null);
                        }
                      }}
                    >
                      确认移除
                    </button>
                    <button
                      className="secondary-button"
                      disabled={saving}
                      onClick={() => setRemoveConfirm(false)}
                    >
                      取消
                    </button>
                  </div>
                )}
              </>
            ) : view === 'calendar' ? (
              <>
                <p className="eyebrow">SELECTED DAY</p>
                <h2>{dayLabel(selectedDay)}</h2>
                <p className="planner-hint">
                  {civilDate(selectedDay).toLocaleDateString('zh-CN', {
                    weekday: 'long',
                  })}{' '}
                  · {onDay.length} 条任务
                </p>
                {onDay.length ? (
                  <ul className="planner-list compact">{onDay.map(row)}</ul>
                ) : (
                  <p className="planner-empty">
                    这一天还没有任务，留一点空间也很好。
                  </p>
                )}
                <button
                  className="secondary-button"
                  disabled={!activeGoals.length || saving}
                  onClick={() => startEditor('new')}
                >
                  <PlusIcon size={17} />
                  在这天新建任务
                </button>
              </>
            ) : (
              <div className="planner-detail-empty">
                <CalendarBlankIcon size={34} weight="thin" />
                <h2>留意眼前的一件事。</h2>
                <p>选择任务，查看内容、安排日期或调整状态。</p>
                <small>
                  未完成{' '}
                  {
                    todos.filter(
                      (todo) =>
                        todo.status === 'available' ||
                        todo.status === 'blocked',
                    ).length
                  }{' '}
                  · 已完成{' '}
                  {todos.filter((todo) => todo.status === 'completed').length}
                </small>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function message(reason: unknown): string {
  return reason instanceof Error ? reason.message : '操作未成功，请重试。';
}
