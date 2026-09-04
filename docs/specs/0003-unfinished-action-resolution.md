# SPEC-0003 处理未完成行动

> 状态：Proposed
> 对应 PRD：MVP 场景三
> 依赖：`SPEC-0001`、`SPEC-0008`
> 目标：让用户在行动没有完成时，可以轻松调整，而不是积累逾期和失败压力。

## 1. 用户目标

用户面对一条没有完成的行动时，可以明确决定下一步：延后、拆小、放弃或标记卡住；每一种结果都比把行动留在原地更清晰。

## 2. 范围

### In scope

- 延后行动到指定本地日期。
- 将行动拆成更小的行动。
- 放弃行动并从当前可用列表移除。
- 标记卡住并记录阻力。
- 将卡住行动恢复为 available。
- 延后行动到期后重新进入可用列表。
- 所有操作可刷新恢复。

### Out of scope

- 复杂父子任务树和行动历史时间线。
- 自动判断用户为什么卡住。
- 批量处理行动。
- 通知用户延期到期。

## 3. 数据与状态机

### Action 增量字段

- `scheduledFor`：可选，本地日期；仅 deferred 使用。
- `blockerNote`：可选，长度不超过 500 个字符；仅 blocked 使用。
- `dropReason`：可选，长度不超过 500 个字符；仅 dropped 使用。

### 状态

```text
available → completed
available → deferred → available（到期）
available → blocked → available（恢复）
available → dropped
available → available（拆小后更新）
```

- deferred 在 `scheduledFor <= 今天` 时，由今日页面显式调用 `activateDueActions` 恢复为 available；普通读取用例不修改数据。
- dropped 是当前主线中的终态，不出现在可用列表。
- blocked 不出现在候选列表，但保留在行动记录中。
- 拆小沿用原 Action ID，更新名称和预计耗时，状态保持 available；不建立父子关系。

## 4. 用例契约

```typescript
deferAction(actionId: string, scheduledFor: string): Promise<Action>;
splitAction(actionId: string, title: string, estimatedMinutes: number): Promise<Action>;
dropAction(actionId: string, dropReason?: string): Promise<Action>;
blockAction(actionId: string, blockerNote: string): Promise<Action>;
resumeAction(actionId: string): Promise<Action>;
activateDueActions(date: string): Promise<number>;
```

## 5. 领域规则

- `deferAction`、`splitAction`、`dropAction`、`blockAction` 只允许作用于 available Action。
- `resumeAction` 只允许作用于 blocked Action；`activateDueActions` 只处理到期的 deferred Action。
- 延后日期必须是合法本地日期，且必须晚于今天。
- 拆小后的预计耗时必须小于原预计耗时，且仍为 1—480 的正整数。
- 标记卡住时阻力说明必填；恢复后清空 `blockerNote`。
- 放弃后不能重新进入 available；如果用户想重新尝试，应新建行动。
- 所有状态变更必须持久化成功后再更新页面状态。

## 6. 验收场景

### 场景 A：延后行动

```gherkin
Given 一条 available Action 存在
When 用户选择延后到未来日期
Then Action 状态变为 deferred
And Action 保存 scheduledFor
And Action 不出现在今天的候选列表
```

### 场景 B：延后到期

```gherkin
Given 一条 deferred Action 的 scheduledFor 等于今天
When 今日页面先显式调用 activateDueActions
Then 系统将 Action 恢复为 available
And Action 可以进入候选计算
```

### 场景 C：拆小行动

```gherkin
Given 一条预计耗时 60 分钟的 available Action 存在
When 用户将它改为 15 分钟的更小行动
Then Action 保持原 ID
And Action 状态为 available
And Action 的预计耗时和名称已更新
```

### 场景 D：不允许拆得更大

```gherkin
Given 一条预计耗时 15 分钟的 Action 存在
When 用户尝试将它拆成 30 分钟
Then 系统拒绝修改
And 页面提示拆小后的耗时必须更短
```

### 场景 E：标记卡住

```gherkin
Given 一条 available Action 存在
When 用户填写阻力说明并标记卡住
Then Action 状态变为 blocked
And Action 保存 blockerNote
And Action 不出现在候选列表
```

### 场景 F：空阻力说明被拒绝

```gherkin
Given 用户正在标记一条 Action 为 blocked
When 用户不填写阻力说明
Then 系统拒绝修改
And Action 仍保持原状态
```

### 场景 G：放弃行动

```gherkin
Given 一条 available Action 存在
When 用户确认放弃
Then Action 状态变为 dropped
And Action 不再出现在可用和候选列表
```

### 场景 H：恢复卡住行动

```gherkin
Given 一条 blocked Action 存在
When 用户选择恢复
Then Action 状态变为 available
And blockerNote 被清空
```

## 7. 技术实现与测试

- Domain：实现状态转换和字段约束，不在页面中自行判断。
- Application：每个处理动作使用独立用例，避免一个“大而全”的更新接口。
- Persistence：为 `userId`、`status`、`scheduledFor` 增加索引；`activateDueActions` 作为显式幂等命令使用事务。
- 集成测试覆盖每条状态转换、非法输入和刷新恢复。
- 端到端测试覆盖延后、拆小、卡住恢复和放弃。

## 8. Definition of Done

- [ ] 所有状态转换都有明确前置条件和测试。
- [ ] 不会产生既显示为可用又保存为 deferred/blocked 的矛盾状态。
- [ ] 放弃操作有确认，且不会误删数据。
- [ ] 操作失败时页面不显示成功结果。
- [ ] 所有验收场景通过并记录结果。
