# SPEC-0010 主线：分组 To-do 与当前行动

> 状态：Implemented
> 对应 PRD：v0.7“主线”Tab
> 依赖：`SPEC-0008`
> 文档分区：Current
> 迁移来源：现有 `SPEC-0001`、`SPEC-0002`、`SPEC-0003` 的相关能力
> 目标：让用户把多条主线作为 To-do 分组推进，并在全局只确定一个当前 To-do。

## 1. 用户目标

用户同时有多个长期方向，但不想面对难懂的目标管理器。他希望打开主线页就能看见一条主线、其中的 To-do、当前该做什么和真实进度；每个 To-do 还应保留自己的内容，避免标题脱离语境。

## 2. 产品原则

- 主线可有多条，当前 To-do 全局最多一个。
- 主线是分组；To-do 是归属该分组的可执行内容。
- 进度由服务端从有效 To-do 自动推导，用户不能手动输入百分比。
- 完成、拆小、卡住、放弃都是正常 To-do 结果。
- 状态匹配只缩小候选范围，不替用户作最终决定。

## 3. 范围

### In scope

- 创建、查看、编辑、暂停、恢复、完成、放弃和重新打开多条主线。
- 为 active 主线创建、查看与编辑 To-do。
- To-do 记录标题、可选内容、可选预计时长、精力要求与处理结果。
- 按有效 To-do 动态计算主线完成数、总数和百分比。
- 记录当前可用时间与精力，展示匹配候选并允许查看全部和手动覆盖。
- 确认、释放、完成、拆小、卡住或放弃全局唯一当前 To-do。
- 刷新和跨设备恢复主线、To-do、进度、状态和当前选择。
- 从现有 Focus / Action 数据迁移且不丢失数据。

### Out of scope

- 手动编辑主线百分比、主线层级、依赖关系、OKR、团队协作和项目排期。
- 自动判断哪条主线最重要，或自动完成主线。
- 连续打卡、排行榜、成就系统、日终收束、周复盘、快速捕捉和外部工具同步。
- 我的画像汇聚图谱（由 `SPEC-0011` 定义）和 AI 人格或能力推断。

## 4. 最小数据

```typescript
type Goal = {
  id: string;
  userId: string;
  title: string;
  doneDefinition: string | null;
  status: 'active' | 'paused' | 'completed' | 'abandoned';
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type GoalProgress = {
  completedTodoCount: number;
  totalTodoCount: number;
  progressPercent: number;
};

type Action = {
  id: string;
  userId: string;
  goalId: string;
  parentActionId: string | null;
  title: string;
  content: string | null;
  estimatedMinutes: 5 | 15 | 30 | 60 | null;
  energyRequired: 'low' | 'medium' | 'high' | null;
  status: 'available' | 'completed' | 'blocked' | 'abandoned' | 'superseded';
  blockerNote: string | null;
  outcomeNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
```

`content` 是 To-do 的可选详细说明，最多 1,000 个字符。`GoalProgress` 是读取时投影，不写入 Goal 表。

## 5. 领域规则

- Goal 标题去除首尾空白后长度为 `1—100`；完成定义可为空，非空时最多 `300` 个字符。
- Action 标题去除首尾空白后长度为 `1—200`，内容最多 `1,000` 个字符，且必须关联当前用户的一条 active Goal。
- 有效 To-do 为 status 属于 `available`、`completed` 或 `blocked` 的 Action；`abandoned` 与 `superseded` 不计入分母。
- active / paused Goal 的 `progressPercent = round(completedTodoCount / totalTodoCount × 100)`；无有效 To-do 时为 `0`。
- completed Goal 一律投影为 `100%`；Goal 仍必须由用户明确完成，不根据进度自动完成。
- 每个用户全局最多一个 `selectedActionId`；选择新行动与释放旧选择必须在同一事务中完成。
- 只有 available Action 可以成为 `selectedActionId`；blocked Action 恢复为 available 后才能选择。
- 拆小会把原 Action 标记为 superseded，并创建一条 `parentActionId` 指向原行动的新 available Action。
- 状态匹配：预计时长不超过可用时间，且精力要求不高于当前精力；缺少任一属性的 Action 不进入严格匹配区，但仍出现在全部行动中。
- 暂停、完成或放弃 Goal 前，如果 `selectedActionId` 指向关联 Action，用户必须先处理或明确释放选择。

## 6. 用户可见流程

### 6.1 主线任务板

