import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import {
  ArchiveIcon,
  ArrowRightIcon,
  BookOpenTextIcon,
  CaretDownIcon,
  CheckCircleIcon,
  CheckIcon,
  CircleNotchIcon,
  DotsThreeIcon,
  GearSixIcon,
  GraphIcon,
  ListBulletsIcon,
  PencilSimpleIcon,
  PlusIcon,
  TargetIcon,
  UserCircleIcon,
  XIcon
} from '@phosphor-icons/react';
import {
  api,
  ApiError,
  type AvailableMinutes,
  type GoalAction,
  type GoalStatus,
  type KnowledgeItem,
  type KnowledgeStatus,
  type Mainline,
  type Profile,
  type ProfileGraphNode,
  type User
} from './api.js';

const minuteOptions: Array<{ value: AvailableMinutes; label: string }> = [
  { value: 5, label: '5 分钟' },
  { value: 15, label: '15 分钟' },
  { value: 30, label: '30 分钟' },
  { value: 60, label: '60 分钟以上' }
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api.me().then(({ user: current }) => setUser(current)).catch(() => setUser(null)).finally(() => setReady(true));
  }, []);

  if (!ready) return <div className="loading-screen"><CircleNotchIcon size={22} className="spin" weight="bold" /><span>正在连接 LifeKernelOS</span></div>;

  return <>
    <RouteFavicon />
    <Routes>
      <Route path="/" element={<Home user={user} />} />
      <Route path="/login" element={user ? <Navigate to="/expectations" replace /> : <Login onAuthenticated={setUser} />} />
      <Route path="/expectations" element={user ? <ExpectationsPage user={user} onLogout={() => setUser(null)} /> : <Navigate to="/login" replace />} />
      <Route path="/profile" element={user ? <ProfilePage user={user} onLogout={() => setUser(null)} /> : <Navigate to="/login" replace />} />
      <Route path="/settings" element={user ? <SettingsPage user={user} onLogout={() => setUser(null)} /> : <Navigate to="/login" replace />} />
      <Route path="/workbench" element={<Navigate to="/expectations" replace />} />
      <Route path="/now" element={<Navigate to="/expectations" replace />} />
      <Route path="/goals" element={<Navigate to="/expectations" replace />} />
      <Route path="*" element={<Navigate to={user ? '/expectations' : '/'} replace />} />
    </Routes>
  </>;
}

