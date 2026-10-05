import { useState } from 'react';
import { CaretDownIcon } from '@phosphor-icons/react';
import type { GoalAction, AvailableMinutes } from './api.js';
const minuteOptions = [
  { value: 5, label: '5 分钟' },
  { value: 15, label: '15 分钟' },
  { value: 30, label: '30 分钟' },
  { value: 60, label: '60 分钟以上' },
];

export function TodoEditor({
  action,
  initialDate,
  onCancel,
  onSaved,
  saving,
}: {
  action?: GoalAction;
  initialDate?: string;
  onCancel: () => void;
  onSaved: (input: {
    title: string;
    content?: string | null;
    scheduledDate?: string | null;
    estimatedMinutes?: AvailableMinutes | null;
    energyRequired?: 'low' | 'medium' | 'high' | null;
  }) => void;
  saving: boolean;
}) {
  const [scheduledDate, setScheduledDate] = useState(
    action ? (action.scheduledDate ?? '') : (initialDate ?? ''),
  );
  const [title, setTitle] = useState(action?.title ?? '');
  const [content, setContent] = useState(action?.content ?? '');
  const [minutes, setMinutes] = useState(
    action?.estimatedMinutes?.toString() ?? '',
  );
  const [energy, setEnergy] = useState(action?.energyRequired ?? '');
  const [optionsOpen, setOptionsOpen] = useState(
    Boolean(action?.estimatedMinutes || action?.energyRequired),
  );
  return (
    <form
      className="todo-editor"
      onSubmit={(event) => {
        event.preventDefault();
        onSaved({
          title,
          scheduledDate: scheduledDate || null,
          content: content || null,
          estimatedMinutes: minutes
            ? (Number(minutes) as AvailableMinutes)
            : null,
          energyRequired: energy ? (energy as 'low' | 'medium' | 'high') : null,
        });
      }}
    >
      <label>
        To-do 标题
        <input
          autoFocus
          disabled={saving}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={200}
          required
        />
      </label>
      <label>
        <span className="editor-field-label">内容 <small>可选</small></span>
        <textarea
          disabled={saving}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          maxLength={2000}
          placeholder="写下具体怎么做、要注意什么…"
        />
      </label>
      <label>
        <span className="editor-field-label">安排日期 <small>可选</small></span>
        <div className="date-input-row">
          <input
            type="date"
            name="scheduledDate"
            aria-label="安排日期"
            disabled={saving}
            value={scheduledDate}
            min="1900-01-01"
            max="9999-12-31"
            onChange={(event) => setScheduledDate(event.target.value)}
            onInput={(event) => setScheduledDate(event.currentTarget.value)}
          />
          {scheduledDate && (
            <button
              type="button"
              className="text-link"
              disabled={saving}
              onClick={() => setScheduledDate('')}
            >
              清除日期
            </button>
          )}
        </div>
      </label>
      <details
        className="editor-options"
        open={optionsOpen}
        onToggle={(event) => setOptionsOpen(event.currentTarget.open)}
      >
        <summary
          aria-disabled={saving || undefined}
          tabIndex={saving ? -1 : 0}
          onClick={(event) => {
            if (saving) event.preventDefault();
          }}
          onKeyDown={(event) => {
            if (saving && (event.key === 'Enter' || event.key === ' '))
              event.preventDefault();
          }}
        >
          更多选项 <CaretDownIcon size={13} aria-hidden="true" />
        </summary>
        <div className="todo-meta-fields">
          <label>
            预计时长
            <select
              disabled={saving}
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
            >
              <option value="">未设置</option>
              {minuteOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            精力要求
            <select
              disabled={saving}
              value={energy}
              onChange={(event) => setEnergy(event.target.value)}
            >
              <option value="">未设置</option>
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
            </select>
          </label>
        </div>
      </details>
      <div className="editor-actions">
        <button className="primary-button" disabled={saving}>
          {action ? '保存 To-do' : '加入主线'}
        </button>
        <button
          type="button"
          className="text-button"
          disabled={saving}
          onClick={onCancel}
        >
          取消
        </button>
      </div>
    </form>
  );
}
