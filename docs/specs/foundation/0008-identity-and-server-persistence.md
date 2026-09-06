# SPEC-0008 身份与服务端数据边界

> 状态：Implemented
> 对应产品：[PRD v0.7](../../product/PRD.md) 数据与安全边界
> 相关设计：[系统架构](../../architecture/system-architecture.md#5-应用边界)
> 依赖：无
> 文档分区：Foundation
> 目标：建立最小身份验证、用户数据隔离和服务端持久化能力。

## 1. 用户问题

用户需要在受控个人账号下可靠保存自己的目标、行动和画像记录，并在支持的设备上读取；退出后不能被其他人访问。

## 2. 范围

### In scope

- 使用账号和密码登录、获取当前用户和退出登录。
- 使用服务端 Session 保持登录状态。
- 所有业务数据按当前用户隔离。
- 服务端使用 SQLite 文件持久化用户和业务数据。
- 数据库迁移、连接失败和未登录状态有准确错误反馈。

### Out of scope

- 公开注册、邮箱验证、密码找回、OAuth、企业单点登录和多因素认证。
- 团队、组织、角色、权限和管理员后台。
- 离线编辑、同步队列、冲突解决、用户注销和跨账号数据转移。

首版账号由部署初始化或受控命令创建，不开放公开注册入口。

## 3. 规则

- 密码只保存 scrypt 摘要，客户端永不获得摘要。
- Session Token 的原文只保存在 HttpOnly Cookie，服务端只保存摘要。
- Cookie 使用 HttpOnly、SameSite=Lax；生产环境使用 Secure，本地开发可关闭 Secure。
- 业务 API 从 Session 解析 `UserContext`，不接受客户端传入 `userId` 作为归属依据。
- 越权访问统一按资源不存在处理，不泄露其他用户资源是否存在。
- API 输入在 HTTP 边界校验，业务不变量由 Application / Domain 负责。

## 4. HTTP 契约

```text
POST /api/auth/login
GET  /api/auth/me
POST /api/auth/logout
```

未登录访问业务 API 返回 `401 Unauthorized`。业务资源的用户隔离由 `SPEC-0010`、`SPEC-0011` 和相关架构设计继续约束。

## 5. 验收场景

### 场景 A：初始化账号

```gherkin
Given 数据库中没有用户
When 运维人员通过受控命令提交邮箱和密码
Then 系统创建个人账号并只保存密码摘要
And 不提供公开注册入口
```

### 场景 B：登录与退出

```gherkin
Given 系统存在受控账号
When 用户使用正确密码登录并随后退出
Then 登录创建有效 HttpOnly Session
And 退出后当前 Session 失效
And 后续业务 API 返回 401
```

### 场景 C：错误凭证

```gherkin
Given 用户提交了错误的账号或密码
When 系统处理登录请求
Then 系统拒绝登录且不创建有效 Session
And 不泄露账号是否存在
```

### 场景 D：用户隔离

```gherkin
Given 用户 A 和用户 B 都拥有业务数据
When 用户 A 请求或修改资源
Then 系统只返回或修改用户 A 的数据
And 用户 A 不能通过资源 ID 读取用户 B 的数据
```

### 场景 E：数据库不可用

```gherkin
Given SQLite 在启动或请求期间不可用
When 服务端启动或处理业务请求
Then 服务端拒绝启动或返回服务不可用
And 页面不得伪造数据已保存
```

## 6. 实现与验证

- 当前实现位于 `apps/api/src/auth.ts`、`apps/api/src/server.ts`、`apps/api/src/db.ts` 和 `apps/api/src/services.ts`。
- `db:seed` 是受控初始化命令，不是公开 HTTP API。
- 自动化测试覆盖登录、401、Cookie、退出和数据隔离。
- 浏览器登录、刷新和退出仍需人工验收；验收完成前保持 `Implemented`。

## 7. Definition of Done

- [x] 登录、当前用户和退出接口有自动化测试。
- [x] 初始账号命令幂等失败且不开放公开注册。
- [x] 业务查询绑定当前用户上下文。
- [x] 密码不以明文保存，Session 不通过可读 Cookie 暴露。
- [x] 数据库迁移和连接失败有明确行为。
- [ ] 浏览器登录、刷新、登出验收通过。
- [ ] 所有验收场景通过后标记为 `Verified`。
