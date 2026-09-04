# SPEC-0008 身份与服务端数据边界

> 状态：Proposed
> 对应 PRD：服务端边界
> 依赖：无
> 目标：建立最小身份验证、用户数据隔离和服务端持久化能力，为其他业务规格提供可靠运行基础。

## 1. 用户目标

用户可以使用受控的个人账号登录 LifeKernelOS。登录后创建的主线、行动和日记录保存在服务端，在支持的不同设备上仍然可以访问；用户退出后，其他人不能访问这些数据。

## 2. 范围

### In scope

- 使用账号和密码登录。
- 使用服务端会话保持登录状态。
- 获取当前登录用户信息。
- 主动退出登录并使当前会话失效。
- 所有业务数据按当前用户隔离。
- 服务端使用 SQLite 文件持久化用户和业务数据。
- 数据库迁移、连接失败和未登录状态有明确错误。

### Out of scope

- 公开注册、邮箱验证和密码找回。
- OAuth、企业单点登录和多因素认证。
- 团队、组织、角色和权限管理。
- 离线编辑、同步队列和冲突解决。
- 用户注销、跨账号数据转移和管理员后台。

首版采用受控个人账号：账号由部署初始化或受控方式创建，不开放公开注册入口。

## 3. 数据模型

### User

- `id`：UUID，服务端生成。
- `email`：必填，规范化后唯一。
- `passwordHash`：服务端密码摘要，不返回客户端。
- `createdAt`：ISO 8601 时间。

### Session

- `id`：高熵随机值，只以 HttpOnly Cookie 形式交给浏览器。
- `userId`：所属用户。
- `expiresAt`：过期时间。
- `createdAt`：创建时间。

所有业务表都必须包含 `userId`。仓储接口使用当前用户上下文查询和写入，不能接受只包含资源 ID 的无边界查询。

## 4. 领域与 API 规则

- 未登录访问业务 API 返回 `401 Unauthorized`。
- 已登录用户只能读取和修改自己的数据。
- 访问其他用户资源时不泄露资源是否存在，统一按资源不存在处理。
- 登录成功后创建服务端 Session，并设置 `HttpOnly`、`Secure`、`SameSite` Cookie；本地开发允许关闭 `Secure`。
- 退出登录后立即使当前 Session 失效。
- API 输入在 HTTP 边界使用 Schema 校验，业务不变量仍由 Domain 和 Application 负责。
- 数据库连接和迁移未就绪时，服务端不得假装业务数据已经保存。

## 5. API 契约

```typescript
POST /api/auth/login
  input: { email: string; password: string }
  output: { user: { id: string; email: string } }

GET /api/auth/me
  output: { user: { id: string; email: string } } | 401

POST /api/auth/logout
  output: { success: true }
```

业务 API 不接受客户端传入的 `userId` 作为所有权依据，统一从当前 Session 解析 `UserContext`。

## 6. 验收场景

### 场景 A：登录成功

```gherkin
Given 系统已存在一个受控用户账号
When 用户提交正确的账号和密码
Then 系统创建有效 Session
And 浏览器保存 HttpOnly 会话 Cookie
And 用户进入今日页面
```

### 场景 B：登录失败

```gherkin
Given 用户提交了错误的账号或密码
When 系统处理登录请求
Then 系统返回登录失败
And 不创建有效 Session
And 页面不泄露是账号不存在还是密码错误
```

### 场景 C：未登录不能访问业务数据

```gherkin
Given 浏览器没有有效 Session
When 用户请求任一业务 API
Then API 返回 401
And 页面引导用户登录
```

### 场景 D：业务数据按用户隔离

```gherkin
Given 用户 A 和用户 B 都拥有业务数据
When 用户 A 请求主线、行动或日记录
Then 系统只返回用户 A 的数据
And 用户 A 不能通过修改资源 ID 读取用户 B 的数据
```

### 场景 E：刷新和跨设备访问

```gherkin
Given 用户已经登录并创建了主线和行动
When 用户刷新页面或在另一台设备登录同一账号
Then 系统展示相同的服务端数据
```

### 场景 F：退出登录

```gherkin
Given 用户拥有有效 Session
When 用户点击退出登录
Then 当前 Session 失效
And 后续业务 API 返回 401
And 页面回到登录状态
```

### 场景 G：数据库不可用

```gherkin
Given SQLite 数据库文件不可打开
When 用户尝试读取或保存业务数据
Then 页面提示服务暂不可用或数据未保存
And 页面不得伪造成功状态
```

## 7. 技术实现与测试

- `apps/api/src/http/auth`：登录、当前用户、退出路由和会话 Hook。
- `apps/api/src/application/identity`：认证用例和 `UserContext` 装配。
- `apps/api/src/infrastructure/persistence`：User、Session 和业务仓储的 SQLite 实现。
- 使用密码摘要算法保存密码，禁止保存明文密码。
- 使用数据库迁移创建 `users`、`sessions` 及业务表；测试环境使用临时 SQLite 文件。
- API 单元测试覆盖成功、失败、401 和 Cookie 行为。
- 集成测试覆盖会话失效、用户隔离、数据库事务和连接失败。
- Playwright 覆盖登录、刷新、登出和核心业务 API 受保护流程。

## 8. Definition of Done

- [ ] 本规格状态已进入 `Accepted` 后才开始实现。
- [ ] 登录、当前用户和退出接口完成并有自动化测试。
- [ ] 所有业务仓储查询都绑定当前用户上下文。
- [ ] 密码不以明文保存，Session 不通过可读 Cookie 暴露。
- [ ] 刷新或另一台设备登录后可以恢复服务端数据。
- [ ] 未登录、越权和数据库不可用都有准确反馈。
- [ ] 没有引入公开注册、团队权限或离线同步。