function RouteFavicon() {
  const { pathname } = useLocation();
  useEffect(() => {
    const current = document.querySelector<HTMLLinkElement>('link[data-lifekernel-favicon]');
    const icon = current?.cloneNode(false) as HTMLLinkElement ?? document.createElement('link');
    icon.rel = 'icon';
    icon.type = 'image/svg+xml';
    icon.dataset.lifekernelFavicon = 'true';
    icon.href = `/brand/favicon.svg?route=${encodeURIComponent(pathname)}`;
    if (current) current.replaceWith(icon);
    else document.head.append(icon);
  }, [pathname]);
  return null;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? 'compact' : ''}`}>
    <img src="/brand/lifekernel-icon.png" alt="LifeKernelOS" />
    {!compact && <span>LifeKernelOS</span>}
  </div>;
}

function Home({ user }: { user: User | null }) {
  const navigate = useNavigate();
  return <main className="home-page">
    <header className="home-header"><Brand /><button className="text-button" onClick={() => navigate(user ? '/expectations' : '/login')}>{user ? '进入系统' : '登录'}</button></header>
    <section className="home-hero">
      <p className="eyebrow">LIFE KERNEL / 0.7</p>
      <h1>把一条主线，<br />推进成看得见的自己。</h1>
      <p>把想做的事情拆成 To-do。现在只做一件，积累会留在你的画像里。</p>
      <button className="primary-button home-cta" onClick={() => navigate(user ? '/expectations' : '/login')}>进入主线 <ArrowRightIcon size={18} weight="bold" /></button>
    </section>
    <section className="home-steps" aria-label="产品流程">
      <div className="home-step"><span>01</span><h2>建立主线</h2><p>一条主线就是一组真正要推进的 To-do。</p></div>
      <div className="home-step"><span>02</span><h2>只做一件事</h2><p>当前 To-do 清楚、可见，并保留它的内容。</p></div>
      <div className="home-step"><span>03</span><h2>形成画像</h2><p>主线、完成和知识沉淀为可追溯图谱。</p></div>
    </section>
  </main>;
}

function Login({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [email, setEmail] = useState('admin@lifekernel.local');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setError('');
    try { onAuthenticated((await api.login(email, password)).user); }
    catch (reason) { setError(messageFor(reason)); }
    finally { setSaving(false); }
  }

  return <main className="login-page"><section className="login-panel"><Brand /><div><p className="eyebrow">WELCOME BACK</p><h1>回到你的主线。</h1><p>登录后，继续推进此刻最重要的一件事。</p></div><form onSubmit={submit}><label>账号<input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label><label>密码<input value={password} type="password" onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>{error && <p className="form-error">{error}</p>}<button className="primary-button full-width" disabled={saving}>{saving ? '正在登录…' : '进入 LifeKernelOS'} <ArrowRightIcon size={18} weight="bold" /></button></form><p className="login-hint">演示账号已预填，可直接进入。</p></section></main>;
}

function WorkspaceShell({ user, onLogout, children }: { user: User; onLogout: () => void; children: ReactNode }) {
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);
  async function logout() { setLoggingOut(true); try { await api.logout(); onLogout(); navigate('/'); } finally { setLoggingOut(false); } }
  return <div className="workspace-shell">
    <aside className="workspace-sidebar"><Brand /><nav className="workspace-nav" aria-label="主导航">
      <NavLink to="/expectations" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><ListBulletsIcon size={19} weight="bold" /><span>主线</span></NavLink>
      <NavLink to="/profile" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><GraphIcon size={19} weight="bold" /><span>我的画像</span></NavLink>
    </nav><div className="sidebar-bottom"><NavLink to="/settings" className={({ isActive }) => `settings-gear ${isActive ? 'active' : ''}`} aria-label="设置"><GearSixIcon size={20} weight="bold" /></NavLink><div className="sidebar-user"><span title={user.email}>{user.email}</span><button className="text-button" onClick={logout} disabled={loggingOut}>{loggingOut ? '退出中' : '退出登录'}</button></div></div></aside>
    <main className="workspace-main">{children}</main>
  </div>;
}

type ResolutionMode = 'split' | 'block' | 'abandon' | null;

function ExpectationsPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [mainlines, setMainlines] = useState<Mainline[]>([]);
  const [actions, setActions] = useState<GoalAction[]>([]);
  const [currentAction, setCurrentAction] = useState<GoalAction | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [showNewGoal, setShowNewGoal] = useState(false);
  const [showNewTodo, setShowNewTodo] = useState(false);
  const [editingTodo, setEditingTodo] = useState(false);
  const [showMainlineTools, setShowMainlineTools] = useState(false);
  const [resolutionMode, setResolutionMode] = useState<ResolutionMode>(null);

  async function load(preferredGoalId?: string | null, preferredActionId?: string | null) {
    setLoading(true); setError('');
    try {
      const [{ goals }, workspace] = await Promise.all([api.goals(), api.current()]);
      setMainlines(goals); setCurrentAction(workspace.currentAction);
      const nextGoalId = preferredGoalId && goals.some((goal) => goal.id === preferredGoalId)
        ? preferredGoalId
        : workspace.currentAction && goals.some((goal) => goal.id === workspace.currentAction?.goalId)
          ? workspace.currentAction.goalId
          : selectedGoalId && goals.some((goal) => goal.id === selectedGoalId)
            ? selectedGoalId
            : goals.find((goal) => goal.status === 'active')?.id ?? goals[0]?.id ?? null;
      setSelectedGoalId(nextGoalId);
      if (preferredActionId) setSelectedActionId(preferredActionId);
      else if (workspace.currentAction && workspace.currentAction.goalId === nextGoalId) setSelectedActionId(workspace.currentAction.id);
    } catch (reason) { setError(messageFor(reason)); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!selectedGoalId) { setActions([]); return; }
    api.goalActions(selectedGoalId).then(({ actions: next }) => {
      setActions(next);
      setSelectedActionId((current) => {
        if (current && next.some((action) => action.id === current)) return current;
        if (currentAction?.goalId === selectedGoalId && next.some((action) => action.id === currentAction.id)) return currentAction.id;
        return next.find((action) => action.status === 'available')?.id ?? next[0]?.id ?? null;
      });
    }).catch((reason) => setError(messageFor(reason)));
  }, [selectedGoalId, currentAction?.id]);

  const mainline = mainlines.find((goal) => goal.id === selectedGoalId) ?? null;
  const selectedAction = actions.find((action) => action.id === selectedActionId) ?? null;

  async function selectCurrent(action: GoalAction) {
    setSaving(true); setError('');
    try { await api.selectCurrent(action.id); setNotice(`现在只做：${action.title}`); await load(action.goalId, action.id); }
    catch (reason) { setError(messageFor(reason)); }
    finally { setSaving(false); }
  }

  async function completeCurrent() {
    if (!currentAction) return;
    setSaving(true); setError('');
    try { await api.completeCurrent(); setNotice(`已完成「${currentAction.title}」，主线进度已更新。`); setResolutionMode(null); await load(currentAction.goalId); }
    catch (reason) { setError(messageFor(reason)); }
    finally { setSaving(false); }
  }

  async function resolveCurrent(mode: Exclude<ResolutionMode, null>, value: string) {
    if (!currentAction) return;
    setSaving(true); setError('');
    try {
      if (mode === 'split') await api.splitCurrent({ title: value });
      if (mode === 'block') await api.blockCurrent(value);
      if (mode === 'abandon') await api.abandonCurrent(value);
      setNotice(mode === 'split' ? '已拆成一条更小的 To-do。' : mode === 'block' ? '已标记为卡住。' : '已放弃这条 To-do。');
      setResolutionMode(null); await load(currentAction.goalId);
    } catch (reason) { setError(messageFor(reason)); }
    finally { setSaving(false); }
  }

  return <WorkspaceShell user={user} onLogout={onLogout}><div className="mainline-page">
    {loading ? <InlineLoading /> : !mainline ? <FirstMainline onCreated={(id) => { setShowNewGoal(false); void load(id); }} /> : <>
      <header className="mainline-topbar"><label className="mainline-select-label">当前主线<select value={mainline.id} onChange={(event) => { setSelectedGoalId(event.target.value); setShowMainlineTools(false); setNotice(''); }}><option value={mainline.id}>{mainline.title}</option>{mainlines.filter((goal) => goal.id !== mainline.id).map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}</select><CaretDownIcon size={14} weight="bold" /></label><button className="quiet-action" onClick={() => setShowNewGoal(true)}><PlusIcon size={17} weight="bold" /> 新建主线</button></header>
      {showNewGoal && <MainlineEditor onCancel={() => setShowNewGoal(false)} onSaved={async (title, doneDefinition) => { setSaving(true); try { const { goal } = await api.createGoal({ title, doneDefinition }); setShowNewGoal(false); setNotice('已建立新主线。'); await load(goal.id); } catch (reason) { setError(messageFor(reason)); } finally { setSaving(false); } }} saving={saving} />}
      <section className="mainline-hero" id={`goal-${mainline.id}`}><div className="mainline-hero-copy"><p className="eyebrow">MAINLINE</p><h1>{mainline.title}</h1>{mainline.doneDefinition && <p>{mainline.doneDefinition}</p>}</div><button className="icon-control" onClick={() => setShowMainlineTools((current) => !current)} aria-label="主线设置"><DotsThreeIcon size={22} weight="bold" /></button><ProgressLine progress={mainline.progress.progressPercent} /><div className="progress-copy"><strong>{mainline.progress.completedTodoCount} / {mainline.progress.totalTodoCount}</strong><span>已完成 · {mainline.progress.progressPercent}%</span></div></section>
      {showMainlineTools && <MainlineTools mainline={mainline} saving={saving} onCancel={() => setShowMainlineTools(false)} onSaved={async (input) => { setSaving(true); try { await api.updateGoal(mainline.id, input); setNotice('主线信息已保存。'); setShowMainlineTools(false); await load(mainline.id); } catch (reason) { setError(messageFor(reason)); } finally { setSaving(false); } }} onStatus={async (status) => { setSaving(true); try { await api.changeGoalStatus(mainline.id, status, status === 'completed'); setNotice(status === 'completed' ? '主线已标为完成，进度显示为 100%。' : '主线状态已更新。'); await load(mainline.id); } catch (reason) { setError(messageFor(reason)); } finally { setSaving(false); } }} />}
      {notice && <p className="page-notice"><CheckCircleIcon size={16} weight="fill" /> {notice}</p>}{error && <p className="page-error">{error}</p>}
      <section className="todo-board"><div className="todo-list-pane"><div className="pane-heading"><div><p className="eyebrow">TO-DOS</p><h2>这条主线的步骤</h2></div><button className="icon-control blue" onClick={() => { setShowNewTodo(true); setEditingTodo(false); }} aria-label="新建 To-do"><PlusIcon size={19} weight="bold" /></button></div>
        {showNewTodo && <TodoEditor onCancel={() => setShowNewTodo(false)} saving={saving} onSaved={async (input) => { setSaving(true); try { const { action } = await api.createGoalAction(mainline.id, input); setShowNewTodo(false); setNotice('新的 To-do 已加入主线。'); await load(mainline.id, action.id); } catch (reason) { setError(messageFor(reason)); } finally { setSaving(false); } }} />}
        <ol className="todo-list">{actions.map((action, index) => <TodoRow key={action.id} action={action} index={index + 1} selected={action.id === selectedAction?.id} current={action.id === currentAction?.id} onSelect={() => { setSelectedActionId(action.id); setEditingTodo(false); setResolutionMode(null); }} />)}{actions.length === 0 && <li className="todo-empty">这里还没有 To-do。先写下能开始的一步。</li>}</ol>
      </div><div className="todo-detail-pane">{selectedAction ? <TodoDetail action={selectedAction} mainline={mainline} current={currentAction?.id === selectedAction.id} saving={saving} editing={editingTodo} resolutionMode={resolutionMode} onEdit={() => { setEditingTodo(true); setResolutionMode(null); }} onCancelEdit={() => setEditingTodo(false)} onSave={async (input) => { setSaving(true); try { await api.updateAction(selectedAction.id, input); setEditingTodo(false); setNotice('To-do 已保存。'); await load(mainline.id, selectedAction.id); } catch (reason) { setError(messageFor(reason)); } finally { setSaving(false); } }} onMakeCurrent={() => void selectCurrent(selectedAction)} onComplete={() => void completeCurrent()} onResolve={(mode) => setResolutionMode(mode)} onCancelResolution={() => setResolutionMode(null)} onSubmitResolution={(value) => void resolveCurrent(resolutionMode!, value)} /> : <div className="todo-detail-empty"><TargetIcon size={38} weight="thin" /><h2>选一条 To-do</h2><p>内容、完成标准和下一步操作会显示在这里。</p></div>}</div></section>
    </>}
  </div></WorkspaceShell>;
}

function FirstMainline({ onCreated }: { onCreated: (id: string) => void }) {
  const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  return <section className="first-mainline"><Brand /><p className="eyebrow">FIRST MAINLINE</p><h1>从一条想持续推进的主线开始。</h1><p>它可以是学习、健康、一个作品，或任何你不想轻易放下的方向。</p><MainlineEditor saving={saving} error={error} onCancel={() => undefined} onSaved={async (title, doneDefinition) => { setSaving(true); try { const { goal } = await api.createGoal({ title, doneDefinition }); onCreated(goal.id); } catch (reason) { setError(messageFor(reason)); } finally { setSaving(false); } }} /></section>;
}

function MainlineEditor({ onSaved, onCancel, saving, error = '' }: { onSaved: (title: string, doneDefinition: string) => void; onCancel: () => void; saving: boolean; error?: string }) {
  const [title, setTitle] = useState(''); const [definition, setDefinition] = useState('');
  return <form className="mainline-editor" onSubmit={(event) => { event.preventDefault(); onSaved(title, definition); }}><label>主线名称<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} placeholder="例如：构建持续成长的英语能力" required /></label><label>完成定义 <span>可选</span><input value={definition} onChange={(event) => setDefinition(event.target.value)} maxLength={300} placeholder="例如：能完成一段自然的英文对话" /></label>{error && <p className="form-error">{error}</p>}<div className="editor-actions"><button className="primary-button" disabled={saving}><PlusIcon size={17} weight="bold" /> 建立主线</button><button type="button" className="secondary-button" onClick={onCancel}>取消</button></div></form>;
}

function MainlineTools({ mainline, saving, onCancel, onSaved, onStatus }: { mainline: Mainline; saving: boolean; onCancel: () => void; onSaved: (input: { title: string; doneDefinition: string | null }) => void; onStatus: (status: GoalStatus) => void }) {
  const [title, setTitle] = useState(mainline.title); const [definition, setDefinition] = useState(mainline.doneDefinition ?? '');
  return <section className="mainline-tools"><form onSubmit={(event) => { event.preventDefault(); onSaved({ title, doneDefinition: definition || null }); }}><label>主线名称<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} /></label><label>完成定义<input value={definition} onChange={(event) => setDefinition(event.target.value)} maxLength={300} /></label><div className="editor-actions"><button className="secondary-button" disabled={saving}>保存信息</button><button type="button" className="text-button" onClick={onCancel}>收起</button></div></form><div className="status-actions">{mainline.status === 'active' && <><button onClick={() => onStatus('paused')} disabled={saving}>暂停</button><button onClick={() => onStatus('completed')} disabled={saving}>完成主线</button><button onClick={() => onStatus('abandoned')} disabled={saving}>放弃</button></>}{mainline.status === 'paused' && <><button onClick={() => onStatus('active')} disabled={saving}>恢复</button><button onClick={() => onStatus('abandoned')} disabled={saving}>放弃</button></>}{(mainline.status === 'completed' || mainline.status === 'abandoned') && <button onClick={() => onStatus('active')} disabled={saving}>重新打开</button>}</div></section>;
}

function ProgressLine({ progress }: { progress: number }) { return <div className="progress-line" aria-label={`主线进度 ${progress}%`}><span style={{ width: `${progress}%` }} /></div>; }

function TodoRow({ action, index, selected, current, onSelect }: { action: GoalAction; index: number; selected: boolean; current: boolean; onSelect: () => void }) {
  const statusLabel = action.status === 'completed' ? '已完成' : action.status === 'blocked' ? '已卡住' : action.status === 'abandoned' ? '已放弃' : action.status === 'superseded' ? '已替代' : current ? '现在做' : '待进行';
  return <li className={`todo-row ${selected ? 'selected' : ''} status-${action.status}`}><button onClick={onSelect}><span className="todo-index">{action.status === 'completed' ? <CheckIcon size={16} weight="bold" /> : index}</span><span className="todo-row-copy"><strong>{action.title}</strong><small>{action.content || actionMeta(action)}</small></span><span className="todo-state">{statusLabel}</span></button></li>;
}

function TodoEditor({ action, onCancel, onSaved, saving }: { action?: GoalAction; onCancel: () => void; onSaved: (input: { title: string; content?: string | null; estimatedMinutes?: AvailableMinutes | null; energyRequired?: 'low' | 'medium' | 'high' | null }) => void; saving: boolean }) {
  const [title, setTitle] = useState(action?.title ?? ''); const [content, setContent] = useState(action?.content ?? ''); const [minutes, setMinutes] = useState(action?.estimatedMinutes?.toString() ?? ''); const [energy, setEnergy] = useState(action?.energyRequired ?? '');
  return <form className="todo-editor" onSubmit={(event) => { event.preventDefault(); onSaved({ title, content: content || null, estimatedMinutes: minutes ? Number(minutes) as AvailableMinutes : null, energyRequired: energy ? energy as 'low' | 'medium' | 'high' : null }); }}><label>To-do 标题<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} required /></label><label>内容 <span>可选</span><textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={1000} placeholder="写下具体怎么做、要注意什么…" /></label><div className="todo-meta-fields"><label>预计时长<select value={minutes} onChange={(event) => setMinutes(event.target.value)}><option value="">未设置</option>{minuteOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label>精力要求<select value={energy} onChange={(event) => setEnergy(event.target.value)}><option value="">未设置</option><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label></div><div className="editor-actions"><button className="primary-button" disabled={saving}>{action ? '保存 To-do' : '加入主线'}</button><button type="button" className="secondary-button" onClick={onCancel}>取消</button></div></form>;
}

function TodoDetail({ action, mainline, current, saving, editing, resolutionMode, onEdit, onCancelEdit, onSave, onMakeCurrent, onComplete, onResolve, onCancelResolution, onSubmitResolution }: { action: GoalAction; mainline: Mainline; current: boolean; saving: boolean; editing: boolean; resolutionMode: ResolutionMode; onEdit: () => void; onCancelEdit: () => void; onSave: (input: { title: string; content?: string | null; estimatedMinutes?: AvailableMinutes | null; energyRequired?: 'low' | 'medium' | 'high' | null }) => void; onMakeCurrent: () => void; onComplete: () => void; onResolve: (mode: Exclude<ResolutionMode, null>) => void; onCancelResolution: () => void; onSubmitResolution: (value: string) => void }) {
  if (editing) return <TodoEditor action={action} saving={saving} onCancel={onCancelEdit} onSaved={onSave} />;
  const actionable = action.status === 'available' && mainline.status === 'active';
  return <div className="todo-detail"><div className="todo-detail-top"><span className={`status-label ${current ? 'current' : ''}`}>{current ? '现在做这件事' : action.status === 'completed' ? '已完成' : action.status === 'blocked' ? '已卡住' : action.status === 'abandoned' ? '已放弃' : '主线 To-do'}</span><button className="icon-control" onClick={onEdit} aria-label="编辑 To-do"><PencilSimpleIcon size={18} weight="bold" /></button></div><h2>{action.title}</h2><p className="todo-content">{action.content || '这条 To-do 还没有补充内容。点击右上角编辑，写下具体怎么做。'}</p><div className="detail-rule"><span>所属主线</span><strong>{mainline.title}</strong></div><div className="detail-rule"><span>完成标准</span><strong>{mainline.doneDefinition || '完成这条 To-do 后，再判断主线是否达成。'}</strong></div><div className="detail-meta"><span>{actionMeta(action)}</span><span>{mainline.progress.completedTodoCount} / {mainline.progress.totalTodoCount} 已完成</span></div>{actionable && <div className="todo-primary-action">{current ? <button className="primary-button large" disabled={saving} onClick={onComplete}><CheckCircleIcon size={20} weight="fill" /> 完成这件事</button> : <button className="primary-button large" disabled={saving} onClick={onMakeCurrent}><TargetIcon size={20} weight="bold" /> {current ? '现在做这件事' : '设为现在要做'}</button>}{!current && <p>设为当前 To-do 后，它会成为全局唯一的现在行动。</p>}</div>}{current && <div className="resolution-links"><button onClick={() => onResolve('split')}>拆小</button><button onClick={() => onResolve('block')}>卡住</button><button onClick={() => onResolve('abandon')}>放弃</button></div>}{resolutionMode && <ResolutionEditor mode={resolutionMode} saving={saving} onCancel={onCancelResolution} onSubmit={onSubmitResolution} />}</div>;
}

function ResolutionEditor({ mode, saving, onCancel, onSubmit }: { mode: Exclude<ResolutionMode, null>; saving: boolean; onCancel: () => void; onSubmit: (value: string) => void }) {
  const [value, setValue] = useState(''); const isSplit = mode === 'split';
  return <form className="resolution-editor" onSubmit={(event) => { event.preventDefault(); onSubmit(value); }}><label>{isSplit ? '更小的一步' : mode === 'block' ? '卡住的原因（可选）' : '放弃的原因（可选）'}<textarea value={value} onChange={(event) => setValue(event.target.value)} required={isSplit} maxLength={500} placeholder={isSplit ? '例如：只写首页标题和第一段' : '如实记录即可'} /></label><div className="editor-actions"><button className="secondary-button" disabled={saving}>{isSplit ? '拆成更小一步' : '确认保存'}</button><button type="button" className="text-button" onClick={onCancel}>取消</button></div></form>;
}

function ProfilePage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null); const [currentAction, setCurrentAction] = useState<GoalAction | null>(null);
  const [description, setDescription] = useState(''); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [notice, setNotice] = useState(''); const [error, setError] = useState('');
  const [knowledgeTitle, setKnowledgeTitle] = useState(''); const [knowledgeGoalId, setKnowledgeGoalId] = useState(''); const [knowledgeNote, setKnowledgeNote] = useState('');

  async function load() { setLoading(true); setError(''); try { const [{ profile: next }, workspace] = await Promise.all([api.profile(), api.current()]); setProfile(next); setCurrentAction(workspace.currentAction); setDescription(next.description?.content ?? ''); setKnowledgeGoalId((current) => current || next.goals[0]?.goal.id || ''); } catch (reason) { setError(messageFor(reason)); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, []);
  async function saveDescription() { setSaving(true); try { await api.saveDescription(description); setNotice('“关于我”已保存。'); await load(); } catch (reason) { setError(messageFor(reason)); } finally { setSaving(false); } }
  async function createKnowledge(event: FormEvent) { event.preventDefault(); if (!knowledgeGoalId) return; setSaving(true); try { await api.createKnowledge({ goalId: knowledgeGoalId, title: knowledgeTitle, note: knowledgeNote }); setKnowledgeTitle(''); setKnowledgeNote(''); setNotice('知识已加入画像。'); await load(); } catch (reason) { setError(messageFor(reason)); } finally { setSaving(false); } }
  async function updateKnowledge(item: KnowledgeItem, status: KnowledgeStatus) { setSaving(true); try { await api.updateKnowledge(item.id, { status }); await load(); } catch (reason) { setError(messageFor(reason)); } finally { setSaving(false); } }
  async function deleteKnowledge(item: KnowledgeItem) { setSaving(true); try { await api.deleteKnowledge(item.id); setNotice('知识已移出画像。'); await load(); } catch (reason) { setError(messageFor(reason)); } finally { setSaving(false); } }

  return <WorkspaceShell user={user} onLogout={onLogout}><div className="profile-page"><header className="profile-page-head"><p className="eyebrow">MY PROFILE</p><h1>我的画像</h1><p>每条主线、完成的 To-do 和知识，正在组成真实而可追溯的积累。</p></header>{loading || !profile ? <InlineLoading /> : <>{error && <p className="page-error">{error}</p>}{notice && <p className="page-notice"><CheckCircleIcon size={16} weight="fill" /> {notice}</p>}<section className="profile-graph-stage">{profile.factSummary.goalCount === 0 ? <div className="profile-graph-empty"><GraphIcon size={42} weight="thin" /><h2>画像会从第一条主线开始形成。</h2><p>建立主线、完成 To-do 或记录知识后，它们的关系会出现在这里。</p><button className="primary-button" onClick={() => navigate('/expectations')}>去建立主线 <ArrowRightIcon size={17} weight="bold" /></button></div> : <ProfileGraph profile={profile} onOpen={(node) => { if (node.type === 'goal') navigate(`/expectations#goal-${node.sourceId}`); if (node.type === 'knowledge') document.getElementById(`knowledge-${node.sourceId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }} />}</section><section className="profile-underlay"><article className="about-card"><p className="eyebrow">ABOUT ME</p><h2>关于我</h2><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} placeholder="写下你想如何理解自己，或暂时留白。" /><button className="secondary-button" onClick={saveDescription} disabled={saving}>保存描述</button></article><article className="current-profile-card"><p className="eyebrow">CURRENT TO-DO</p><h2>{currentAction?.title ?? '暂时没有当前 To-do'}</h2><p>{currentAction?.content || (currentAction ? '这条 To-do 还没有补充内容。' : '回到主线页，从一个可执行的 To-do 开始。')}</p><button className="text-link" onClick={() => navigate('/expectations')}>{currentAction ? '打开当前 To-do' : '去主线页'} <ArrowRightIcon size={16} weight="bold" /></button></article></section><section className="knowledge-section"><div className="section-heading"><div><p className="eyebrow">KNOWLEDGE</p><h2>从主线中沉淀的知识</h2></div><p>知识始终连接它产生的主线，而不是脱离语境的标签。</p></div><div className="knowledge-list">{profile.knowledgeItems.map((item) => <KnowledgeCard key={item.id} item={item} saving={saving} onStatus={(status) => void updateKnowledge(item, status)} onDelete={() => void deleteKnowledge(item)} />)}{profile.knowledgeItems.length === 0 && <p className="knowledge-empty">还没有知识记录。完成一次真实行动后，记录下它留下的认识。</p>}</div><form className="knowledge-create" onSubmit={createKnowledge}><label>知识标题<input value={knowledgeTitle} onChange={(event) => setKnowledgeTitle(event.target.value)} maxLength={80} required placeholder="例如：用户访谈的基本方法" /></label><label>来源主线<select value={knowledgeGoalId} onChange={(event) => setKnowledgeGoalId(event.target.value)} required><option value="">选择主线</option>{profile.goals.map(({ goal }) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}</select></label><label>补充说明<input value={knowledgeNote} onChange={(event) => setKnowledgeNote(event.target.value)} maxLength={300} placeholder="可选" /></label><button className="secondary-button" disabled={saving}><PlusIcon size={17} weight="bold" /> 记录知识</button></form></section><ProfileExperiences profile={profile} saving={saving} onSaved={async (goalId, summary) => { setSaving(true); try { await api.saveReflection(goalId, summary); setNotice('经历总结已保存。'); await load(); } catch (reason) { setError(messageFor(reason)); } finally { setSaving(false); } }} /></>}</div></WorkspaceShell>;
}

