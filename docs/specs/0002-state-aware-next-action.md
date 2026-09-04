# SPEC-0002 根据状态选择下一步

> 状态：Proposed
> 对应 PRD：MVP 场景二
> 依赖：`SPEC-0001`、`SPEC-0008`
> 目标：让用户根据当前精力和可用时间，找到合适的行动并选为今天的当前行动。

## 1. 用户目标

用户不需要重新整理全部待办，只需告诉系统当前有多少时间和精力，就能看到适合现在执行的行动；系统给出候选，但最终选择权属于用户。

## 2. 范围

### In scope

- 创建或更新当天的 `DailyState`。
- 记录精力：低 / 中 / 高。
- 记录可用时间：15 / 30 / 60 分钟。
- 按规则展示候选行动。
- 用户从候选或全部可用行动中选择一条当前行动。
- 每天最多一条当前行动，刷新后保持选择结果。
- 没有匹配候选时提供创建更小行动和查看全部行动的入口。

### Out of scope

- 自动创建、改写或拆分行动。
- AI 推荐、排序学习和个性化权重。
- 延后、拆小、放弃和卡住的状态处理，由 `SPEC-0003` 负责。
- 日终收束，由 `SPEC-0004` 负责。

## 3. 数据与匹配规则

### DailyState

- `date`：用户本地日期 `YYYY-MM-DD`。
- `energy`：`low` / `medium` / `high`。
- `availableMinutes`：`15` / `30` / `60`。
- `selectedActionId`：可选，当前日期最多一条。

### 候选规则

- 精力等级顺序固定为 `low < medium < high`。
- 行动进入候选的条件是 `status = available`、`estimatedMinutes <= availableMinutes`，且 `energyRequired <= energy`。
- 候选按预计耗时升序展示；相同耗时按创建时间升序。
- 用户可以查看并手动选择全部 `available` 行动，手动选择不受候选规则限制。
- `60` 表示当前可投入约 60 分钟；超过 60 分钟的行动不自动进入候选。
- 没有候选时不显示“推荐失败”，而是提示创建更小行动或查看全部行动。

## 4. 用例契约

```typescript
type DailyStateInput = {
  date: string;
  energy: 'low' | 'medium' | 'high';
  availableMinutes: 15 | 30 | 60;
};

setDailyState(input: DailyStateInput): Promise<DailyState>;
getDailyState(date: string): Promise<DailyState | null>;
listCandidateActions(date: string): Promise<Action[]>;
listAllAvailableActions(): Promise<Action[]>;
selectAction(date: string, actionId: string): Promise<DailyState>;
clearSelectedAction(date: string): Promise<DailyState>;
```

## 5. 验收场景

### 场景 A：记录今日状态

```gherkin
Given 用户进入今日页面
When 用户选择精力为 low、可用时间为 15 分钟并提交
Then 系统保存今天的 DailyState
And 页面展示符合条件的行动候选
```

### 场景 B：匹配候选

```gherkin
Given 用户精力为 medium、可用时间为 30 分钟
And 存在一个耗时 15 分钟且精力要求为 low 的 available Action
When 系统加载候选行动
Then 该行动出现在候选列表
And 页面说明它符合时间和精力条件
```

### 场景 C：排除不匹配行动

```gherkin
Given 用户精力为 low、可用时间为 15 分钟
And 存在一个耗时 30 分钟或精力要求为 high 的 available Action
When 系统加载候选行动
Then 该行动不出现在默认候选列表
And 用户仍可从全部行动列表手动查看它
```

### 场景 D：选择当前行动

```gherkin
Given 页面展示了可用行动
When 用户选择其中一条行动
Then DailyState.selectedActionId 更新为该行动 ID
And 页面只展示一条当前行动
```

### 场景 E：更换当前行动

```gherkin
Given 今天已经选择了一条当前行动
When 用户选择另一条行动
Then DailyState.selectedActionId 更新为新行动 ID
And 不产生第二条当前行动
```

### 场景 F：没有匹配候选

```gherkin
Given 没有符合时间和精力条件的 available Action
When 系统加载候选行动
Then 页面显示没有匹配候选的空状态
And 页面提供“创建更小行动”和“查看全部行动”入口
```

### 场景 G：完成后清理选择

```gherkin
Given 今天选中的行动已被标记为 completed
When 今日页面重新加载
Then 系统清理指向已完成行动的 selectedActionId
And 页面提示用户选择下一条行动
```

### 场景 H：刷新后恢复

```gherkin
Given 用户已经保存今日状态并选择当前行动
When 用户刷新页面
Then 今日状态和当前行动仍然存在
```

## 6. 技术实现与测试

- Domain：实现精力等级比较、时间匹配和候选排序纯函数。
- Application：`SetDailyState`、`ListCandidateActions`、`SelectAction`。
- Persistence：新增 `daily_states` 表，按 `userId + date` 建立唯一约束。
- 集成测试覆盖状态 upsert、候选过滤、选择唯一性和已完成行动清理。
- 端到端测试覆盖记录状态、选择行动、无候选空状态和刷新恢复。

## 7. Definition of Done

- [ ] 已进入 `Accepted` 后开始实现。
- [ ] 精力、时间等级和候选规则有单元测试。
- [ ] 候选理由可被用户理解，且允许查看全部行动。
- [ ] 每日只能存在一个 selectedActionId。
- [ ] 完成当前行动后不会保留无效选择。
- [ ] 所有验收场景通过并记录结果。
