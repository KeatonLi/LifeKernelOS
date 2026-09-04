# LifeKernelOS MVP 技术架构基线

> 版本：0.2
> 状态：Proposed
> 更新时间：2026-09-04
> 对应产品文档：[PRD.md](PRD.md)
> 详细实现蓝图：[technical-design.md](technical-design.md)

## 1. 架构目标

MVP 的技术架构只服务四个目标：

1. 让用户快速完成“当前主线 → 下一步行动 → 行动结果”的闭环。
2. 让核心业务规则可以被自动化测试，不依赖页面操作才能验证。
3. 让服务端成为可靠的数据事实源，用户登录后可以在不同设备访问同一份数据。
4. 让身份、业务规则和持久化边界清晰，未来可以增加能力而不把页面改成“大杂烩”。

架构明确不追求：微服务、开放注册、复杂权限、离线同步、插件系统和面向未来的通用平台。

## 2. 架构决策摘要

| 领域 | MVP 决策 | 原因 |
| --- | --- | --- |
| 应用形态 | 响应式 Web + 后端模块化单体 | 同时覆盖桌面和移动端，避免微服务带来的早期复杂度 |
| 前端 | React + TypeScript + Vite | 适合快速迭代，构建产物由后端或反向代理提供 |
| 后端 | Node.js + TypeScript + Fastify | 与前端统一语言，足够轻量，适合 API 和模块化用例 |
| 数据存储 | SQLite 文件 | MVP 部署简单、零数据库服务，支持约束和事务 |
| 数据访问 | Repository + Drizzle ORM + better-sqlite3 | 隔离 SQLite 细节，保留类型安全和迁移能力 |
| 页面状态 | React 页面状态和用例服务 | MVP 数据关系简单，暂不引入全局状态库 |
| 样式 | 原生 CSS / CSS Modules | 减少 UI 工程依赖，先保证流程清晰和响应式 |
| 测试 | Vitest、React Testing Library、Playwright | 分别覆盖规则、组件交互和完整用户流程 |
| 部署 | Fastify 服务 + 持久化 SQLite 文件 | API、页面和数据边界统一，支持登录和跨设备访问 |

详细理由记录在 [ADR-0003 服务端持久化](decisions/0003-server-backed-mvp.md)。前两份本地优先决策保留为历史记录。

## 3. 总体结构

```text
┌─────────────────────────────────────────────┐
│ Browser / Web UI                             │
│ React：Login / Setup / Today / Close / Settings│
└──────────────────────┬──────────────────────┘
                       │ HTTPS JSON API
┌──────────────────────▼──────────────────────┐
│ API 层                                       │
│ Fastify 路由、会话、输入输出校验、错误映射   │
└──────────────────────┬──────────────────────┘
                       │ 调用用例，不直接写 SQL
┌──────────────────────▼──────────────────────┐
│ Application 层                               │
│ CreateFocus / CompleteAction / ExportData... │
└──────────────────────┬──────────────────────┘
                       │ 依赖领域规则和仓储接口
┌──────────────────────▼──────────────────────┐
│ Domain 层                                    │
│ 实体、校验、状态转换、不变量、匹配策略        │
└──────────────────────┬──────────────────────┘
                       │ Repository ports
┌──────────────────────▼──────────────────────┐
│ Infrastructure 层                            │
│ SQLite / Drizzle / Session / File Export       │
└─────────────────────────────────────────────┘
```

依赖方向只能由上到下：

- Web UI 不直接依赖 SQLite，也不包含业务写入规则。
- API 层负责认证、输入校验、调用用例和 HTTP 响应，不承载业务状态转换。
- Domain 不依赖 React、Fastify、浏览器 API 或数据库。
- Application 通过接口依赖 Infrastructure，不导入 Drizzle 或具体 SQL 实现。
- Infrastructure 负责 SQLite、会话、序列化和文件下载等外部能力。

## 4. 推荐目录

```text
apps/
├── web/                    # React 页面、路由、API client
│   └── src/features/       # login、setup、today、close、settings
└── api/                    # Fastify 启动、路由和服务端装配
    └── src/
        ├── http/           # routes、hooks、错误映射
        ├── application/    # 用例编排
        ├── domain/         # 纯业务规则
        └── infrastructure/ # SQLite、会话、导出
packages/
├── contracts/              # API 输入输出 Schema 和类型
└── shared/                 # 仅放稳定且真正跨应用复用的能力
db/
└── migrations/             # SQLite 迁移
```

