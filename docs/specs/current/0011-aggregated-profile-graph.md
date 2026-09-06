# SPEC-0011 我的画像：进度感知汇聚图谱

> 状态：Implemented
> 版本：0.2
> 日期：2026-09-06
> 对应产品：[PRD v0.7](../../product/PRD.md)“我的画像”Tab
> 相关决策：[ADR-0005](../../architecture/decisions/0005-evidence-based-profile.md)、[ADR-0007](../../architecture/decisions/0007-two-tab-console-information-architecture.md)、[ADR-0008](../../architecture/decisions/0008-mainline-groups-derived-todo-progress.md)
> 依赖：`SPEC-0010`、`SPEC-0008`
> 文档分区：Current
> 目标：把用户真实的主线进度、To-do 完成事实、知识和用户确认文字汇聚成好读、可交互、可追溯的图谱。

## 1. 用户问题

用户不仅想知道做成过什么，也想在一个画面里看见自己正在推进什么。旧画像将图谱、事实概览和知识维护拆得太散，主线节点也缺少完成程度，难以形成直观的长期积累感。

## 2. 产品原则

- 图谱中心是当前用户，不使用人格标签。
- 主线节点聚合 To-do 完成数和派生进度，不把每条 To-do 绘制成节点。
- 图谱只表达用户、主线与知识的可追溯关系；进度是事实，不是评价。
- 图谱必须可缩放、平移、适配视图和打开来源；图谱外保留等价事实入口。

## 3. 范围

### In scope

- 左侧一级导航展示“我的画像”。
- 以 self 节点为中心，围绕展示 Goal 节点和 KnowledgeItem 节点。
- Goal 节点展示主线名称、状态、`完成 / 有效 To-do 总数` 和派生百分比。
- Knowledge 节点连接来源 Goal，并展示知识状态。
- 图谱下方展示用户自述、当前 To-do 入口和知识事实操作。
- 用户维护整体描述、完成主线的经历总结和关联主线的知识。
- 图谱、事实与编辑操作均按用户隔离。

### Out of scope

- 人格、能力、价值观、心理状态或职业适配推断。
- AI 自动生成或自动保存画像结论。
- 公开画像、社交关系、排名、徽章和他人评价。
- 将每条 To-do 绘制成图谱节点，或根据百分比自动改变主线状态。

## 4. 数据契约

```typescript
type GoalProgress = {
  completedTodoCount: number;
  totalTodoCount: number;
  progressPercent: number;
};

type ProfileGraphNode = {
  id: string;
  type: 'self' | 'goal' | 'knowledge';
  sourceId: string | null;
  title: string;
  subtitle: string;
  status: GoalStatus | KnowledgeStatus | null;
  progress: GoalProgress | null;
};
```

Goal 节点的 `subtitle` 使用例如“3 / 7 · 43%”的直接事实；self 和 Knowledge 节点的 `progress` 为 `null`。

## 5. 验收场景

### 场景 A：汇聚多个主线

```gherkin
Given 用户有两条 active Goal 和一条 completed Goal
When 用户打开“我的画像”
Then 图谱出现一个 self 节点和三条 Goal 节点
And 每条 Goal 节点均与 self 节点连接
And 每条 Goal 节点显示自己的派生进度
```

### 场景 B：知识保留来源

```gherkin
Given 用户为一条 Goal 创建了 KnowledgeItem
When 服务端聚合画像
Then 图谱出现对应知识节点
And 存在从该 Goal 节点到知识节点的 develops_knowledge 边
And 节点 sourceId 可以追溯原始记录
```

### 场景 C：完成 To-do 更新画像

```gherkin
Given 一条 Goal 下有两条有效 To-do，其中一条 completed
When 用户查看画像图谱
Then Goal 节点显示“1 / 2 · 50%”
And 系统不据此生成能力或人格标签
```

### 场景 D：用户隔离

```gherkin
Given 用户 A 和用户 B 都有主线和知识
When 用户 A 请求画像
Then 节点、边、进度和事实概览只包含用户 A 的记录
```

### 场景 E：空状态

```gherkin
Given 用户还没有主线和知识
When 用户打开“我的画像”
Then 页面解释画像会从第一条主线与 To-do 开始形成
And 页面不使用演示节点冒充用户事实
```

## 6. Definition of Done

- [x] 产品职责、事实边界和用户可见进度已由用户确认并进入 `Accepted`。
- [x] PRD、ADR、架构和详细技术设计已同步为 v0.7 方案。
- [x] API 返回主线进度，图谱节点和事实列表使用同一投影。
- [x] 自动化测试覆盖进度、节点、边和用户隔离。
- [ ] 桌面端与移动端完成图谱交互与事实列表人工验收。
- [ ] 逐条验收通过后才能标记为 `Verified`。
