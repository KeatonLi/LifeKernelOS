# SPEC-0005 快速捕捉

> 状态：Proposed
> 对应 PRD：MVP 场景五
> 依赖：`SPEC-0001`、`SPEC-0008`
> 目标：让用户在 10 秒内记录临时想法或任务，不打断当前行动。

## 1. 用户目标

用户想到任务、事件或灵感时，只写一句话先保存；稍后再决定它是行动、想法还是应该删除的内容。

## 2. 范围

### In scope

- 全局入口快速创建一条 Capture。
- 只填写一句话即可保存。
- 可选填写类型：想法、任务、事件、感受、灵感。
- 查看收件箱列表。
- 将 Capture 转为当前主线下的 Action。
- 归档或删除 Capture。
- 刷新后恢复收件箱数据。

### Out of scope

- 捕捉时强制关联主线、行动、价值观或标签。
- AI 自动分类或自动改写。
- 多级收件箱、搜索和批量整理。

## 3. 数据

```text
Capture {
  id: UUID
  content: string                 // 去首尾空白后 1—2000 字符
  type?: idea | task | event | feeling | inspiration
  status: inbox | converted | archived
  convertedActionId?: UUID
  createdAt: ISODateTime
  updatedAt: ISODateTime
}
```

Capture 独立于 Action；转换成功后保留 Capture 作为记录，并保存生成的 `convertedActionId`。

## 4. 用例契约

```typescript
createCapture(input: {
  content: string;
  type?: Capture['type'];
}): Promise<Capture>;
listInboxCaptures(): Promise<Capture[]>;
updateCaptureType(captureId: string, type?: Capture['type']): Promise<Capture>;
convertCaptureToAction(input: {
  captureId: string;
  focusId: string;
  title: string;
  estimatedMinutes: number;
  energyRequired: 'low' | 'medium' | 'high';
}): Promise<{ capture: Capture; action: Action }>;
archiveCapture(captureId: string): Promise<Capture>;
deleteCapture(captureId: string): Promise<void>;
```

## 5. 验收场景

### 场景 A：快速保存

```gherkin
Given 用户打开快速捕捉入口
When 用户输入一句话并提交
Then 系统立即创建一条 inbox Capture
And 页面给出保存成功反馈
```

### 场景 B：空内容被拒绝

```gherkin
Given 用户打开快速捕捉入口
When 用户没有输入内容或只输入空白
Then 系统不创建 Capture
And 页面提示请输入内容
```

### 场景 C：稍后补充类型

```gherkin
Given 收件箱中存在一条 Capture
When 用户为它选择“任务”类型
Then 系统更新 Capture 类型
And Capture 仍保留在 inbox
```

### 场景 D：转为行动

```gherkin
Given 收件箱中存在一条 Capture 且存在 active Focus
When 用户补充耗时和精力要求并选择转为行动
Then 系统创建一条属于该 Focus 的 Action
And Capture 状态变为 converted
And Capture 保存 convertedActionId
```

### 场景 E：转换失败不丢记录

```gherkin
Given 用户正在将 Capture 转为 Action
When 关联主线不存在或行动字段不合法
Then 系统不创建 Action
And Capture 仍保持 inbox
```

### 场景 F：归档捕捉

```gherkin
Given 收件箱中存在一条 Capture
When 用户选择归档
Then Capture 状态变为 archived
And Capture 不再出现在 inbox 列表
```

### 场景 G：刷新恢复

```gherkin
Given 用户已经保存 Capture
When 用户刷新页面
Then Capture 仍然出现在正确的列表中
```

### 场景 H：删除捕捉

```gherkin
Given 收件箱中存在一条 Capture
When 用户确认删除
Then 系统删除该 Capture
And Capture 不再出现在任何收件箱列表中
```

## 6. 技术实现与测试

- Domain：内容、类型和状态校验。
- Application：转换使用事务，必须同时完成 Action 创建和 Capture 状态更新。
- Persistence：新增 `captures` 表，按 `userId`、状态和创建时间建立索引。
- 集成测试覆盖转换原子性、归档和删除。
- 端到端测试覆盖快速保存、转换失败保留和刷新恢复。

## 7. Definition of Done

- [ ] 快速入口不要求填写非必要字段。
- [ ] 转换失败不会丢失原始 Capture。
- [ ] Capture 与 Action 的生命周期可以明确区分。
- [ ] 没有引入 AI 自动分类。
- [ ] 所有验收场景通过并记录结果。
