import { useEffect, useRef, useState, type FormEvent } from 'react';
import { SparkleIcon } from '@phosphor-icons/react';
import { ai, aiAvailable } from './api.js';
import { DEFAULT_AI, type AiSettings } from '../../../shared/ai.js';

export function AiSettingsPanel() {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [baseUrl, setBaseUrl] = useState(DEFAULT_AI.baseUrl);
  const [model, setModel] = useState(DEFAULT_AI.model);
  const [key, setKey] = useState('');
  const [persist, setPersist] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const live = useRef(true);
  const requestId = useRef<string | null>(null);
  const available = aiAvailable();
  const dirty = Boolean(settings && (baseUrl !== settings.baseUrl || model !== settings.model || key ||
    persist !== (settings.storage === 'encrypted' || (settings.storage === 'none' && settings.canPersistKey))));
  const busy = saving || testing || loading;
  function fill(value: AiSettings) {
    setSettings(value); setBaseUrl(value.baseUrl); setModel(value.model); setKey('');
    setPersist(value.storage === 'encrypted' || (value.storage === 'none' && value.canPersistKey));
    setRemoveConfirm(false);
  }
  async function reload() {
    setLoading(true); setError('');
    try { const value = await ai<AiSettings>({ kind: 'settings' }); if (live.current) fill(value); }
    catch (reason) { if (live.current) setError(reason instanceof Error ? reason.message : '配置未能读取。'); }
    finally { if (live.current) setLoading(false); }
  }
  useEffect(() => {
    live.current = true;
    if (available) void reload(); else setLoading(false);
    return () => {
      live.current = false;
      if (requestId.current) void ai({ kind: 'cancel', requestId: requestId.current }).catch(() => undefined);
      requestId.current = null;
    };
  }, [available]);
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy || !settings) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const value = await ai<AiSettings>({ kind: 'save-settings', baseUrl, model, apiKey: key,
        persistKey: persist, expectedRevision: settings.revision });
      if (live.current) { fill(value); setNotice(value.storage === 'session' ? '配置已保存；Key 仅在本次运行有效。' : '配置已保存，Key 已由系统加密。'); }
    } catch (reason) { if (live.current) setError(reason instanceof Error ? reason.message : '配置未保存。'); }
    finally { if (live.current) setSaving(false); }
  }
  async function test() {
    if (busy || dirty || !settings?.revision) return;
    const id = crypto.randomUUID(); requestId.current = id;
    setTesting(true); setError(''); setNotice('');
    try {
      await ai({ kind: 'test', requestId: id, configRevision: settings.revision });
      if (live.current && requestId.current === id) setNotice('连接成功，已保存的模型可响应请求。');
    } catch (reason) {
      if (live.current && requestId.current === id) setError(reason instanceof Error ? reason.message : '连接未成功。');
    } finally {
      if (live.current && requestId.current === id) { requestId.current = null; setTesting(false); }
    }
  }
  async function remove() {
    if (busy || !settings) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const value = await ai<AiSettings>({ kind: 'clear-key', expectedRevision: settings.revision });
      if (live.current) { fill(value); setNotice('Key 已移除，本地任务仍可使用。'); }
    } catch (reason) { if (live.current) setError(reason instanceof Error ? reason.message : 'Key 未移除。'); }
    finally { if (live.current) setSaving(false); }
  }
  return <section className="settings-card ai-settings-card" aria-labelledby="ai-settings-title">
    <div className="settings-icon"><SparkleIcon size={23} /></div>
    <div>
      <h2 id="ai-settings-title">AI 设置</h2>
      <p>使用自己的 API Key，帮助任务拆解。支持 OpenAI Chat Completions 兼容的文本接口。</p>
      {!available ? <p className="ai-info">请在桌面客户端添加 Key。本地预览和 Web 入口保持基础 Todo 功能。</p> : <>
        {loading && <p role="status">正在读取配置…</p>}
        {settings?.warning && <p role="alert" className="form-error">{settings.warning}</p>}
        <form className="ai-settings-form" onSubmit={save}>
          <fieldset disabled={busy || !settings}>
            <label>服务地址（Base URL）<input type="url" required maxLength={2000} value={baseUrl}
              onChange={event => setBaseUrl(event.target.value)} placeholder="https://api.deepseek.com" autoComplete="off" /></label>
            <label>模型名称<input required maxLength={200} value={model} onChange={event => setModel(event.target.value)}
              placeholder="填写服务商提供的模型名" autoComplete="off" /></label>
            <label>API Key<input type="password" maxLength={4096} value={key} onChange={event => setKey(event.target.value)}
              placeholder={settings?.hasApiKey ? '已配置；留空保留，输入新 Key 替换' : '输入自己的 API Key'}
              autoComplete="new-password" spellCheck={false} /></label>
            <label className="ai-check"><input type="checkbox" checked={persist} disabled={!settings?.canPersistKey}
              onChange={event => setPersist(event.target.checked)} />在这台设备安全保存 Key</label>
          </fieldset>
          <p>{settings?.canPersistKey ? '取消勾选则仅本次运行有效。更换服务地址时需要重新输入 Key。'
            : '当前系统安全存储不可用，Key 仅保留到客户端退出。'} Key 不包含在任务备份中。</p>
          <div className="ai-actions">
            <button className="primary-button" disabled={busy || !settings}>{saving ? '正在保存…' : '保存 AI 配置'}</button>
            <button type="button" className="secondary-button" disabled={busy || dirty || !settings?.hasApiKey}
              onClick={() => void test()}>测试连接</button>
            {testing && <button type="button" className="text-button" onClick={() => {
              const id = requestId.current; requestId.current = null; setTesting(false); setNotice('已取消连接测试。');
              if (id) void ai({ kind: 'cancel', requestId: id }).catch(() => undefined);
            }}>取消测试</button>}
          </div>
        </form>
        <p className="ai-info">测试使用已保存的配置，只发送一条测试消息；生成时发送面板展示的任务内容。是否计费取决于你所选的服务。</p>
        {settings?.hasApiKey && <div className="ai-actions">
          {removeConfirm ? <><span>确认移除这台设备的 Key？</span>
            <button className="danger-button" disabled={busy} onClick={() => void remove()}>确认移除 Key</button>
            <button className="text-button" disabled={busy} onClick={() => setRemoveConfirm(false)}>取消</button></>
            : <button className="text-button" disabled={busy || dirty} onClick={() => setRemoveConfirm(true)}>移除 Key</button>}
        </div>}
        {notice && <p role="status" className="ai-notice">{notice}</p>}
        {error && <><p role="alert" className="form-error">{error}</p>
          <button className="text-button" disabled={busy} onClick={() => void reload()}>重新读取配置</button></>}
      </>}
    </div>
  </section>;
}
