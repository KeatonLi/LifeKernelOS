# ADR-0003：MVP 采用服务端持久化的模块化单体

> 状态：Proposed
> 日期：2026-09-04
> 影响范围：MVP 运行方式、身份、数据存储和部署

## 背景

LifeKernelOS 的核心数据不是一次性页面状态，而是用户会持续使用的主线、行动、每日状态和日终记录。若只使用静态网站和浏览器本地存储，数据会绑定在单个浏览器，无法满足可靠保存、跨设备访问和后续身份边界的要求。

当前 MVP 仍然需要保持小步快走，因此不能因为引入后端就拆成微服务或提前建设复杂同步系统。

## 决策

- 采用响应式 Web 前端加后端模块化单体。
- 前端使用 React + TypeScript + Vite。
- 后端使用 Node.js + TypeScript + Fastify。
- 使用 SQLite 文件作为服务端事实源，使用 Drizzle ORM 访问数据库并管理迁移。
- 使用 `better-sqlite3` 作为 Node.js 到 SQLite 的驱动；Drizzle 不负责启动服务，也不是 HTTP 中间件。
- 前后端通过同源 HTTPS JSON API 通信；后端可以同时提供 React 构建产物。
- 使用服务端会话和 HttpOnly Cookie；MVP 只支持受控个人账号，不开放公开注册、团队权限和 OAuth。
- Domain 和 Application 保持可测试，API 层不得直接操作数据库。
- 浏览器端不实现离线编辑和同步队列；IndexedDB 若未来引入，只能作为缓存，不作为第二个事实源。

## Drizzle 的定位

Drizzle 是 TypeScript 的数据库访问库，属于 Application 和 SQLite 驱动之间的 Infrastructure 组件。它提供类型安全的表定义、查询构造、事务调用和迁移工具，让代码可以用 TypeScript 表达 SQL 访问。

它不是：

- HTTP 中间件，不负责登录、路由或请求拦截；
- Web 服务，不替代 Fastify；
- 数据库引擎，真正保存数据的是 SQLite 文件。

调用链是：`Fastify → Application → Repository → Drizzle → better-sqlite3 → SQLite 文件`。

## 为什么不是静态网站加 IndexedDB

这种方案适合验证纯单机交互，但数据只能留在当前浏览器。它无法自然提供账号隔离、跨设备访问、服务端备份和统一的数据清空能力。对于 LifeKernelOS 的持续记录场景，这个限制会直接影响产品可用性，而不是单纯的部署偏好。

## 为什么不直接做微服务或复杂同步

MVP 的业务边界仍然很小，Focus、Action、DailyState 和 DailyClose 可以由一个进程内的 Application 层统一编排。微服务会增加部署、鉴权、观测和故障处理成本，但不能帮助验证“下一步行动”假设。

服务端作为唯一事实源后，跨设备访问不需要立即引入同步冲突解决。离线编辑、增量同步和冲突合并必须等真实需求出现后，通过新的 ADR 和 SPEC 单独设计。

## 数据与安全约束

- 所有业务表都包含 `user_id`，仓储查询必须带当前用户上下文。
- 每个用户只能拥有一条 `active` Focus，由数据库约束和 Application 双重保护。
- 会话使用 HttpOnly、Secure、SameSite Cookie；生产环境必须使用 HTTPS。
- 服务端不记录用户正文到第三方分析平台，不默认接入 AI。
- 数据导出和清空只能作用于当前登录用户，并且由用户主动触发。

## 代价与接受条件

- 需要维护服务端、数据库迁移和最小登录流程。
- 部署不再是上传静态文件，而是运行 Fastify 服务并挂载持久化 SQLite 文件。
- SQLite 只服务单实例、低并发的 MVP；部署必须使用持久化磁盘并安排数据库文件备份。未来出现多实例或明显并发瓶颈时，再评估迁移 PostgreSQL。
- 依赖网络才能读取和写入核心数据；MVP 接受暂不支持离线编辑。
- 如果未来引入开放注册、团队协作、离线同步或 AI，必须新增对应 ADR 和 SDD 规格。
