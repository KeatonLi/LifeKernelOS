# SPEC-0005 快速收集箱

> 状态：Implemented
> 对应 PRD：v0.8 快速收集
> 依赖：`SPEC-0008`、`SPEC-0010`
> 目标：让用户在 10 秒内保存临时想法，并在不中断当前行动的前提下稍后整理为 To-do。
> 文档分区：Current；作为全局辅助抽屉，不增加一级 Tab

## 1. 用户目标

用户想到任务、事件或灵感时，只写一句话先保存；稍后再分类、归入一条 active 主线成为 To-do，或者归档、删除。

## 2. 范围

### In scope

- 两个业务 Tab 内均可打开“快速记下”抽屉。
- 只填写一句话即可保存，内容去首尾空白后为 1—2000 字符。
- 可选类型：想法、任务、事件、感受、灵感。
- 查看待整理数量与收集箱列表。
- 选择 active 主线并确认标题，将 Capture 原子地转换为 To-do。
- 归档或确认后删除 Capture；刷新后恢复服务端数据。
- 数据导出包含全部状态的 Capture。

### Out of scope

- 第三个一级 Tab。
- 捕捉时强制关联主线、To-do、价值观或标签。
- AI 自动分类、自动改写或自动选择主线。
- 搜索、批量整理、提醒和外部收集入口。

## 3. 数据与规则

```text
Capture {
  id: UUID
  userId: UUID
  content: string
  type?: idea | task | event | feeling | inspiration
  status: inbox | converted | archived
  convertedActionId?: UUID
  createdAt: ISODateTime
  updatedAt: ISODateTime
}
```

- Capture 独立于 To-do；捕捉成功不改变当前 To-do。
- 转换只允许从 `inbox` 状态发起，目标必须是当前用户的 active 主线。
- 转换在一个事务中创建 To-do 并记录 `convertedActionId`；任一步失败时 Capture 保持 `inbox`。
- 生成的 To-do 标题由用户确认，详细内容保留原 Capture 全文。
- 归档不删除事实；删除需要用户明确确认。

## 4. 验收场景

### 场景 A：快速保存

```gherkin
Given 用户处于主线或我的画像页面
When 用户打开快速收集、输入一句话并保存
Then 系统创建一条 inbox Capture
And 输入框清空且待整理数量更新
```

### 场景 B：空内容被拒绝

```gherkin
When 用户提交空白内容
Then 系统不创建 Capture
And 保存按钮不可用或返回字段错误
```

### 场景 C：分类与刷新恢复

```gherkin
Given 收集箱存在一条 Capture
When 用户选择类型并刷新页面
Then Capture 仍在收集箱且类型保持一致
```

### 场景 D：转为 To-do

```gherkin
Given 收集箱存在一条 Capture 且存在 active 主线
When 用户确认标题和目标主线
Then 系统创建该主线下的 available To-do
And To-do 内容保留原 Capture 全文
And Capture 状态变为 converted 并记录 convertedActionId
```

### 场景 E：转换失败不丢记录

```gherkin
When 目标主线不存在、不属于用户或不是 active
Then 系统不创建 To-do
And Capture 仍为 inbox
```

### 场景 F：归档与删除

```gherkin
When 用户归档 Capture
Then 它不再出现在收集箱
When 用户确认删除 Capture
Then 系统永久删除该记录
```

## 5. 验证

- 服务层测试覆盖内容校验、分类、转换原子性、归档、删除与导出。
- HTTP 测试覆盖身份边界、失败保留和转换成功。
- 前端复用全局抽屉，不新增路由或一级导航。
- 未引入 AI 或第三方正文传输。

## 6. Definition of Done

- [x] 快速入口只要求内容字段。
- [x] 收集箱不改变当前双 Tab 信息架构。
- [x] 转换失败不丢失原始 Capture。
- [x] Capture 与 To-do 生命周期明确区分。
- [x] 导出契约与数据库迁移已升级。
- [x] 自动化测试覆盖关键验收路径。