type FlowData = { source: ProfileGraphNode };

function ProfileFlowNode({ data }: NodeProps) {
  const source = (data as unknown as FlowData).source;
  const icon = source.type === 'self' ? <UserCircleIcon size={32} weight="regular" /> : source.type === 'goal' ? <TargetIcon size={23} weight="bold" /> : source.status === 'consolidated' ? <CheckCircleIcon size={19} weight="fill" /> : <BookOpenTextIcon size={19} weight="bold" />;
  return <div className={`profile-flow-node profile-flow-${source.type}`}><Handle type="target" position={Position.Left} /><div className="flow-node-icon">{icon}</div><div className="flow-node-copy"><span>{source.type === 'self' ? 'SELF' : source.type === 'goal' ? 'MAINLINE' : 'KNOWLEDGE'}</span><strong>{source.title}</strong><small>{source.subtitle}</small>{source.type === 'goal' && source.progress && <ProgressLine progress={source.progress.progressPercent} />}</div><Handle type="source" position={Position.Right} /></div>;
}

const profileNodeTypes = { profile: ProfileFlowNode };

function ProfileGraph({ profile, onOpen }: { profile: Profile; onOpen: (node: ProfileGraphNode) => void }) {
  const flow = useMemo(() => buildProfileFlow(profile), [profile]);
  return <ReactFlow nodes={flow.nodes} edges={flow.edges} nodeTypes={profileNodeTypes} onNodeClick={(_, node) => onOpen((node.data as FlowData).source)} fitView fitViewOptions={{ padding: 0.06 }} minZoom={0.38} maxZoom={1.4} nodesDraggable={false} nodesConnectable={false} deleteKeyCode={null}><Background gap={26} size={1} color="#d8e0ec" /><Controls showInteractive={false} /></ReactFlow>;
}

