# LifeKernelOS MVP 技术架构基线

> 版本：0.1
> 状态：Proposed
> 更新时间：2026-09-04
> 对应产品文档：[PRD.md](PRD.md)

## 1. 架构目标

MVP 的技术架构只服务三个目标：

1. 让用户快速完成“当前主线 → 下一步行动 → 行动结果”的闭环。
2. 让核心业务规则可以被自动化测试，不依赖页面操作才能验证。
3. 让用户数据默认留在本地，并且未来可以在不重写业务规则的情况下替换存储方式。

架构明确不追求：微服务、复杂后端、提前设计的多端同步、插件系统和面向未来的通用平台。

## 2. 架构决策摘要

| 领域 | MVP 决策 | 原因 |
| --- | --- | --- |
| 应用形态 | 响应式 Web 单体 | 同时覆盖桌面和移动端，保持一个实现 |
| 前端 | React + TypeScript + Vite | 适合快速迭代和静态部署，不引入服务端依赖 |
| 数据存储 | 浏览器 IndexedDB + Dexie 适配器，本地优先 | 隐私边界清晰，无需账号和后端即可验证产品假设 |
| 数据访问 | 仓储接口 + IndexedDB 适配器 | 让领域和用例不依赖具体存储，未来可替换为云端 |
| 页面状态 | React 页面状态和用例服务 | MVP 数据关系简单，暂不引入全局状态库 |
| 样式 | 原生 CSS / CSS Modules | 减少 UI 工程依赖，先保证流程清晰和响应式 |
| 测试 | Vitest、React Testing Library、Playwright | 分别覆盖规则、组件交互和完整用户流程 |
| 部署 | 静态资源部署 | MVP 无后端，部署和回滚成本最低 |

详细理由记录在 [ADR-0001 本地优先](decisions/0001-local-first-mvp.md) 和 [ADR-0002 Web 技术栈](decisions/0002-web-stack.md)。

## 3. 总体结构

```text
┌─────────────────────────────────────────┐
│ UI 层                                    │
│ Setup / Today / Daily Close / Settings   │
└──────────────────┬──────────────────────┘
                   │ 调用用例，不直接读写数据库
┌──────────────────▼──────────────────────┐
│ Application 层                           │
│ CreateFocus / CreateAction / Complete... │
└──────────────────┬──────────────────────┘
                   │ 依赖抽象仓储和时钟
┌──────────────────▼──────────────────────┐
│ Domain 层                                │
│ 实体、校验、状态转换、不变量、匹配策略   │
└──────────────────┬──────────────────────┘
                   │ ports
┌──────────────────▼──────────────────────┐
│ Infrastructure 层                        │
│ IndexedDB / JSON Export / Browser Clock   │
└─────────────────────────────────────────┘
```

依赖方向只能由上到下：

- UI 不直接依赖 IndexedDB。
- Domain 不依赖 React、浏览器 API 或数据库。
- Application 通过接口依赖 Infrastructure，不导入具体数据库实现。
- Infrastructure 负责持久化、序列化和浏览器能力适配。

## 4. 推荐目录

```text
src/
├── app/                    # 应用启动、路由、依赖装配
├── domain/                 # 纯业务规则
│   ├── focus/
│   ├── action/
│   ├── daily-state/
│   └── daily-close/
├── application/            # 用例：命令、查询、错误映射
│   ├── focus/
│   ├── action/
│   └── today/
├── infrastructure/         # 外部实现
│   ├── persistence/
│   ├── export/
│   └── time/
├── features/               # 页面和交互编排
│   ├── setup/
│   ├── today/
│   ├── daily-close/
│   └── settings/
└── shared/                 # 极少量通用 UI 和基础工具
```

不要一开始建立通用 `utils` 大杂烩；只有跨两个以上领域且语义稳定的能力才进入 `shared`。

## 5. 领域模型与不变量

### 5.1 Focus

当前主线。MVP 同时只能有一条 `active` 主线。

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

两者均以用户本地日期 `YYYY-MM-DD` 为业务主键。首版不保存用户时区历史，日期转换统一由一个 `Clock` 接口负责。

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
- 不能同时存在两条 `active` 主线。
- 完成的行动不可再出现在未完成列表中。
- 所有日期相关行为必须使用统一的本地日期工具，禁止在页面中自行拼接日期。

### 5.5 后续规格实体

以下实体属于已规划规格，不进入 `SPEC-0001` 的实现：

- `Capture`：由 `SPEC-0005` 引入，独立于 Action，转换成功后保留原始捕捉记录。
- `WeeklyReview`：由 `SPEC-0006` 引入，保存用户确认后的周复盘内容，统计从原始记录实时计算。

`DailyState`、`DailyClose` 是核心 MVP 的 P0 实体；`Capture`、`WeeklyReview` 是后续规格实体。它们都通过同一套 application 和 persistence 边界接入，不在页面中直接互相依赖。