不要一开始建立通用 `utils` 大杂烩；只有跨两个以上领域且语义稳定的能力才进入 `shared`。

## 5. 领域模型与不变量

### 5.1 Focus

当前主线。MVP 对每个用户同时只能有一条 `active` 主线。

```text
Focus {
  id: UUID
  title: string
  doneDefinition?: string
  status: active | completed | archived
  createdAt: ISODateTime
  updatedAt: ISODateTime
}
```

### 5.2 Action

当前主线下可以直接执行的行动。第一份规格只实现 `available → completed`，其他状态通过后续规格逐步加入。

```text
Action {
  id: UUID
  focusId: UUID
  title: string
  estimatedMinutes: number
  energyRequired: low | medium | high
  status: available | completed
  createdAt: ISODateTime
  updatedAt: ISODateTime
}
```

### 5.3 DailyState 与 DailyClose

两者均以账号时区下的 `YYYY-MM-DD` 为业务主键。`User.timezone` 保存唯一的 IANA 时区，日期转换统一由一个使用账号时区的 `Clock` 接口负责。

```text
DailyState {
  date: LocalDate
  energy: low | medium | high
  availableMinutes: 15 | 30 | 60
  selectedActionId?: UUID
}

DailyClose {
  date: LocalDate
  progressNote?: string
  blockerNote?: string
  nextStepNote?: string
  createdAt: ISODateTime
  updatedAt: ISODateTime
}
```

### 5.4 关键不变量

- `Focus` 的 `title` 不能为空，长度不超过 100 个字符。
- `Action` 必须关联存在的 `Focus`，且名称不能为空。
- `estimatedMinutes` 必须是 1—480 的正整数。
- 每个用户不能同时存在两条 `active` 主线。
- 完成的行动不可再出现在未完成列表中。
- 所有日期相关行为必须使用统一的账号时区 `Clock`，禁止在页面中自行拼接日期或使用设备时区覆盖业务日期。

### 5.5 后续规格实体

以下实体属于已规划规格，不进入 `SPEC-0001` 的实现：

- `Capture`：由 `SPEC-0005` 引入，独立于 Action，转换成功后保留原始捕捉记录。
- `WeeklyReview`：由 `SPEC-0006` 引入，保存用户确认后的周复盘内容，统计从原始记录实时计算。

`DailyState`、`DailyClose` 是核心 MVP 的 P0 实体；`Capture`、`WeeklyReview` 是后续规格实体。它们都通过同一套 application 和 persistence 边界接入，不在页面中直接互相依赖。服务端数据库中的每条业务记录都带 `user_id`，但领域规则通过 `UserContext` 接收身份边界，不把认证细节散落到实体内部。

## 6. 用例边界

应用层按规格提供以下边界；当前先实现 `SPEC-0008` 和 `SPEC-0001`：

| 用例 | 输入 | 输出 |
| --- | --- | --- |
| `CreateSession` | 账号、凭据 | 当前用户会话 |
| `GetCurrentUser` | 会话 | 当前用户或未登录 |
| `DeleteSession` | 会话 | 登出结果 |
| `CreateFocus` | 名称、完成标准 | 新建的 active Focus |
| `GetActiveFocus` | 无 | active Focus 或空 |
| `CreateAction` | Focus ID、名称、耗时、精力要求 | 新建的 available Action |
| `ListActions` | Focus ID、状态过滤 | 行动列表 |
| `CompleteAction` | Action ID | completed Action |
| `SetDailyState` | 日期、精力、可用时间 | 当日 DailyState |
| `ListCandidateActions` | 日期 | 符合条件的行动 |
| `SelectAction` | 日期、Action ID | 更新后的 DailyState |
| `ResolveAction` | Action ID、处理方式 | 更新后的 Action |
| `GetDailyContext` | 日期 | 当日聚合上下文 |
| `SaveDailyClose` | 日期、三个文本 | DailyClose 或空 |
| `CreateCapture` | 一句话内容、可选类型 | inbox Capture |
| `ConvertCaptureToAction` | Capture、Focus、行动属性 | Capture 和 Action |
| `GetWeeklySummary` | 周起始日期 | 事实摘要 |
| `SaveWeeklyReview` | 周期、复盘决策 | WeeklyReview 或空 |
| `ExportData` | 无 | 版本化 JSON |
| `ClearData` | 用户确认 | 清空结果 |

