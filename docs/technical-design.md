# LifeKernelOS MVP 详细技术设计

> 版本：0.1
> 状态：Proposed
> 更新时间：2026-09-04
> 适用范围：`SPEC-0008`、`SPEC-0001`
> 上游文档：[architecture.md](architecture.md)、[SDD.md](SDD.md)

## 1. 设计目标

本设计只服务第一条可运行纵向切片：

```text
受控账号登录 → 创建当前主线 → 创建行动 → 查看行动 → 完成行动 → 刷新后恢复
```

本设计要解决四件事：

1. 服务端保存数据，浏览器刷新或更换设备后仍能恢复。
2. 用户身份和业务数据严格隔离。
3. Domain 和 Application 可以脱离 HTTP、SQLite 和 React 独立测试。
4. 本地开发和单实例部署足够简单，不提前引入微服务和复杂同步。

## 2. 运行拓扑

MVP 使用一个 Fastify 进程和一个 SQLite 数据文件：

```text
┌──────────────────────┐
│ 浏览器                │
│ React + Vite          │
└──────────┬───────────┘
           │ HTTPS / JSON API
┌──────────▼───────────┐
│ Fastify API 进程      │
│ Auth / Routes         │
│ Application / Domain  │
└──────────┬───────────┘
           │ Drizzle + better-sqlite3
┌──────────▼───────────┐
│ SQLite 文件           │
│ data/lifekernel.sqlite│
└──────────────────────┘
```

生产环境中，Fastify 可以同时提供 `web` 构建后的静态资源和 `/api` 接口。SQLite 文件必须位于持久化磁盘；MVP 只运行一个 API 实例。

## 3. 工程结构

```text
.
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── server.ts              # 进程入口
│   │       ├── app.ts                 # Fastify 实例和插件装配
│   │       ├── config.ts              # 环境变量解析
│   │       ├── http/
│   │       │   ├── plugins/
│   │       │   │   ├── auth.ts        # UserContext 注入
│   │       │   │   └── errors.ts       # 错误到 HTTP 响应映射
│   │       │   └── routes/
│   │       │       ├── auth.ts
│   │       │       ├── focuses.ts
│   │       │       └── actions.ts
│   │       ├── application/
│   │       │   ├── identity/
│   │       │   ├── focus/
│   │       │   └── action/
│   │       ├── domain/
│   │       │   ├── focus/
│   │       │   └── action/
│   │       └── infrastructure/
│   │           ├── db/
│   │           │   ├── client.ts
│   │           │   ├── schema.ts
│   │           │   └── migrations.ts
│   │           ├── repositories/
│   │           ├── auth/
│   │           └── export/
│   └── web/
│       └── src/
│           ├── app/
│           │   ├── router.tsx
│           │   └── session.ts
│           ├── api/
│           │   ├── client.ts
│           │   ├── auth.ts
│           │   ├── focuses.ts
│           │   └── actions.ts
│           └── features/
│               ├── login/
│               ├── setup/
│               └── today/
├── packages/
│   └── contracts/                     # API Schema、DTO 和错误码
├── db/
│   └── migrations/                    # Drizzle 生成和审核后的迁移
├── data/                              # 运行时 SQLite 文件，不提交 Git
├── drizzle.config.ts
└── package.json
```

依赖规则：

```text
web → contracts
api/http → contracts
api/http → application → domain
application → repository ports
infrastructure → Drizzle / better-sqlite3 / Node API
```

`web` 不导入 `apps/api/src/infrastructure`；`domain` 不导入 Fastify、Drizzle、SQLite 或 React。

## 4. 技术组件职责

### 4.1 Fastify

Fastify 是 HTTP 服务框架，负责：

- 注册 `/api` 路由。
- 解析请求和响应。
- 注册认证、错误处理和日志插件。
- 在生产环境提供 Web 构建资源。

Fastify 的插件或 Hook 可以做身份注入，但不能在其中实现 Focus 或 Action 的业务规则。

### 4.2 Drizzle

Drizzle 是 TypeScript 数据库访问层，不是 HTTP 中间件。它负责：

- 用 TypeScript 定义 SQLite 表结构。
- 提供类型安全的查询和事务调用。
- 配合 Drizzle Kit 管理迁移。

它不负责登录、路由、业务规则或数据库进程。调用链固定为：

```text
Fastify → Application → Repository → Drizzle → better-sqlite3 → SQLite
```

### 4.3 better-sqlite3

`better-sqlite3` 是 Node.js 使用 SQLite 文件的驱动。它只出现在 Infrastructure 层，Application 和 Domain 不感知具体驱动。

### 4.4 SQLite

