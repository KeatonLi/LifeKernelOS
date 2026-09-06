# LifeKernelOS AI 开发入口

本文件是遵循仓库 Agent 约定的 AI Agent 进入仓库后的第一份必读说明。不要依赖对话记忆猜测项目状态；先按这里的路由读取当前事实源，再修改文档或代码。不会自动识别本文件的外部 Agent 应从根目录 [llms.txt](llms.txt) 开始，它会路由到同一套事实源。

## 0. 不可违反的仓库边界

- `sources/` 是 ChatGPT 项目的只读镜像材料。不得编辑、重命名、移动或删除其中任何文件。
- 用户需求发生变化时，先更新对应的产品文档、ADR 或 Spec，再同步实现。
- 未进入 `Accepted` 的 Spec 不开始实现；未进入 `Verified` 的 Spec 不宣称功能已完成。
- `Deferred` 和 `Superseded` Spec 不属于当前实现上下文，除非任务明确要求迁移或历史追溯。
- 不覆盖用户已有的未提交改动，不用破坏性 Git 命令清理工作区。
- 服务端是业务数据事实源；前端不得直接读写数据库。
- 当前产品不使用“唯一主线”或手动百分比，也不根据画像事实推断人格、能力或心理状态。

## 1. AI 每次开始任务时的读取顺序

1. 阅读根目录 [README.md](README.md)，理解项目定位和当前状态。
2. 阅读 [docs/README.md](docs/README.md)，确定任务属于哪个文档域。
3. 阅读该文档域的 `README.md`，只加载完成任务需要的文档。
4. 开发功能前，必须阅读相关 Accepted / Implemented Spec；涉及跨规格决策时再读对应 ADR。
5. 检查当前代码和测试，确认实现事实是否与文档一致。
6. 修改完成后运行 `npm run docs:check`，并按风险运行测试和构建。

不要无目的地读取全部历史文档。先分类、再路由、再逐步加载上下文。

## 2. 文档地图与事实源

| 文档域 | 入口 | 回答的问题 | AI 什么时候读 |
| --- | --- | --- | --- |
| 产品 | [docs/product/README.md](docs/product/README.md) | 为什么做、服务谁、解决什么价值问题、产品范围是什么 | 产品方向、页面职责、文案、范围变更 |
| 架构 | [docs/architecture/README.md](docs/architecture/README.md) | 系统如何成立、边界如何划分、关键技术取舍是什么 | 数据模型、API、模块、迁移、安全、跨规格技术变化 |
| Spec | [docs/specs/README.md](docs/specs/README.md) | 某个功能必须怎样表现、如何测试和验收 | 任何功能开发、修复或验收 |
| 开发方法 | [docs/development/README.md](docs/development/README.md) | AI 和人如何把需求可靠地交付成代码 | 流程、状态流转、提交与交付规则 |

### 当前必须优先读取的文档

- 产品事实源：[PRD v0.7](docs/product/PRD.md)
- 系统边界：[系统架构](docs/architecture/system-architecture.md)
- 可执行设计：[详细技术设计](docs/architecture/technical-design.md)
- 当前目标模型决策：[ADR-0008](docs/architecture/decisions/0008-mainline-groups-derived-todo-progress.md)
- 当前信息架构决策：[ADR-0007](docs/architecture/decisions/0007-two-tab-console-information-architecture.md)
- 主线：[SPEC-0010](docs/specs/current/0010-long-term-goals-and-current-action.md)
- 我的画像：[SPEC-0011](docs/specs/current/0011-aggregated-profile-graph.md)
- 交付协议：[SDD](docs/development/SDD.md)

## 3. 按任务类型自动路由

### 产品设计、页面职责、用户价值或范围

先读：

1. `docs/product/README.md`
2. `docs/product/PRD.md`
3. 相关 Spec

如果改变两个以上 Spec 或改变控制台信息架构，再新增或更新 ADR。

### 架构、数据、API、安全或迁移

先读：

1. `docs/architecture/README.md`
2. `docs/architecture/system-architecture.md`
3. `docs/architecture/technical-design.md`
4. 相关 ADR 与 Spec

跨规格且长期有效的选择必须写入 `docs/architecture/decisions/`。

### 功能实现或 Bug 修复

先从 `docs/specs/README.md` 找到对应 Spec：

- Spec 已覆盖：按 Spec 修改代码、测试和验收记录。
- Spec 未覆盖但属于现有行为：先补充 Spec，再实现。
- Bug 是实现偏离已接受行为：不改产品范围，修复实现并增加回归测试。
- 需求改变了已接受行为：先修改 PRD / ADR / Spec，不能只改代码。

### 纯文档维护

先读 `docs/README.md` 和目标分类入口；移动或重命名文档后，必须同步所有相对链接并运行 `npm run docs:check`。

## 4. 文档冲突时的判断顺序

同一层级出现矛盾时不要静默挑选。先定位应该拥有该事实的唯一文档，再向下同步：

```text
用户最新明确决策
  → Product PRD（产品意图与范围）
  → ADR（跨规格长期决策）
  → Spec（可执行行为与验收）
  → Architecture / Technical Design（实现边界与方案）
  → Code / Tests（运行事实）
```

代码展示“现在是什么”，Accepted 文档声明“应该是什么”。二者冲突时先判断是实现缺陷还是需求变更，然后修正正确的一侧并同步下游，不能把冲突留给下一个 Agent。

## 5. AI-native 交付循环

每次任务遵循同一闭环：

```text
理解用户意图
  → 路由并读取最小必要上下文
  → 写清产品或规格变化
  → 实现最小完整切片
  → 自动化验证
  → 同步文档状态
  → 报告证据、偏差与下一步
```

AI 输出必须区分：

- **已决定**：用户或 Accepted 文档已经确认。
- **已实现**：代码和自动化测试已经完成。
- **已验证**：验收场景已经逐条通过。
- **待确认**：会改变产品结果、但用户尚未做出的选择。

## 6. 当前产品与技术基线

LifeKernelOS 只有两个一级 Tab：

1. **主线**：多个主线分组、To-do 内容、派生进度与全局唯一当前 To-do。
2. **我的画像**：主线、To-do 结果、经历总结、自我描述与知识的可追溯图谱。

设置属于账号辅助入口，不是第三个 Tab。

技术基线为响应式 Web + 后端模块化单体：React、TypeScript、Vite、Fastify、SQLite、Drizzle。认证使用 scrypt 密码摘要和服务端 Session；数据库迁移、HTTP DTO 与事务边界以详细技术设计为准。

## 7. 完成任务前的检查

- 修改是否落在正确的文档分类中？
- 产品、ADR、Spec、架构、代码是否只保留一套当前说法？
- 新行为是否有对应 Spec 和测试追溯？
- 是否保留了历史文档，同时明确其 `Superseded` 或历史用途？
- 是否运行 `npm run docs:check`？
- 是否按风险运行 `npm test`、`npm run typecheck` 或 `npm run build`？
- 最终说明是否给出了实际验证结果，并避免把 `Implemented` 说成 `Verified`？

提交信息使用中文，并在适用时包含 Spec 编号，例如：`实现 SPEC-0011 我的画像汇聚图谱`。