function buildProfileFlow(profile: Profile): { nodes: Node[]; edges: Edge[] } {
  const sourceNodes = profile.graph.nodes; const self = sourceNodes.find((node) => node.type === 'self'); const goals = sourceNodes.filter((node) => node.type === 'goal'); const knowledge = sourceNodes.filter((node) => node.type === 'knowledge');
  if (!self) return { nodes: [], edges: [] };
  const goalOffsets = [{ x: 230, y: 120 }, { x: 1010, y: 120 }, { x: 620, y: 500 }, { x: 230, y: 500 }, { x: 1010, y: 500 }];
  const goalPositions = new Map<string, { x: number; y: number }>();
  goals.forEach((goal, index) => goalPositions.set(goal.id, goalOffsets[index % goalOffsets.length]));
  const nodes: Node[] = [{ id: self.id, type: 'profile', position: { x: 640, y: 285 }, data: { source: self } }];
  goals.forEach((goal) => nodes.push({ id: goal.id, type: 'profile', position: goalPositions.get(goal.id) ?? { x: 230, y: 120 }, data: { source: goal } }));
  const edgeByKnowledge = new Map(profile.graph.edges.filter((edge) => edge.relation === 'develops_knowledge').map((edge) => [edge.target, edge]));
  const knowledgeCounts = new Map<string, number>();
  knowledge.forEach((item) => { const edge = edgeByKnowledge.get(item.id); if (!edge) return; const count = knowledgeCounts.get(edge.source) ?? 0; knowledgeCounts.set(edge.source, count + 1); const goalPosition = goalPositions.get(edge.source) ?? { x: 620, y: 500 }; const leftSide = goalPosition.x < 500; const rightSide = goalPosition.x > 800; const position = leftSide ? { x: 20, y: goalPosition.y + count * 102 } : rightSide ? { x: 1290, y: goalPosition.y + count * 102 } : { x: 540 + count * 205, y: 690 }; nodes.push({ id: item.id, type: 'profile', position, data: { source: item } }); });
  const edges: Edge[] = profile.graph.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, type: 'smoothstep', animated: false, markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 }, style: { stroke: edge.relation === 'pursues' ? '#1976f3' : '#83a9e8', strokeWidth: edge.relation === 'pursues' ? 1.8 : 1.2 } }));
  return { nodes, edges };
}