SQLite 是服务端的持久化事实源，不是前端缓存。MVP 开启外键、事务和 WAL；数据库文件使用持久化目录，并通过导出和部署备份保护数据。

## 5. SQLite 数据设计

第一条迁移只创建 `users`、`sessions`、`focuses`、`actions` 四张表，不提前创建后续规格的表。

### 5.1 users

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `id` | `text` | UUID 主键，服务端生成 |
| `email` | `text` | 非空、规范化后唯一 |
| `password_hash` | `text` | 非空，不返回客户端 |
| `created_at` | `text` | 非空，UTC ISO 8601 |

### 5.2 sessions

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `id` | `text` | 随机值摘要后的主键 |
| `user_id` | `text` | 外键 `users.id`，级联删除 |
| `expires_at` | `text` | 非空，UTC ISO 8601 |
| `created_at` | `text` | 非空，UTC ISO 8601 |

浏览器 Cookie 保存原始随机 Session Token，数据库只保存 Token 的摘要。数据库泄露时，不能直接使用表中的值伪造会话。

### 5.3 focuses

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `id` | `text` | UUID 主键 |
| `user_id` | `text` | 非空，外键 `users.id` |
| `title` | `text` | 非空，1—100 字符 |
| `done_definition` | `text` | 可空，最多 500 字符 |
| `status` | `text` | `active` / `completed` / `archived` |
| `created_at` | `text` | 非空，UTC ISO 8601 |
| `updated_at` | `text` | 非空，UTC ISO 8601 |

迁移创建以下约束：

```sql
CREATE UNIQUE INDEX focuses_one_active_per_user
ON focuses (user_id)
WHERE status = 'active';
```

### 5.4 actions

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `id` | `text` | UUID 主键 |
| `user_id` | `text` | 非空，外键 `users.id` |
| `focus_id` | `text` | 非空，必须属于同一用户的 Focus |
| `title` | `text` | 非空，1—200 字符 |
| `estimated_minutes` | `integer` | 1—480 的正整数 |
| `energy_required` | `text` | `low` / `medium` / `high` |
| `status` | `text` | `available` / `completed` |
| `created_at` | `text` | 非空，UTC ISO 8601 |
| `updated_at` | `text` | 非空，UTC ISO 8601 |

`actions` 查询必须同时按 `user_id` 和资源 ID 限定。Application 负责检查 Focus 所属用户，数据库通过外键和迁移约束兜底。

### 5.5 后续迁移

后续规格接受后再增加：

- `daily_states`、`daily_closes`：唯一键为 `user_id + date`。
- `captures`：索引为 `user_id + status + created_at`。
- `weekly_reviews`：唯一键为 `user_id + week_start`。

每条迁移都必须能在空库上执行，也必须在测试数据库上验证升级结果。

## 6. 身份和会话设计

### 6.1 账号创建

MVP 不开放注册页面。部署时通过受控脚本创建一个个人账号，密码只以交互式输入或安全的临时方式提供，服务端只保存密码摘要。

### 6.2 登录

1. `POST /api/auth/login` 接收邮箱和密码。
2. 规范化邮箱并查找用户。
3. 使用密码摘要验证凭据，失败时统一返回登录失败。
4. 生成高熵随机 Token，数据库保存 Token 摘要。
5. 设置 `HttpOnly`、`SameSite=Lax` Cookie；生产环境增加 `Secure`。
6. 返回不包含密码的当前用户信息。

### 6.3 请求身份

认证 Hook 从 Cookie 解析 Session：

```typescript
type UserContext = {
  userId: string;
  sessionId: string;
};
```

受保护路由必须先获得 `UserContext`。业务 Application 用例接收它或接收其中的 `userId`，禁止从请求 Body 接受 `userId` 作为所有权依据。

### 6.4 安全边界

- 修改数据的请求检查 `Origin`，不开放跨域写入。
- Session 过期或不存在时返回 `401`，并清理无效 Cookie。
- 登录失败不区分“邮箱不存在”和“密码错误”。
- 日志只记录请求 ID、路由、状态码和耗时，不记录密码、Cookie 或用户正文。
- MVP 不做公开注册、密码找回、OAuth、团队权限和多因素认证。

## 7. Repository 接口

Repository 是 Application 和 SQLite 之间的端口。所有方法都显式接收 `userId`，避免出现无用户边界的查询。

```typescript
interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(userId: string): Promise<User | null>;
}

interface SessionRepository {
  create(session: Session): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<Session | null>;
  deleteById(sessionId: string): Promise<void>;
}

interface FocusRepository {
  getActive(userId: string): Promise<Focus | null>;
  create(userId: string, focus: Focus): Promise<void>;
}

interface ActionRepository {
  getById(userId: string, actionId: string): Promise<Action | null>;
  listByFocus(userId: string, focusId: string, status?: ActionStatus): Promise<Action[]>;
  create(userId: string, action: Action): Promise<void>;
  update(userId: string, action: Action): Promise<void>;
}
```

