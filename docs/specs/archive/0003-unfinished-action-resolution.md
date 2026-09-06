# SPEC-0003 任务调整

> 状态：Superseded
> 对应 PRD：场景四（后续）
> 依赖：`SPEC-0001`、`SPEC-0008`
> 目标：在主线闭环验证后，让用户可以简单地调整、停止或标记任务，而不制造失败压力。
> 文档分区：Archive；拆小、卡住和放弃以 `SPEC-0010` 为准

## 1. 用户目标

一条任务没有完成时，用户能用清楚、低成本的方式决定它的去向，而不是把它留成不断累积的负担。

## 2. 范围

### In scope

- 将未完成任务改写为更小、更可执行的任务。
- 标记任务为卡住，并可选记录一句阻力。
- 放弃任务并从当前任务列表移除。
- 恢复一条卡住任务。
- 刷新后恢复所有状态。

### Out of scope

- 精力、可用时间、预计时长、优先级和“今日选中任务”。
- 延期日期、提醒和逾期机制。
- 复杂父子任务树、批量处理和任务历史时间线。
- 自动判断用户为什么卡住或应该放弃什么。

## 3. 数据与状态机

### Action 增量字段

- `blockerNote`：可选，长度不超过 500 个字符；仅 `blocked` 使用。
- `dropReason`：可选，长度不超过 500 个字符；仅 `dropped` 使用。

### 状态

```text
available → completed
available → blocked → available
available → dropped
available → available（改写为更小的任务）
```

- `dropped` 是当前主线中的终态，不出现在当前任务列表。
- `blocked` 保留在任务记录中，不出现在默认的未完成列表。
- 改写任务沿用原 Action ID，只更新名称；不建立父子关系。

## 4. 用例契约

```typescript
rewriteAction(actionId: string, title: string): Promise<Action>;
dropAction(actionId: string, dropReason?: string): Promise<Action>;
blockAction(actionId: string, blockerNote?: string): Promise<Action>;
resumeAction(actionId: string): Promise<Action>;
```

## 5. 领域规则

- 所有调整只允许作用于当前用户的 `available` Action。
- `resumeAction` 只允许作用于 `blocked` Action；恢复后清空 `blockerNote`。
- 改写后的名称仍需满足 Action 名称校验。
- 放弃后不能重新进入 `available`；如果用户想重新尝试，应新建任务。
- 所有状态变更必须持久化成功后再更新页面状态。
- 这些调整不会自动改变 Focus 的 `progressPercent`。

## 6. 验收场景

### 场景 A：改写任务

```gherkin
Given 一条 available Action 存在
When 用户将它改写为更小的下一步
Then Action 保持原 ID 与 available 状态
And Action 的名称更新为用户填写的名称
```

### 场景 B：标记和恢复卡住任务

```gherkin
Given 一条 available Action 存在
When 用户将它标记为 blocked
Then Action 状态变为 blocked
And 用户可在之后将它恢复为 available
```

### 场景 C：放弃任务

```gherkin
Given 一条 available Action 存在
When 用户确认放弃
Then Action 状态变为 dropped
And Action 不再出现在当前任务列表
```

### 场景 D：调整不改变主线进度

```gherkin
Given 当前 Focus 的进度为 40%
When 用户改写、卡住、恢复或放弃一条 Action
Then Focus 的进度仍为 40%
And 页面提示用户需要自行确认主线进展
```

## 7. 技术实现与测试

- Domain：实现状态转换和字段约束，不在页面中自行判断。
- Application：每种调整使用独立用例，避免一个“大而全”的更新接口。
- Persistence：为 `userId`、`status` 建立必要索引。
- 集成测试覆盖每条状态转换、非法输入、用户隔离和刷新恢复。
- 端到端测试覆盖改写、卡住恢复和放弃。

## 8. Definition of Done

- [ ] 所有状态转换都有明确前置条件和测试。
- [ ] 不会产生既显示为可用又保存为 blocked/dropped 的矛盾状态。
- [ ] 放弃操作有确认，且不会误删数据。
- [ ] 调整任务不会自动修改主线进度。
- [ ] 所有验收场景通过并记录结果。