function KnowledgeCard({ item, saving, onStatus, onDelete }: { item: KnowledgeItem; saving: boolean; onStatus: (status: KnowledgeStatus) => void; onDelete: () => void }) {
  return <article id={`knowledge-${item.id}`} className={`knowledge-card knowledge-${item.status}`}><div><span className="knowledge-icon">{item.status === 'consolidated' ? <CheckCircleIcon size={18} weight="fill" /> : <BookOpenTextIcon size={18} weight="bold" />}</span><h3>{item.title}</h3></div>{item.note && <p>{item.note}</p>}<footer><select value={item.status} onChange={(event) => onStatus(event.target.value as KnowledgeStatus)} disabled={saving} aria-label={`${item.title} 的状态`}><option value="in_progress">正在形成</option><option value="needs_consolidation">待沉淀</option><option value="consolidated">已沉淀</option></select><button className="icon-control" onClick={onDelete} disabled={saving} aria-label={`删除 ${item.title}`}><XIcon size={16} weight="bold" /></button></footer></article>;
}

function ProfileExperiences({ profile, saving, onSaved }: { profile: Profile; saving: boolean; onSaved: (goalId: string, summary: string) => void }) {
  if (!profile.experiences.length) return null;
  return <section className="experience-section"><div className="section-heading"><div><p className="eyebrow">EXPERIENCE</p><h2>已经完成的主线</h2></div><p>把你的感受和经验留在事实旁边。</p></div><div className="experience-list">{profile.experiences.map(({ goal, progress, reflection }) => <ExperienceCard key={goal.id} title={goal.title} progress={progress.progressPercent} summary={reflection?.summary ?? ''} saving={saving} onSave={(summary) => onSaved(goal.id, summary)} />)}</div></section>;
}