Repository 不返回 Drizzle Row 类型，统一映射为 Domain 类型，避免数据库字段命名扩散到业务层。

## 8. Application 用例

### 8.1 Identity

- `Login`：校验凭据并创建 Session。
- `GetCurrentUser`：解析并验证当前 Session。
- `Logout`：删除当前 Session。

### 8.2 Focus

- `CreateFocus(userContext, input)`：校验字段，创建 active Focus；唯一性由 Domain 和 SQLite 共同保护。
- `GetActiveFocus(userContext)`：读取当前用户 active Focus。

### 8.3 Action

- `CreateAction(userContext, input)`：校验输入，确认 Focus 属于当前用户，创建 available Action。
- `ListActions(userContext, focusId, status?)`：只读取当前用户指定 Focus 的行动。
- `CompleteAction(userContext, actionId)`：校验归属和状态，幂等地完成行动。

Application 负责用例编排；Domain 负责字段校验和状态转换；Repository 负责存取。三者不合并成一个“万能 Service”。

## 9. API 设计

### 9.1 统一响应

成功时直接返回资源或结果对象；失败时使用统一结构：

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "请检查输入",
    "fields": {
      "title": "主线名称不能为空"
    }
  }
}
```

`message` 是可直接展示或进一步映射的安全文案，不包含 SQL、文件路径、密码或堆栈。

### 9.2 第一批 API

| 方法 | 路径 | 说明 | 未登录 |
| --- | --- | --- | --- |
| `POST` | `/api/auth/login` | 创建会话 | 允许 |
| `GET` | `/api/auth/me` | 获取当前用户 | 返回 `401` |
| `POST` | `/api/auth/logout` | 删除当前会话 | 返回成功 |
| `GET` | `/api/focuses/active` | 获取当前主线 | `401` |
| `POST` | `/api/focuses` | 创建当前主线 | `401` |
| `GET` | `/api/actions?focusId=&status=` | 查询行动 | `401` |
| `POST` | `/api/actions` | 创建行动 | `401` |
| `POST` | `/api/actions/:id/complete` | 完成行动 | `401` |

### 9.3 请求示例

```json
POST /api/focuses
{
  "title": "完成 LifeKernelOS 第一版",
  "doneDefinition": "可以创建、查看和完成下一步行动"
}
```

```json
POST /api/actions
{
  "focusId": "focus-uuid",
  "title": "写出第一个 API 用例",
  "estimatedMinutes": 30,
  "energyRequired": "medium"
}
```

### 9.4 HTTP 状态映射

| 领域结果 | HTTP | 错误码 |
| --- | --- | --- |
| 输入不合法 | `400` | `VALIDATION_ERROR` |
| 没有会话 | `401` | `UNAUTHENTICATED` |
| 资源不存在或不属于当前用户 | `404` | `RESOURCE_NOT_FOUND` |
| active Focus 已存在 | `409` | `ACTIVE_FOCUS_EXISTS` |
| 数据库不可用 | `503` | `PERSISTENCE_UNAVAILABLE` |
| 未预期错误 | `500` | `INTERNAL_ERROR` |

## 10. 事务边界

### 创建主线

```text
BEGIN
  校验当前用户
  校验标题
  INSERT focuses
  若唯一约束冲突，转换为 ACTIVE_FOCUS_EXISTS
COMMIT
```

### 创建行动

```text
BEGIN
  读取当前用户的 Focus
  校验行动输入
  INSERT actions
COMMIT
```

Focus 不存在、归属不匹配或写入失败时全部回滚。

### 完成行动

```text
BEGIN
  读取当前用户的 Action
  available → completed
  completed → completed（幂等返回）
  其他状态拒绝
COMMIT
```

`SPEC-0002` 接入后，清理 `DailyState.selectedActionId` 的动作加入同一事务；在 `SPEC-0001` 阶段不提前创建 DailyState。

## 11. 前端调用设计

### 11.1 API Client

`apps/web/src/api/client.ts` 统一处理：

- `/api` 前缀。
- `credentials: 'include'`。
- JSON 请求头。
- 非 2xx 响应解析为统一错误。
- `401` 通知 Session 状态并跳转 `/login`。

Feature 页面不直接使用 `fetch`，只能调用具体 API 函数：

```typescript
getActiveFocus(): Promise<Focus>;
createFocus(input: CreateFocusInput): Promise<Focus>;
createAction(input: CreateActionInput): Promise<Action>;
completeAction(actionId: string): Promise<Action>;
```

### 11.2 页面状态

每个 Feature 维护自己的远程数据和交互状态：

```text
idle → loading → ready
              ↘ error
