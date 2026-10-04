import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { SparkleIcon, XIcon, CheckCircleIcon } from '@phosphor-icons/react';
import { ai, aiAvailable, dataChanged } from './api.js';
import { splitStepsSchema, type AiSettings, type SplitSource, type AiPreview, type SplitStep, type SplitResult } from '../../../shared/ai.js';

const OpenAiTask = createContext<(id: string) => void>(() => undefined);
export function AiWorkspace({ children }: { children: ReactNode }) {
  const [actionId, setActionId] = useState<string | null>(null);
  return <OpenAiTask.Provider value={setActionId}>
    <div className="ai-workspace-base" inert={Boolean(actionId)}>{children}</div>
    {actionId && <AiTaskDialog key={actionId} actionId={actionId} onClose={() => setActionId(null)} />}
  </OpenAiTask.Provider>;
}
export function AiSplitButton({ actionId, disabled = false }: { actionId: string; disabled?: boolean }) {
  const open = useContext(OpenAiTask);
  if (!aiAvailable()) return null;
  return <button className="secondary-button ai-task-button" disabled={disabled} onClick={() => open(actionId)}>
    <SparkleIcon size={17} />AI 拆解</button>;
}

export function AiTaskDialog({ actionId, onClose }: { actionId: string; onClose: () => void }) {
  const navigate = useNavigate();
  const [source, setSource] = useState<SplitSource | null>(null);
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [instruction, setInstruction] = useState('');
  const [preview, setPreview] = useState<AiPreview | null>(null);
  const [steps, setSteps] = useState<Array<SplitStep & { selected: boolean }>>([]);
  const [result, setResult] = useState<SplitResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const dialog = useRef<HTMLElement>(null);
  const requestId = useRef<string | null>(null);
  const alive = useRef(true);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const writingRef = useRef(false); writingRef.current = writing;
  function cancel() {
    const id = requestId.current; requestId.current = null;
    setGenerating(false); setNotice('已取消，任务没有改变。');
    if (id) void ai({ kind: 'cancel', requestId: id }).catch(() => undefined);
  }
  function close() { if (!writingRef.current) { cancel(); closeRef.current(); } }
  async function reload() {
    setLoading(true); setError('');
    try {
      const [nextSource, nextSettings] = await Promise.all([ai<SplitSource>({ kind: 'source', actionId }), ai<AiSettings>({ kind: 'settings' })]);
      if (alive.current) { setSource(nextSource); setSettings(nextSettings); setPreview(null); setSteps([]); }
    } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : '任务未能读取。'); }
    finally { if (alive.current) setLoading(false); }
  }
  useEffect(() => {
    alive.current = true; void reload();
    const previous = document.activeElement as HTMLElement | null;
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); event.stopPropagation(); }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
      if (event.key === 'Tab') {
        const all = [...dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href], summary') ?? []];
        const first = all[0], last = all.at(-1);
        if (!dialog.current?.contains(document.activeElement)) { event.preventDefault(); first?.focus(); }
        else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', handler);
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      alive.current = false;
      const id = requestId.current; requestId.current = null;
      if (id) void ai({ kind: 'cancel', requestId: id }).catch(() => undefined);
      document.removeEventListener('keydown', handler);
      if (previous?.isConnected) previous.focus();
      else document.querySelector<HTMLButtonElement>('.workspace-main button')?.focus();
    };
  }, [actionId]);
  async function generate() {
    if (generating || writing || !source || !settings?.revision) return;
    const id = crypto.randomUUID(); requestId.current = id;
    setGenerating(true); setError(''); setNotice('');
    try {
      const next = await ai<AiPreview>({ kind: 'generate', requestId: id, actionId,
        sourceRevision: source.revision, configRevision: settings.revision, instruction });
      if (alive.current && requestId.current === id) { setPreview(next); setSteps(next.steps.map(step => ({ ...step, selected: true }))); }
    } catch (reason) {
      if (alive.current && requestId.current === id) setError(reason instanceof Error ? reason.message : '建议未能生成。');
    } finally {
      if (alive.current && requestId.current === id) { requestId.current = null; setGenerating(false); }
    }
  }
  async function apply() {
    if (writing || generating || loading || !preview) return;
    const parsed = splitStepsSchema.safeParse(steps.filter(step => step.selected).map(({ title, content }) => ({ title, content })));
    if (!parsed.success) { setError('请选择至少一个步骤，并检查标题和内容长度。'); return; }
    setWriting(true); writingRef.current = true; setError('');
    try {
      const value = await ai<SplitResult>({ kind: 'apply', previewId: preview.previewId, steps: parsed.data });
      if (alive.current) { setResult(value); dataChanged(); }
    } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : '步骤未能应用。'); }
    finally { if (alive.current) { writingRef.current = false; setWriting(false); } }
  }
  async function undo() {
    if (writing || !result) return;
    setWriting(true); writingRef.current = true; setError('');
    try {
      const value = await ai<SplitResult>({ kind: 'undo', operationId: result.operationId });
      if (alive.current) { setResult(value); dataChanged(); }
    } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : '未能撤销。'); }
    finally { if (alive.current) { writingRef.current = false; setWriting(false); } }
  }
  return <div className="ai-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <section className="ai-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="ai-task-title">
      <header className="ai-dialog-header"><h2 id="ai-task-title">AI 拆解任务</h2>
        <button className="icon-control" aria-label="关闭 AI 拆解" disabled={writing} onClick={close}><XIcon size={20} /></button></header>
      <div className="ai-dialog-body">
        {loading && <p role="status">正在读取任务和配置…</p>}
        {source && <div className="ai-source"><strong>{source.action.title}</strong>
          <details><summary>将发送的任务与主线上下文</summary>
            <p>{source.action.content || '未填写任务内容'}</p>
            {source.action.blockerNote && <p>卡住原因：{source.action.blockerNote}</p>}
            <p>主线：{source.goal.title}</p><p>完成标准：{source.goal.doneDefinition || '未填写'}</p>
          </details></div>}
        {settings && !result && <p className="ai-info ai-destination">发送到 {settings.baseUrl} · {settings.model}。仅发送上方任务、主线上下文和你补充的要求。</p>}
        {settings?.warning && <p className="form-error">{settings.warning}</p>}
        {!loading && settings && !settings.hasApiKey && !result && <div className="ai-empty">
          <p>先添加自己的 API Key，即可请求任务拆解。</p><button className="secondary-button" onClick={() => { close(); navigate('/settings'); }}>前往 AI 设置</button></div>}
        {source && settings?.hasApiKey && !result && <>
          <label>补充要求（可选）<textarea maxLength={1000} value={instruction} disabled={generating || writing}
            onChange={event => setInstruction(event.target.value)} placeholder="例如：每一步适合用 15 分钟开始，先做出最小可运行版本" /></label>
          <div className="ai-actions"><button className="secondary-button" disabled={generating || writing || loading} onClick={() => void generate()}>
            <SparkleIcon size={17} />{generating ? '正在生成…' : preview ? '重新生成建议' : '生成拆解建议'}</button>
            {generating && <button className="text-button" onClick={cancel}>取消生成</button>}</div>
          {preview && <p className="ai-info">建议可编辑和选择；重新生成会替换当前建议。应用前任务不会改变。</p>}
        </>}
        {!result && preview && <div className="ai-step-list" aria-label="拆解建议">
          {steps.map((step, index) => <div className="ai-step" key={index}>
            <label className="ai-check"><input type="checkbox" checked={step.selected} disabled={generating || writing}
              onChange={event => setSteps(current => current.map((item, i) => i === index ? { ...item, selected: event.target.checked } : item))} />选择步骤 {index + 1}</label>
            <label>步骤 {index + 1} 标题<input maxLength={200} value={step.title} disabled={generating || writing}
              onChange={event => setSteps(current => current.map((item, i) => i === index ? { ...item, title: event.target.value } : item))} /></label>
            <label>步骤 {index + 1} 内容<textarea maxLength={2000} value={step.content ?? ''} disabled={generating || writing}
              onChange={event => setSteps(current => current.map((item, i) => i === index ? { ...item, content: event.target.value } : item))} /></label>
          </div>)}
        </div>}
        {result && <div className="ai-result" role="status"><CheckCircleIcon size={24} />
          <h3>{result.undone ? '已撤销本次拆解' : `已加入 ${result.actions.length} 个步骤`}</h3>
          <p>{result.undone ? '原任务已恢复，新步骤已移除。' : '原任务保留为已拆分，新步骤沿用原安排日期；你可以选择下一步开始。'}</p>
          {!result.undone && <ol>{result.actions.map(action => <li key={action.id}>{action.title}</li>)}</ol>}
        </div>}
        {notice && <p role="status" className="ai-notice">{notice}</p>}
        {error && <><p role="alert" className="form-error">{error}</p>
          {!result && <button className="text-button" disabled={generating || writing || loading} onClick={() => void reload()}>重新读取任务和配置</button>}</>}
      </div>
      <footer className="ai-dialog-footer">
        {!result && preview ? <><p>应用所选步骤会替换原任务，可在此面板撤销。</p>
          <button className="primary-button" disabled={writing || generating || loading || !steps.some(step => step.selected)} onClick={() => void apply()}>
            {writing ? '正在应用…' : '应用所选步骤'}</button></>
          : result && !result.undone ? <><button className="secondary-button" disabled={writing} onClick={() => void undo()}>{writing ? '正在撤销…' : '撤销本次拆解'}</button>
            <button className="primary-button" disabled={writing} onClick={close}>完成</button></>
            : <button className="secondary-button" disabled={writing} onClick={close}>关闭</button>}
      </footer>
    </section>
  </div>;
}
