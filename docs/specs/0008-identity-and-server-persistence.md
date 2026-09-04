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
- `timezone`：必填的 IANA 时区标识，例如 `Asia/Shanghai`。
- `createdAt`：ISO 8601 时间。

### Session

- `id`：服务端会话记录的内部 UUID，不直接作为 Cookie 值。
- `tokenHash`：服务端保存的会话 Token 摘要，不返回客户端。
- `userId`：所属用户。
- `expiresAt`：过期时间。
- `createdAt`：创建时间。

浏览器 Cookie 保存原始随机 Token；原始 Token 不进入业务实体和数据库。

所有业务表都必须包含 `userId`。仓储接口使用当前用户上下文查询和写入，不能接受只包含资源 ID 的无边界查询。

## 4. 领域与 API 规则

- 未登录访问业务 API 返回 `401 Unauthorized`。
- 已登录用户只能读取和修改自己的数据。
- 访问其他用户资源时不泄露资源是否存在，统一按资源不存在处理。
- 登录成功后创建服务端 Session，并设置 `HttpOnly`、`Secure`、`SameSite` Cookie；本地开发允许关闭 `Secure`。
- 退出登录后立即使当前 Session 失效。
- API 输入在 HTTP 边界使用 Schema 校验，业务不变量仍由 Domain 和 Application 负责。
- 数据库连接和迁移未就绪时，服务端不得假装业务数据已经保存。
- 所有“今天”、延期到期和周边界计算都使用当前用户账号的 `timezone`，不使用服务器时区或设备时区直接决定业务日期。

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

初始账号不是公开 HTTP API，而是受控运维命令：

```typescript
provisionInitialAccount(input: {
  email: string;
  password: string;
  timezone: string;
}): Promise<User>;
```

只有数据库中还没有用户时允许执行；重复执行或已有用户时拒绝且不修改数据。

## 6. 验收场景

### 场景 A：初始化受控账号

```gherkin
Given 数据库中还没有任何用户
When 运维人员通过受控命令提交邮箱、密码和 IANA 时区
Then 系统创建一个用户账号
And 系统只保存密码摘要
And 系统保存该用户的时区
And 不提供公开注册入口
```

### 场景 B：重复初始化被拒绝

```gherkin
Given 数据库中已经存在一个用户
When 运维人员再次执行初始账号命令
Then 系统拒绝创建
And 已有用户和数据不发生变化
```

### 场景 C：登录成功

```gherkin
Given 系统已存在一个受控用户账号
When 用户提交正确的账号和密码
Then 系统创建有效 Session
And 浏览器保存 HttpOnly 会话 Cookie
And 用户进入今日页面
```

### 场景 D：登录失败

```gherkin
Given 用户提交了错误的账号或密码
When 系统处理登录请求
Then 系统返回登录失败
And 不创建有效 Session
And 页面不泄露是账号不存在还是密码错误
```

### 场景 E：未登录不能访问业务数据

```gherkin
Given 浏览器没有有效 Session
When 用户请求任一业务 API
Then API 返回 401
And 页面引导用户登录
```

### 场景 F：业务数据按用户隔离

```gherkin
Given 用户 A 和用户 B 都拥有业务数据
When 用户 A 请求主线、行动或日记录
Then 系统只返回用户 A 的数据
And 用户 A 不能通过修改资源 ID 读取用户 B 的数据
```

### 场景 G：刷新和跨设备访问

```gherkin
Given 用户已经登录并创建了主线和行动
When 用户刷新页面或在另一台设备登录同一账号
Then 系统展示相同的服务端数据
```

### 场景 H：退出登录

```gherkin
Given 用户拥有有效 Session
When 用户点击退出登录
Then 当前 Session 失效
And 后续业务 API 返回 401
And 页面回到登录状态
```

### 场景 I：启动阶段数据库不可用

```gherkin
Given SQLite 数据库文件不可打开
When 服务端启动
Then 服务端拒绝启动并记录安全的诊断信息
And 不提供看似可用但无法保存数据的页面
```

### 场景 J：运行阶段数据库不可用

```gherkin
Given 服务端已经启动但 SQLite 在处理请求时暂时不可用
When 用户尝试读取或保存业务数据
Then API 返回服务暂不可用
And 页面提示服务暂不可用或数据未保存
And 页面不得伪造成功状态
```

### 场景 K：跨设备业务日期一致

```gherkin
Given 同一用户的账号时区为 Asia/Shanghai
And 用户在不同时区的两台设备上登录
When 两台设备请求今日或周复盘数据
Then 系统都按 Asia/Shanghai 计算业务日期和周边界
And 不因设备时区不同而产生两套“今天”
```

## 7. 技术实现与测试

- `apps/api/src/http/auth`：登录、当前用户、退出路由和会话 Hook。
- `apps/api/src/application/identity`：认证用例和 `UserContext` 装配。
- `apps/api/src/infrastructure/persistence`：User、Session 和业务仓储的 SQLite 实现。
- `db:seed` 或等价的受控命令：初始化第一个个人账号，不暴露为公开路由。
- 使用密码摘要算法保存密码，禁止保存明文密码。
- 使用数据库迁移创建 `users`、`sessions` 及业务表；测试环境使用临时 SQLite 文件。
- 使用账号时区驱动统一 `Clock`，覆盖跨设备和跨周边界测试。
- API 单元测试覆盖成功、失败、401 和 Cookie 行为。
- 集成测试覆盖会话失效、用户隔离、数据库事务和连接失败。
- Playwright 覆盖登录、刷新、登出和核心业务 API 受保护流程。

## 8. Definition of Done

- [ ] 本规格状态已进入 `Accepted` 后才开始实现。
- [ ] 登录、当前用户和退出接口完成并有自动化测试。
- [ ] 初始账号命令可用、幂等失败且不开放公开注册。
- [ ] 所有业务仓储查询都绑定当前用户上下文。
- [ ] 账号时区已定义，所有日/周边界使用同一规则。
- [ ] 密码不以明文保存，Session 不通过可读 Cookie 暴露。
- [ ] 刷新或另一台设备登录后可以恢复服务端数据。
- [ ] 未登录、越权和数据库不可用都有准确反馈。
- [ ] 没有引入公开注册、团队权限或离线同步。
