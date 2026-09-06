# LifeKernelOS 架构基线

> 版本：0.7
> 状态：Accepted
> 更新时间：2026-09-06
> 文档域：Architecture
> 对应产品：[PRD v0.7](../product/PRD.md)
> 对应决策：[ADR-0003](decisions/0003-server-backed-mvp.md)、[ADR-0005](decisions/0005-evidence-based-profile.md)、[ADR-0007](decisions/0007-two-tab-console-information-architecture.md)、[ADR-0008](decisions/0008-mainline-groups-derived-todo-progress.md)

## 1. 架构目标

当前架构只支撑两个一级工作区：

- **主线**：多条主线分组、To-do 内容、派生进度与唯一当前 To-do。
- **我的画像**：主线、To-do 事实、经历、自我描述和知识的进度感知关系图谱。

技术边界必须保证：服务端是数据事实源；所有数据按用户隔离；当前 To-do 切换和结果原子写入；进度可由事实重算；画像只聚合事实，不创造推断性结论。

## 2. 系统上下文

```text
浏览器
  ├─ /expectations  主线任务板
  ├─ /profile       我的画像图谱
  └─ /settings      账号辅助入口
        │ HTTPS / JSON / HttpOnly Session
        ▼
Fastify 模块化单体
  ├─ Identity
  ├─ Goals & To-dos
  ├─ Current Context
  ├─ Progress Projection
  ├─ Profile Aggregation
  └─ Export
        │ 事务与归属校验
        ▼
SQLite
```

首轮采用单进程模块化单体，不引入微服务、消息队列、第三方画像服务或前端直连数据库。

## 3. 前端信息架构

| 路由 | 产品职责 | 导航层级 |
| --- | --- | --- |
| `/expectations` | 在一个任务板中查看主线、To-do、当前行动与派生进度 | 一级 Tab：主线 |
| `/profile` | 展示以用户为中心的主线—知识图谱及其事实层 | 一级 Tab：我的画像 |
| `/settings` | JSON 导出与后续账号设置 | 侧栏底部辅助入口 |
| `/now`、`/goals`、`/workbench` | 兼容旧书签并重定向到 `/expectations` | 不展示 |

主线页首屏必须可理解当前 To-do、所属主线、完成数量和进度；画像页首屏必须以真实可交互图谱作为主要内容。设置不成为第三个 Tab。

## 4. 领域模型

### 4.1 Goal（界面：主线）

用户持续推进的结果分组。一个用户可以同时有多条 active Goal。

- 标题、可选完成定义与状态：active / paused / completed / abandoned。
- 不存在唯一 Goal；completed 状态由用户明确确认。
- 进度为 Action 状态的派生投影，不能手动编辑。

### 4.2 Action（界面：To-do）

归属一条 Goal 的可执行内容。

- 标题、可选 `content`、可选预计时长和精力要求。
- 生命周期：available / completed / blocked / abandoned / superseded。
- 拆小后新 Action 通过 `parentActionId` 指向原 Action。
- current Context 选中一条 available Action 表示全局唯一当前 To-do，不改变其生命周期。

### 4.3 GoalProgress

服务端读取时生成的只读事实：`completedTodoCount`、`totalTodoCount`、`progressPercent`。

- 有效 To-do 为 available / completed / blocked。
- abandoned / superseded 不计入总数；completed Goal 固定投影 100%。
- GoalProgress 同时供主线任务板和 Profile 聚合使用，不持久化为可编辑列。

### 4.4 Profile

- `ProfileDescription`：用户自己确认的整体描述。
- `GoalReflection`：完成主线的用户总结。
- `KnowledgeItem`：关联一条主线的知识记录。
- `GoalStatusEvent`：主线状态变化事实历史。
- `ProfileGraph`：服务端读取 GoalProgress、知识与当前用户事实后实时生成的节点与边，不持久化快照。

图谱只允许 self → goal 和 goal → knowledge 两类关系。它在 Goal 节点聚合 To-do 进度，但不把每条 To-do 绘制为节点。

## 5. 持久化与兼容

当前数据库继续沿用历史表名：

| 物理结构 | 当前领域含义 |
| --- | --- |
| `focuses` | Goal；当前状态读取 `goal_status`，完成定义读取 `done_definition` |
| `actions.focus_id` | Action 的 `goalId` 外键 |
| `actions.content` | To-do 可选详细内容 |
| `focus_reflections.focus_id` | GoalReflection 的 `goalId` |
| `knowledge_items.focus_id` | KnowledgeItem 的 `goalId` |
| `current_contexts` | CurrentContext 与唯一 `selected_action_id` |

`focuses.progress_percent` 和旧 `status` 仅用于历史迁移与 legacy API；现行 UI、Profile DTO 和导出用 Action 状态派生进度。启动迁移遵循 user_version `0 → 5`，其中版本 5 增加 Action 内容列。

## 6. HTTP 与事务边界

规范接口由当前 Web 客户端使用：

- `/api/auth/*`
- `/api/goals`、`/api/goals/:id`、`/api/goals/:id/status`
- `/api/goals/:id/actions`、`/api/actions/:id`
- `/api/current`、`/api/current/context`、`/api/current/select`、`/api/current/{complete|split|block|abandon}`
- `/api/profile`、`/api/profile/description`、`/api/goals/:id/reflection`
- `/api/knowledge`、`/api/knowledge/:id`
- `/api/export`

以下操作必须在单个 SQLite 事务中完成：选择或切换当前 To-do；完成、拆小、卡住或放弃当前 To-do；改变含当前 To-do 的 Goal 状态；数据库迁移；导出一致性读取；Goal 状态事件写入。进度读取和画像聚合使用一致性读事务。

## 7. 画像可信度与隐私

- Profile 查询仅使用当前 Session 对应用户的数据。
- 每个 goal / knowledge 图谱节点携带 `sourceId`，可以回到原始事实。
- self 节点仅表示当前用户，不包含身份画像标签。
- 完成数和进度不推断人格、能力、心理或价值观。
- 画像正文不发送到第三方分析或 AI 服务。

## 8. 验证基线

- Domain / Application 测试覆盖 Action 内容、派生进度、多个 active Goal、唯一当前 To-do、状态匹配和四种处理结果。
- HTTP 测试覆盖身份边界、资源归属、规范 DTO 与 schemaVersion 5 导出。
- 迁移测试覆盖旧 Focus / Action 数据升级、Action 内容列和重复启动。
- 前端必须通过类型检查与生产构建，并在桌面和移动视口人工验证主线任务板、当前 To-do、图谱交互与事实回退。

代码与自动化测试完成只可标记为 `Implemented`；逐条人工验收通过前不得标记为 `Verified`。