## 6. 用例边界

应用层按规格提供以下边界；当前只有 `SPEC-0001` 允许进入实现：

| 用例 | 输入 | 输出 |
| --- | --- | --- |
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

页面只能通过这些用例改变数据，不直接组合数据库操作。

## 7. 持久化设计

当前第一条切片至少包含以下 object store：

- `focuses`
- `actions`
- `metadata`：保存 `schemaVersion`

后续规格接受后再增加：

- `dailyStates`、`dailyCloses`：`SPEC-0002`、`SPEC-0004`。
- `captures`：`SPEC-0005`。
- `weeklyReviews`：`SPEC-0006`。

要求：

- ID 在客户端使用 `crypto.randomUUID()` 生成。
- 时间统一保存为 ISO 8601 字符串。
- 写操作使用事务，避免主线已创建但行动写入一半的状态。
- 数据库初始化失败时，页面显示可理解的错误，并不得假装保存成功。
- JSON 导出包含 `schemaVersion`，为未来迁移保留入口。
- MVP 不实现导入，避免把外部脏数据处理带入首轮范围。

完整 MVP 的业务数据 store 规划如下：

| 阶段 | Store | 来源规格 |
| --- | --- | --- |
| 第一切片 | `focuses`、`actions`、`metadata` | `SPEC-0001` |
| 核心 MVP | `dailyStates`、`dailyCloses` | `SPEC-0002`、`SPEC-0004` |
| P1 | `captures` | `SPEC-0005` |
| 后续验证 | `weeklyReviews` | `SPEC-0006` |

`SPEC-0007` 的导出和清空覆盖所有已经存在的 store；尚未启用的 store 在导出中输出空数组。

## 8. 页面与路由

| 路由 | 页面 | 进入条件 |
| --- | --- | --- |
| `/setup` | 当前主线和行动创建 | 没有 active Focus，或用户主动进入 |
| `/today` | 状态、行动列表、当前行动 | 默认入口 |
| `/close` | 日终收束 | 用户主动进入，或今日有行动结果 |
| `/settings` | 导出、清空数据 | 用户主动进入 |

如果用户没有 active Focus，访问 `/today` 时引导到 `/setup`；不创建空的默认主线。

## 9. 错误处理

领域层使用可判断的错误类型，页面将其转换为用户语言：

- `ValidationError`：字段填写不合法，定位到对应字段。
- `NotFoundError`：目标数据不存在，提示刷新或返回列表。
- `InvariantError`：数据关系不满足规则，阻止写入并记录开发错误。
- `PersistenceError`：浏览器存储失败，明确提示数据未保存。

不能用空 catch、静默失败或“保存中”状态掩盖写入失败。

## 10. 测试策略

### 单元测试

覆盖领域校验、状态转换、active 主线唯一性和日期工具。测试不依赖浏览器或真实 IndexedDB。

### 集成测试

使用测试数据库验证仓储实现、事务、刷新后的恢复和导出内容。

### 端到端测试

至少覆盖：

1. 首次进入 → 创建主线 → 创建行动。
2. 刷新页面 → 主线和行动仍然存在。
3. 完成行动 → 行动进入已完成列表。
4. 空状态和非法输入有明确反馈。

## 11. 隐私边界

MVP 默认没有网络数据通道：

- 不需要登录。
- 不向服务器发送主线、行动、状态和收束记录。
- 不引入 AI 调用。
- 不使用第三方分析记录用户输入内容。
- 导出和清空数据都由用户主动触发。

如果未来加入同步、账号或 AI，必须新增架构决策和对应 SDD 规格，不能直接扩展现有实现。

## 12. 进入开发的前置条件

本架构仍是 `Proposed`。开始实现前需要确认：

- 采用 React + TypeScript + Vite 的技术基线。
- 采用本地优先 IndexedDB，而非首版后端。
- `SPEC-0001` 的字段和验收场景可以作为第一条实现规格。

## 13. 规格到技术模块的落位

| 规格 | Domain | Application | Infrastructure | UI |
| --- | --- | --- | --- | --- |
| `SPEC-0001` | Focus、Action、校验、完成转换 | 创建/读取主线、创建/列表/完成行动 | Focus/Action 仓储 | Setup、Today |
| `SPEC-0002` | 精力等级、时间匹配、候选排序 | 保存状态、列候选、选择行动 | DailyState 仓储、Clock | Today 状态面板 |
| `SPEC-0003` | 行动状态机、到期判断 | 延后、拆小、放弃、卡住、恢复、显式激活 | Action 扩展仓储 | Today 行动处理菜单 |
| `SPEC-0004` | 本地日期、文本校验 | 日上下文、收束 upsert/delete | DailyClose 仓储 | Daily Close |
| `SPEC-0005` | Capture 状态和类型 | 捕捉、类型更新、转换、归档、删除 | Capture 仓储、事务 | 全局捕捉入口、Inbox |
| `SPEC-0006` | 周边界、复盘字段校验 | 周摘要、复盘 upsert | WeeklyReview 仓储 | Review |
| `SPEC-0007` | 导出 payload 校验 | 导出、清空 | 文件下载、事务清空 | Settings |