ready → saving → ready
              ↘ error
```

核心业务写入不使用乐观更新；服务器成功后使用返回值或重新查询刷新页面。

### 11.3 路由守卫

1. 应用启动调用 `/api/auth/me`。
2. 未登录进入 `/login`。
3. 已登录访问 `/login` 时进入 `/today` 或 `/setup`。
4. `/today` 没有 active Focus 时跳转 `/setup`。

## 12. 配置和启动

### 12.1 环境变量

```text
NODE_ENV=development|test|production
PORT=3000
DATABASE_PATH=./data/lifekernel.sqlite
SESSION_TTL_DAYS=30
COOKIE_SECURE=false
WEB_DIST_PATH=apps/web/dist
```

生产环境通过部署系统注入配置，不把密码和 Cookie 密钥提交到 Git。`DATABASE_PATH` 指向持久化目录。

### 12.2 启动顺序

```text
读取并校验配置
  → 创建 SQLite 目录
  → 打开 better-sqlite3
  → 设置 foreign_keys / WAL / busy_timeout
  → 执行未完成迁移
  → 装配 Repository、Application 和 Fastify 路由
  → 检查数据库可写
  → 启动 HTTP 服务
```

任何数据库打开或迁移失败都终止启动，不允许服务进入“页面能打开但保存必失败”的状态。

### 12.3 脚本

```text
dev             同时启动 Vite 和 Fastify
build           构建 Web 并检查 API 类型
start           启动生产 Fastify 服务
db:migrate      执行 SQLite 迁移
db:seed         创建受控个人账号
test            运行 Domain / Application / API 测试
test:db         使用临时 SQLite 文件运行集成测试
test:e2e        运行 Playwright 流程
lint            运行代码质量检查
```

## 13. 测试设计

### Domain

不依赖 Fastify、SQLite 或浏览器，覆盖：

- Focus 和 Action 字段校验。
- active Focus 唯一性规则。
- Action `available → completed`。
- 完成操作幂等性。

### Application

使用内存 Repository，覆盖：

- 当前用户上下文传递。
- Focus 和 Action 关联检查。
- 不同用户不能读取或修改资源。
- Repository 错误到领域错误的转换。

### Infrastructure / API

每个测试使用独立临时 SQLite 文件，覆盖：

- 迁移可重复执行。
- 外键和 active 唯一索引。
- 登录 Cookie、Session 过期和登出。
- 同一用户数据恢复。
- 两个用户之间的数据隔离。
- 事务失败不留下半条记录。

### E2E

至少覆盖：

1. 未登录访问 `/today` → 跳转登录。
2. 登录 → 创建主线 → 创建行动。
3. 刷新页面 → 数据仍存在。
4. 完成行动 → 行动进入已完成列表。
5. 退出登录 → 业务 API 不可访问。

## 14. 第一阶段实现顺序

1. 评审并接受 `SPEC-0008`、`SPEC-0001` 和本详细设计。
2. 建立 npm workspace、TypeScript、Vite、Fastify 和测试配置。
3. 实现 SQLite 客户端、Drizzle Schema、迁移和启动自检。
4. 实现 User、Session、密码摘要和认证 API。
5. 实现 Focus、Action Domain 和 Application 用例。
6. 实现 Focus、Action SQLite Repository 和 API 路由。
7. 实现 Login、Setup、Today 页面和路由守卫。
8. 添加 Domain、API、SQLite 集成和 Playwright 测试。
9. 按 SPEC-0008、SPEC-0001 逐条验收，再进入下一规格。

## 15. 明确不做

第一阶段不创建以下代码和基础设施：

- `sync/`、离线队列和冲突解决。
- `ai/`、提示词和模型客户端。
- `team/`、组织、角色和权限矩阵。
- 公开注册、密码找回和 OAuth。
- Redis、消息队列、微服务和 Kubernetes。
- 前端直连 SQLite 或在浏览器维护第二个事实源。

## 16. 设计评审清单

- [ ] 确认 SQLite 文件位于服务端持久化目录。
- [ ] 确认 MVP 只运行一个 API 实例。
- [ ] 确认 Drizzle 只属于 Infrastructure，不进入 UI 和 Domain。
- [ ] 确认所有 Repository 方法带 `userId` 边界。
- [ ] 确认 Session Cookie 不保存明文 Token 到数据库。
- [ ] 确认第一条迁移只覆盖 `SPEC-0008` 和 `SPEC-0001`。
- [ ] 确认代码开始前 `SPEC-0008`、`SPEC-0001` 进入 `Accepted`。