页面只能通过 API 调用这些用例；API 也不能绕过 Application 直接组合数据库操作。

## 7. 持久化设计

首版使用 SQLite 文件，第一条切片至少包含以下表：

- `users`：受控个人账号。
- `sessions`：HttpOnly 会话 Cookie 对应的服务端会话。
- `focuses`、`actions`：`SPEC-0001` 的业务数据。

后续规格接受后再增加：

- `daily_states`、`daily_closes`：`SPEC-0002`、`SPEC-0004`。
- `captures`：`SPEC-0005`。
- `weekly_reviews`：`SPEC-0006`。

要求：

- ID 由服务端生成，避免客户端伪造跨用户数据引用。
- 时间统一保存为 ISO 8601 字符串。
- 所有业务表包含 `user_id`，仓储查询必须带当前用户上下文。
- 写操作使用 SQLite 事务，避免主线已创建但行动写入一半的状态。
- 数据库文件无法打开或迁移失败时，服务端不得启动为“看似可用”的状态；页面显示可理解的错误。
- 认证使用服务端会话和 HttpOnly Cookie；MVP 不使用浏览器保存的 JWT。
- JSON 导出包含 `schemaVersion`，为未来迁移保留入口。
- MVP 不实现导入，避免把外部脏数据处理带入首轮范围。

完整 MVP 的业务数据表规划如下：

| 阶段 | 数据表 | 来源规格 |
| --- | --- | --- |
| 身份基础 | `users`、`sessions` | `SPEC-0008` |
| 第一切片 | `focuses`、`actions` | `SPEC-0001` |
| 核心 MVP | `daily_states`、`daily_closes` | `SPEC-0002`、`SPEC-0004` |
| P1 | `captures` | `SPEC-0005` |
| 后续验证 | `weekly_reviews` | `SPEC-0006` |

`SPEC-0007` 的导出和清空覆盖当前用户已经存在的所有业务表；尚未启用的表在导出中输出空数组。

SQLite 数据库文件必须放在服务端持久化目录，不能提交到 Git，也不能部署到会被重建的临时磁盘。MVP 只运行一个 API 实例；多实例、高并发和独立数据库服务属于后续评估范围。

## 8. 页面与路由

| 路由 | 页面 | 进入条件 |
| --- | --- | --- |
| `/login` | 登录 | 未建立有效会话 |
| `/setup` | 当前主线和行动创建 | 没有 active Focus，或用户主动进入 |
| `/today` | 状态、行动列表、当前行动 | 默认入口 |
| `/close` | 日终收束 | 用户主动进入，或今日有行动结果 |
| `/settings` | 导出、清空数据 | 用户主动进入 |

如果用户没有 active Focus，访问 `/today` 时引导到 `/setup`；不创建空的默认主线。

API 统一使用 `/api` 前缀，第一批资源边界如下：

- `POST /api/auth/login`、`GET /api/auth/me`、`POST /api/auth/logout`。
- `GET /api/focuses/active`、`POST /api/focuses`、`GET/POST /api/actions`、`POST /api/actions/:id/complete`。
- `GET/PUT /api/daily-state/:date`、`GET/PUT /api/daily-close/:date`。
- `GET /api/data/export`、`DELETE /api/data`。

## 9. 错误处理

领域层使用可判断的错误类型，页面将其转换为用户语言：

- `ValidationError`：字段填写不合法，定位到对应字段。
- `NotFoundError`：目标数据不存在，提示刷新或返回列表。
- `InvariantError`：数据关系不满足规则，阻止写入并记录开发错误。
- `UnauthorizedError`：没有有效会话，跳转登录。
- `ForbiddenError`：无权访问目标数据，不泄露其他用户数据。
- `ConflictError`：并发或唯一性约束冲突，提示重新读取。
- `PersistenceError`：数据库或网络失败，明确提示数据未保存。

