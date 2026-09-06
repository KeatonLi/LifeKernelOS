# LifeKernelOS 详细技术设计

> 版本：0.7
> 状态：Accepted
> 更新时间：2026-09-06
> 文档域：Architecture
> 实现范围：`SPEC-0008`、`SPEC-0010`、`SPEC-0011` 与数据导出
> 架构基线：[system-architecture.md](system-architecture.md)
> 关键决策：[ADR-0008 主线分组与派生 To-do 进度](decisions/0008-mainline-groups-derived-todo-progress.md)

## 1. 交付目标

系统只保留两个一级工作区：

```text
主线：Goal（分组） → To-do（Action + content） → 一个当前 To-do → 完成或调整
我的画像：GoalProgress + Action 事实 + Reflection + Knowledge → ProfileGraph
```

领域与 API 继续使用 `Goal` / `Action`，界面使用“主线” / “To-do”。旧 Focus 名称仅存在于物理表、迁移和兼容 API。主线进度是服务端的派生投影，不能由客户端写入。

## 2. 技术栈与目录

- 前端：React 19、TypeScript、Vite、React Router、`@xyflow/react`、Phosphor Icons。
- 后端：Node.js 22、TypeScript、Fastify、Zod。
- 持久化：SQLite、better-sqlite3、Drizzle 连接基线。
- 认证：服务端 Session + HttpOnly Cookie；密码使用 scrypt。

```text
apps/web/src/
  App.tsx          主线任务板、我的画像、设置与交互
  api.ts           Goal / Action / Profile DTO 客户端
  styles.css       冷白、炭黑、钢灰、电光蓝视觉系统与响应式布局

apps/api/src/
  server.ts        HTTP 路由、鉴权、Zod 输入边界
  services.ts      应用用例、事务、进度投影与画像聚合
  types.ts         当前 DTO 与领域类型
  db.ts            SQLite 初始化和版本迁移

db/migrations/
  001_initial.sql
  002_v05_goal_current_action.sql
  003_v05_remove_single_active_goal_constraint.sql
  004_goal_status_events.sql
  005_v07_action_content.sql
```

## 3. 前端路由与交互

| 路由 | 组件 | 说明 |
| --- | --- | --- |
| `/expectations` | `ExpectationsPage` | 主线任务板；兼容 URL 不变 |
| `/profile` | `ProfilePage` | 我的画像与进度感知图谱 |
| `/settings` | `SettingsPage` | 导出与账号辅助入口 |
| `/now`、`/goals`、`/workbench` | `Navigate` | 兼容旧书签，重定向至 `/expectations` |

`WorkspaceShell` 左侧只渲染“主线”“我的画像”；设置为底部图标入口。主线页默认打开当前 To-do 所属 Goal，否则打开最新 active Goal。页面在一个任务板中同时呈现：主线切换、进度、To-do 列表和选中 To-do 内容，不依赖页内跳转导航。

画像页先渲染可操作的关系图谱，随后才渲染用户自述、当前 To-do 入口、知识和完成主线经历。Goal 节点点击进入 `/expectations#goal-{goalId}`；Knowledge 节点滚动到对应事实；self 节点不跳转。

## 4. 领域类型与投影