1. 用户进入“主线”，默认打开包含当前 To-do 的主线；没有当前 To-do 时打开最近更新的 active 主线。
2. 页面在首屏展示主线名称、`已完成 / 有效 To-do 总数`、进度条和百分比。
3. 左侧列表显示该主线所有 To-do；右侧显示选中 To-do 的内容、完成标准、时间和精力。
4. 用户可将一个 available To-do 设为当前 To-do；当前 To-do 显示唯一的完成主按钮。

### 6.2 维护与处理

1. 用户可在主线内新增或编辑 To-do 的标题、内容和元数据。
2. 完成当前 To-do 后，系统记录 resolvedAt、释放当前选择并在下一次读取时更新主线进度。
3. 用户可拆小、卡住、放弃或释放当前 To-do；对应状态即时影响有效 To-do 进度分母。
4. 用户可切换或创建另一条主线，原主线与全部 To-do 保持不丢失。

## 7. 验收场景

### 场景 A：创建多个主线

```gherkin
Given 当前用户已有一条 active Goal
When 用户创建另一条合法 Goal
Then 系统创建第二条 active Goal
And 两条 Goal 都可作为独立 To-do 分组打开
```

### 场景 B：To-do 内容可编辑

```gherkin
Given 用户在 active Goal 下有一条 available Action
When 用户保存该 Action 的 title 和 content
Then 重新读取该 Action 时返回相同 title 和 content
And 内容只对当前用户可见
```

### 场景 C：派生进度

```gherkin
Given 一条 active Goal 有 4 条有效 To-do，其中 1 条 completed
When 用户读取主线或画像
Then GoalProgress.completedTodoCount 为 1
And GoalProgress.totalTodoCount 为 4
And GoalProgress.progressPercent 为 25
```

### 场景 D：进度排除已放弃和已替代 To-do

```gherkin
Given 一条 Goal 有 1 条 completed、1 条 available、1 条 abandoned 和 1 条 superseded To-do
When 用户读取进度
Then totalTodoCount 为 2
And progressPercent 为 50
```

### 场景 E：完成当前 To-do

```gherkin
Given 用户已有一条 selected Action
When 用户标记完成
Then 该 Action 变为 completed 并记录 resolvedAt
And selectedActionId 被清空
And 所属主线的下一次读取进度基于新的 completed 数量计算
```

### 场景 F：完成主线

```gherkin
Given 用户的一条 Goal 尚有未完成有效 To-do
When 用户确认将 Goal 标记为 completed
Then Goal 状态变为 completed
And 该 Goal 的投影进度为 100
And 系统不自动修改未完成 To-do 的状态
```

### 场景 G：唯一当前 To-do

```gherkin
Given 用户已有一条 selected Action
When 用户确认另一条 available Action
Then CurrentContext.selectedActionId 从原 Action 改为新 Action
And 同一用户没有第二个当前选择
```

## 8. API 与事务边界

详细 HTTP DTO 以[详细技术设计](../../architecture/technical-design.md)为准。以下用例边界由本规格固定：

- `CreateGoal`、`UpdateGoal`、`ChangeGoalStatus`、`ListGoalsWithProgress`
- `CreateGoalAction`、`UpdateActionMetadata`、`ListGoalActions`
- `RecordCurrentContext`、`GetCurrentWorkspace`、`SelectCurrentAction`、`ClearCurrentAction`
- `CompleteCurrentAction`、`SplitCurrentAction`、`BlockCurrentAction`、`AbandonCurrentAction`

选择或切换当前行动、处理当前行动、改变含 selected Action 的 Goal 状态和数据迁移都必须使用事务。进度读取与 Profile 聚合必须在一致性读取中完成。

## 9. 测试追溯

| 场景 | 领域测试 | 集成测试 | 浏览器验收 |
| --- | --- | --- | --- |
| A 主线并存 | 多 active Goal | 多行持久化 | 切换两个主线 |
| B 内容 | 内容校验与更新 | PATCH Action | 编辑后刷新保留 |
| C-D 进度 | 分母与取整规则 | Goal / Profile DTO | 完成后进度更新 |
| E-F 完成 | 状态机与投影 | 当前选择清理 | 完成按钮与 100% 显示 |
| G 唯一选择 | selectedActionId 唯一性 | 原子切换 | 当前 To-do 唯一强调 |

## 10. Definition of Done

- [x] 本规格已由用户确认并进入 `Accepted`。
- [x] PRD、ADR、架构和详细技术设计已同步为 v0.7 方案。
- [x] 数据迁移、服务端 DTO、前端主线任务板与自动化测试已完成。
- [ ] 桌面端和移动端均完成核心流程人工验收。
- [ ] 全部验收场景通过后才能标记为 `Verified`。