不能用空 catch、静默失败或“保存中”状态掩盖写入失败。

## 10. 测试策略

### 单元测试

覆盖领域校验、状态转换、active 主线唯一性和日期工具。测试不依赖浏览器或真实部署数据库。

### 集成测试

使用临时 SQLite 数据库验证仓储实现、用户隔离、事务、刷新后的恢复和导出内容。

### 端到端测试

至少覆盖：

1. 首次进入 → 创建主线 → 创建行动。
2. 刷新页面 → 主线和行动仍然存在。
3. 完成行动 → 行动进入已完成列表。
4. 空状态和非法输入有明确反馈。
5. 登录用户只能看到自己的数据，登出后业务 API 不可访问。

## 11. 隐私边界

MVP 使用明确受控的网络数据通道：

- 需要最小身份验证，服务端按用户隔离数据。
- 浏览器通过 HTTPS API 发送主线、行动、状态和收束记录。
- 生产环境必须使用安全 Cookie 和 HTTPS。
- 不引入 AI 调用。
- 不使用第三方分析记录用户输入内容。
- 导出和清空数据都由用户主动触发。

如果未来加入离线同步、开放注册、团队协作或 AI，必须新增架构决策和对应 SDD 规格，不能直接扩展现有实现。

## 12. 进入开发的前置条件

本架构仍是 `Proposed`。开始实现前需要确认：

- 采用 React + TypeScript + Vite 的技术基线。
- 采用 Node.js + TypeScript + Fastify + SQLite + Drizzle 的服务端基线。
- `SPEC-0008` 的身份和用户隔离边界可以作为服务端基础规格。
- `SPEC-0001` 的字段和验收场景可以作为第一条业务实现规格。

## 13. 规格到技术模块的落位

| 规格 | Domain | Application | Infrastructure | UI |
| --- | --- | --- | --- | --- |
| `SPEC-0008` | 身份凭据、会话边界 | 登录、当前用户、登出 | User/Session 仓储、会话存储 | Login、路由守卫 |
| `SPEC-0001` | Focus、Action、校验、完成转换 | 创建/读取主线、创建/列表/完成行动 | Focus/Action SQLite 仓储 | Setup、Today |
| `SPEC-0002` | 精力等级、时间匹配、候选排序 | 保存状态、列候选、选择行动 | DailyState SQLite 仓储、Clock | Today 状态面板 |
| `SPEC-0003` | 行动状态机、到期判断 | 延后、拆小、放弃、卡住、恢复、显式激活 | Action 扩展 SQLite 仓储 | Today 行动处理菜单 |
| `SPEC-0004` | 账号时区日期、文本校验 | 日上下文、收束 upsert/delete | DailyClose SQLite 仓储 | Daily Close |
| `SPEC-0005` | Capture 状态和类型 | 捕捉、类型更新、转换、归档、删除 | Capture SQLite 仓储、事务 | 全局捕捉入口、Inbox |
| `SPEC-0006` | 周边界、复盘字段校验 | 周摘要、复盘 upsert | WeeklyReview SQLite 仓储 | Review |
| `SPEC-0007` | 导出 payload 校验 | 导出、清空 | JSON 序列化、事务清空 | Settings |

## 14. 核心流程时序

### 14.1 打开今日页面

```text
TodayRoute
  → API Client: GET /api/today
  → API Hook: 校验会话和日期
  → GetDailyContext(UserContext, today)
  → 读取 SQLite
  → 返回 TodayViewModel
```

到期行动激活仍然是显式命令，由 Application 在 `SPEC-0003` 启用后调用，并使用当前用户的账号时区；普通查询不修改数据。第一切片尚未启用延期状态时，该步骤不装配。

### 14.2 完成今日选中行动

```text
CompleteAction(actionId)
  → API 校验会话和输入
  → Application 读取当前用户的 Action
  → Domain 校验 Action 状态
  → SQLite 事务更新 Action = completed
  → 如果 DailyState.selectedActionId == actionId，则清除选择
  → 返回最新状态
```

在 `SPEC-0001` 单独实现时，只有前两步；`SPEC-0002` 接入后增加选择清理。`SPEC-0003` 接入后，完成、延后、卡住和放弃都必须清理离开 `available` 行动的选择，避免留下悬空 ID；拆小行动保持选择。