```typescript
type GoalStatus = 'active' | 'paused' | 'completed' | 'abandoned';
type ActionStatus = 'available' | 'completed' | 'blocked' | 'abandoned' | 'superseded';
type Energy = 'low' | 'medium' | 'high';
type AvailableMinutes = 5 | 15 | 30 | 60;

type Goal = {
  id: string;
  userId: string;
  title: string;
  doneDefinition: string | null;
  status: GoalStatus;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type GoalProgress = {
  completedTodoCount: number;
  totalTodoCount: number;
  progressPercent: number;
};

type GoalView = Goal & { progress: GoalProgress };

type Action = {
  id: string;
  userId: string;
  goalId: string;
  parentActionId: string | null;
  title: string;
  content: string | null;
  estimatedMinutes: AvailableMinutes | null;
  energyRequired: Energy | null;
  status: ActionStatus;
  blockerNote: string | null;
  outcomeNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
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

有效 To-do 为 `available`、`completed`、`blocked`。如果 Goal 状态不是 completed，`progressPercent = Math.round(completed / total * 100)`，无有效 To-do 时为 `0`；completed Goal 固定投影为 `100`。`abandoned` 和 `superseded` 不计入当前进度分母。

## 5. SQLite 物理结构与迁移

为降低迁移风险，物理表保持历史命名：

- `focuses` → Goal；`goal_status` 为当前状态，`done_definition` 为完成定义。
- `actions.focus_id` → Action.goalId；`actions.content` 为 To-do 内容。
- `focus_reflections.focus_id` → GoalReflection.goalId。
- `knowledge_items.focus_id` → KnowledgeItem.goalId。
- `goal_status_events.goal_id` → GoalStatusEvent.goalId。

旧 `focuses.progress_percent` 与 `focuses.status` 只为兼容旧库和 legacy API 保留。任何新的 Goal、Profile、Web API 或导出逻辑不得将其作为当前进度事实。

`005_v07_action_content.sql` 只执行 `ALTER TABLE actions ADD COLUMN content TEXT`。`createDatabase` 通过 `PRAGMA user_version` 顺序迁移到版本 5；版本 5 的新库和已存在版本 4 的数据库都必须可重复启动。

## 6. 应用用例与事务

### 6.1 Goal 与派生进度

- `CreateGoal`、`UpdateGoal`、`ChangeGoalStatus`、`ListGoalsWithProgress`
- `getGoalProgress(userId, goalId)` 读取 Action 状态统计并生成 `GoalProgress`；不写入数据库。
- 主线完成须显式确认；主线含当前 To-do 时，暂停、完成或放弃仍需先处理或释放当前 To-do。

### 6.2 To-do 与当前行动

- `CreateGoalAction(input: { title, content?, estimatedMinutes?, energyRequired? })`
- `UpdateActionMetadata(input: { title?, content?, estimatedMinutes?, energyRequired? })`
- `RecordCurrentContext`、`GetCurrentWorkspace`、`SelectCurrentAction`、`ClearCurrentAction`
- `CompleteCurrentAction`、`SplitCurrentAction`、`BlockCurrentAction`、`AbandonCurrentAction`

选择、切换、完成、拆小、卡住和放弃必须在单个 SQLite 事务中完成。拆小保留原 To-do 为 `superseded`，并创建关联的 available 子 To-do；原 To-do 不计入进度分母。

## 7. ProfileView 与图谱聚合

```typescript
type ProfileView = {
  factSummary: {
    goalCount: number;
    activeGoalCount: number;
    completedGoalCount: number;
    completedActionCount: number;
    knowledgeCount: number;
  };
  description: ProfileDescription | null;
  goals: Array<{ goal: Goal; progress: GoalProgress }>;
  experiences: Array<{ goal: Goal; progress: GoalProgress; reflection: GoalReflection | null }>;
  knowledgeItems: KnowledgeItem[];
  graph: { nodes: ProfileGraphNode[]; edges: ProfileGraphEdge[] };
};
```

`GET /api/profile` 在一致性读取事务中读取用户 Goal、Action、知识、经历与自述。每条 Goal 计算一次同一份 GoalProgress，供 `goals`、`experiences` 和 Goal 图谱节点复用。节点 `subtitle` 形如“3 / 7 · 43%”，仅包含直接事实；不得加入人格、能力、心理或价值观推断。

## 8. HTTP DTO

| Method | Path | 用途 |
| --- | --- | --- |
| GET / POST | `/api/goals` | 返回带 `progress` 的主线列表 / 创建 Goal |
| PATCH | `/api/goals/:id` | 编辑主线标题与完成定义 |
| POST | `/api/goals/:id/status` | 改变主线状态 |
| GET / POST | `/api/goals/:id/actions` | 列出 / 创建 To-do，Body 支持 `content` |
| PATCH | `/api/actions/:id` | 编辑 To-do 标题、内容和元数据 |
| GET | `/api/current` | 当前状态、当前 To-do、严格匹配和全部可用 To-do |
| POST / DELETE | `/api/current/select` | 选择 / 释放当前 To-do |
| POST | `/api/current/{complete|split|block|abandon}` | 处理当前 To-do |
| GET | `/api/profile` | 返回进度感知的 ProfileView 与图谱 |
| GET | `/api/export` | 下载 schemaVersion 5 数据快照 |

所有写请求执行 Origin 检查和 Session 校验。旧 `/api/focuses/*` 与 `/api/actions` 仅作本地历史兼容，当前 Web 客户端不得调用。

## 9. 导出契约

导出升级为 schemaVersion `5`。数据集合不变，但 `actions[]` 使用现行 Action DTO 并包含 `content`。进度不单独导出，因为它可从 Action 状态和 Goal 状态重新推导；不得导出密码摘要、Session 或 Cookie。

## 10. 视觉与可访问性约束

- 设计令牌使用冷白背景、炭黑文字、钢灰分割与电光蓝主强调；绿色仅表示完成，琥珀与红色只用于受限和风险状态。
- 图谱必须使用 `@xyflow/react` 的真实节点、边、缩放、平移和适配视图，不使用静态图片或 CSS 假连线。
- 两个 Tab 具有可见 active、hover 和键盘焦点状态；所有图标带可访问名称或相邻可见文字。
- 主线任务板在桌面保持两栏；窄屏切为单列，当前 To-do 的主要操作始终可见。
- 图谱外保留主线进度、知识和当前 To-do 的等价事实入口，避免信息只存在于视觉关系中。

## 11. 测试与状态

自动化必须覆盖 Action 内容迁移与校验、有效 To-do 分母、百分比取整、completed Goal 的 100% 投影、Profile 用户隔离、图谱节点字段和 schemaVersion 5 导出。类型检查、生产构建、桌面与移动端浏览器验收均为交付前置条件。

代码和自动化测试完成后，`SPEC-0010`、`SPEC-0011` 与受影响的 `SPEC-0007` 可保持或恢复为 `Implemented`；逐条人工验收与真实用户试用完成前不得标记为 `Verified`。