function ExperienceCard({ title, progress, summary, saving, onSave }: { title: string; progress: number; summary: string; saving: boolean; onSave: (summary: string) => void }) {
  const [value, setValue] = useState(summary);
  useEffect(() => setValue(summary), [summary]);
  return <article className="experience-card"><span className="status-label completed">已完成 · {progress}%</span><h3>{title}</h3><textarea value={value} onChange={(event) => setValue(event.target.value)} maxLength={500} placeholder="这条主线带给你的经历或认识…" /><button className="secondary-button" onClick={() => onSave(value)} disabled={saving}>保存总结</button></article>;
}

function SettingsPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [saving, setSaving] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  async function exportData() { setSaving(true); setError(''); try { const { blob, filename } = await api.exportData(); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url); setMessage('数据已开始下载。'); } catch (reason) { setError(messageFor(reason)); } finally { setSaving(false); } }
  return <WorkspaceShell user={user} onLogout={onLogout}><div className="settings-page"><p className="eyebrow">SETTINGS</p><h1>设置</h1><p>账号和数据由你掌控。</p>{message && <p className="page-notice"><CheckCircleIcon size={16} weight="fill" /> {message}</p>}{error && <p className="page-error">{error}</p>}<section className="settings-card"><div><p className="eyebrow">YOUR DATA</p><h2>导出全部记录</h2><p>下载包含主线、To-do、画像文字和知识的 JSON 文件。</p></div><button className="secondary-button" onClick={exportData} disabled={saving}><ArchiveIcon size={18} weight="bold" /> {saving ? '正在准备…' : '下载 JSON'}</button></section></div></WorkspaceShell>;
}

function InlineLoading() { return <div className="inline-loading"><CircleNotchIcon size={22} className="spin" weight="bold" /> 正在读取你的记录…</div>; }
function actionMeta(action: GoalAction): string { const time = action.estimatedMinutes ? action.estimatedMinutes === 60 ? '60 分钟以上' : `${action.estimatedMinutes} 分钟` : '时长未设置'; const energy = action.energyRequired ? action.energyRequired === 'low' ? '低精力' : action.energyRequired === 'medium' ? '中精力' : '高精力' : '精力未设置'; return `${time} · ${energy}`; }
function messageFor(reason: unknown): string { return reason instanceof ApiError ? reason.message : '服务暂时不可用，请稍后再试。'; }