### 14.3 Capture 转 Action

```text
ConvertCaptureToAction
  → API 校验会话
  → 校验当前用户的 Capture = inbox
  → 校验 active Focus 和 Action 输入
  → 创建 Action
  → 更新 Capture = converted
  → 保存 convertedActionId
  → SQLite 同一事务提交
```

转换的两个写入必须原子成功；任一失败都保留原始 inbox Capture。

## 15. 仓储接口与事务边界

Domain 只定义实体和规则，Application 依赖仓储端口：

```typescript
interface FocusRepository {
  getActive(userId: string): Promise<Focus | null>;
  create(userId: string, focus: Focus): Promise<void>;
}

interface ActionRepository {
  getById(userId: string, id: string): Promise<Action | null>;
  listByFocus(userId: string, focusId: string, status?: ActionStatus): Promise<Action[]>;
  create(userId: string, action: Action): Promise<void>;
  update(userId: string, action: Action): Promise<void>;
}

interface DailyStateRepository {
  get(userId: string, date: LocalDate): Promise<DailyState | null>;
  save(userId: string, state: DailyState): Promise<void>;
}
```

实际的 SQLite/Drizzle 仓储实现不得向 Web UI 暴露。以下操作必须具备事务边界：

- 创建主线时检查 active 唯一性。
- 完成行动并清理当日选择。
- 到期行动批量激活。
- Capture 转 Action。
- 清空当前用户所有业务表。

## 16. 前端状态管理

MVP 不引入 Redux 等全局状态库。状态分三类：

- 服务端/持久化状态：由 API 查询，页面在写入成功后重新读取。
- 页面状态：表单输入、弹窗、加载和错误状态，留在 feature 页面内部。
- 派生状态：候选行动、未完成列表和空状态由查询结果计算，不单独持久化。

每个 feature 使用统一的状态结构：

```text
idle → loading → ready
              ↘ error
ready → saving → ready
              ↘ error
```

写操作成功前不乐观更新核心数据；成功后用 API 返回值或重新查询刷新页面，避免本地显示与 SQLite 不一致。

## 17. 工程与测试结构

推荐工程脚本：

```text
dev       启动本地开发服务器
build     类型检查并构建 Web 和 API
test      运行 Domain、Application 和 API 单元测试
test:db   运行 SQLite 仓储集成测试
test:e2e  运行 Playwright 核心流程
db:migrate 执行数据库迁移
lint      检查代码质量
```

测试分层与规格保持一致：

```text
Domain 单元测试
  → Application 用例测试（内存仓储）
    → API / Infrastructure 集成测试（临时 SQLite）
      → Playwright 用户流程测试
```

禁止用端到端测试代替领域规则测试；也禁止只测 repository 而不验证完整用户场景。

## 18. 架构边界与未来演进

首版明确不创建以下模块：

- API Gateway、微服务拆分和多服务编排。
- `sync/`、冲突解决和离线同步队列。
- `ai/`、提示词编排和外部模型调用。
- `analytics/`、收集用户正文的行为分析。
- `event-store/`、ActionEvent 和事件溯源。

未来只有在对应需求被验证后，才通过新增 ADR 和 SPEC 引入这些边界。后端已经是服务端事实源，未来离线能力应通过明确的缓存、队列和冲突策略扩展，不能让 UI 同时读写两套事实源。

## 19. 架构评审通过条件

- [ ] 确认响应式 Web 单体作为 MVP 形态。
- [ ] 确认 React + TypeScript + Vite + Fastify + SQLite + Drizzle 技术基线。
- [ ] 确认服务端持久化、最小身份验证和当前用户数据隔离。
- [ ] 确认账号时区是所有日/周边界的唯一业务依据。
- [ ] 确认 Action 离开 `available` 时按规格清理 `DailyState.selectedActionId`。
- [ ] 确认 Web UI / API / Application / Domain / Infrastructure 依赖方向。
- [ ] 确认 `SPEC-0008`、`SPEC-0001`～`SPEC-0004` 加 `SPEC-0007` 为 MVP 交付范围。
- [ ] 确认 `SPEC-0005` 为 P1，`SPEC-0006` 等真实数据验证后再决定。