## 14. 核心流程时序

### 14.1 打开今日页面

```text
TodayRoute
  → Clock.today()
  → ActivateDueActions(today)       # SPEC-0003 已启用时显式调用
  → GetActiveFocus()
  → GetDailyState(today)
  → ListCandidateActions(today)
  → 组装 TodayViewModel
```

`ActivateDueActions` 是显式命令，普通查询不修改数据。第一切片尚未启用延期状态时，该步骤为空操作或不装配。

### 14.2 完成今日选中行动

```text
CompleteAction(actionId)
  → 校验 Action 状态
  → 更新 Action = completed
  → 如果 DailyState.selectedActionId == actionId，则清除选择
  → 提交同一事务
```

在 `SPEC-0001` 单独实现时，只有前两步；`SPEC-0002` 接入后增加选择清理，避免留下悬空 ID。

### 14.3 Capture 转 Action

```text
ConvertCaptureToAction
  → 校验 Capture = inbox
  → 校验 active Focus 和 Action 输入
  → 创建 Action
  → 更新 Capture = converted
  → 保存 convertedActionId
  → 同一事务提交
```

转换的两个写入必须原子成功；任一失败都保留原始 inbox Capture。

## 15. 仓储接口与事务边界

Domain 只定义实体和规则，Application 依赖仓储端口：

```typescript
interface FocusRepository {
  getActive(): Promise<Focus | null>;
  create(focus: Focus): Promise<void>;
}

interface ActionRepository {
  getById(id: string): Promise<Action | null>;
  listByFocus(focusId: string, status?: ActionStatus): Promise<Action[]>;
  create(action: Action): Promise<void>;
  update(action: Action): Promise<void>;
}

interface DailyStateRepository {
  get(date: LocalDate): Promise<DailyState | null>;
  save(state: DailyState): Promise<void>;
}
```

实际的 Dexie 仓储实现不得向 UI 暴露。以下操作必须具备事务边界：

- 创建主线时检查 active 唯一性。
- 完成行动并清理当日选择。
- 到期行动批量激活。
- Capture 转 Action。
- 清空所有业务 store。

## 16. 前端状态管理

MVP 不引入 Redux 等全局状态库。状态分三类：

- 服务端/持久化状态：由 application 查询，页面在写入成功后重新读取。
- 页面状态：表单输入、弹窗、加载和错误状态，留在 feature 页面内部。
- 派生状态：候选行动、未完成列表和空状态由查询结果计算，不单独持久化。

每个 feature 使用统一的状态结构：

```text
idle → loading → ready
              ↘ error
ready → saving → ready
              ↘ error
```

写操作成功前不乐观更新核心数据；成功后用返回值或重新查询刷新页面，避免本地显示与 IndexedDB 不一致。

## 17. 工程与测试结构

推荐工程脚本：

```text
dev       启动本地开发服务器
build     类型检查并构建静态资源
test      运行 Domain 和 Application 单元测试
test:db   运行 IndexedDB 仓储集成测试
test:e2e  运行 Playwright 核心流程
lint      检查代码质量
```

测试分层与规格保持一致：

```text
Domain 单元测试
  → Application 用例测试（内存仓储）
    → Infrastructure 集成测试（fake IndexedDB）
      → Playwright 用户流程测试
```

禁止用端到端测试代替领域规则测试；也禁止只测 repository 而不验证完整用户场景。

## 18. 架构边界与未来演进

首版明确不创建以下模块：

- `server/`、API Gateway、账号和鉴权服务。
- `sync/`、冲突解决和离线同步队列。
- `ai/`、提示词编排和外部模型调用。
- `analytics/`、收集用户正文的行为分析。
- `event-store/`、ActionEvent 和事件溯源。

未来只有在对应需求被验证后，才通过新增 ADR 和 SPEC 引入这些边界。云端同步的正确扩展点是新增 repository adapter 和同步策略，不是让 UI 同时读写两套数据源。

## 19. 架构评审通过条件

- [ ] 确认响应式 Web 单体作为 MVP 形态。
- [ ] 确认 React + TypeScript + Vite + Dexie 技术基线。
- [ ] 确认本地优先、无后端和 JSON 导出边界。
- [ ] 确认 Domain / Application / Infrastructure / UI 依赖方向。
- [ ] 确认 `SPEC-0001`～`SPEC-0004` 加 `SPEC-0007` 为 MVP 交付范围。
- [ ] 确认 `SPEC-0005` 为 P1，`SPEC-0006` 等真实数据验证后再决定。
