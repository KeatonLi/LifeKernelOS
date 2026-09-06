# LifeKernelOS 文档总入口

这里是人类协作者和 AI Agent 查找项目事实的统一索引。根目录的 `README.md` 负责介绍项目，`AGENTS.md` 负责告诉 AI 如何工作；本文件负责把具体问题路由到唯一的文档域。

## 1. 四个文档域

| 文档域 | 入口 | 唯一负责的问题 | 不放什么 |
| --- | --- | --- | --- |
| Product | [product/README.md](product/README.md) | 为什么做、服务谁、解决什么问题、产品边界和用户可见结构 | 数据库表、接口字段、组件实现 |
| Architecture | [architecture/README.md](architecture/README.md) | 系统如何成立、模块和数据边界、关键技术方案与长期决策 | 单个功能的完整验收场景 |
| Specs | [specs/README.md](specs/README.md) | 一个功能必须怎样表现、有哪些边界、如何测试和验收 | 宽泛愿景、没有交付边界的想法 |
| Development | [development/README.md](development/README.md) | 人和 AI 如何把需求可靠地变成已验证的实现 | 具体产品需求和技术方案 |

每个事实只应有一个主要归属。其他文档通过链接引用，不复制一套容易过期的说法。

## 2. 当前事实源

| 想确认什么 | 当前文档 |
| --- | --- |
| 产品定位、主线、我的画像及价值问题 | [PRD v0.7](product/PRD.md) |
| 系统边界和模块关系 | [系统架构](architecture/system-architecture.md) |
| 数据模型、HTTP DTO、事务和交付切片 | [详细技术设计](architecture/technical-design.md) |
| 主线分组、To-do 与派生进度 | [ADR-0008](architecture/decisions/0008-mainline-groups-derived-todo-progress.md) |
| 双 Tab 控制台结构 | [ADR-0007](architecture/decisions/0007-two-tab-console-information-architecture.md) |
| “主线”可执行行为 | [SPEC-0010](specs/current/0010-long-term-goals-and-current-action.md) |
| “我的画像”汇聚图谱行为 | [SPEC-0011](specs/current/0011-aggregated-profile-graph.md) |
| 规格状态和开发顺序 | [Spec 索引](specs/README.md) |
| AI-native 交付协议 | [SDD](development/SDD.md) |

## 3. 文档之间如何流动

```text
用户最新明确决策
  → Product：确定产品意图、用户价值和范围
  → ADR：记录跨多个 Spec、需要长期遵守的选择
  → Spec：把行为写成可实现、可测试、可验收的契约
  → Architecture / Technical Design：落实系统边界和实现方案
  → Code / Tests：形成运行事实和验证证据
```

- 产品范围变化：先改 PRD，再判断是否需要 ADR 和 Spec。
- 跨多个功能的长期选择：新增或更新 ADR，再同步受影响的 Spec 和设计。
- 单个功能的行为变化：更新对应 Spec，再更新实现与测试。
- 实现方式变化但用户行为不变：更新架构或详细技术设计；必要时写 ADR。
- 文档与代码不一致：先判断是实现缺陷还是需求变化，再修正应该拥有该事实的一侧，并同步下游。

## 4. AI 快速路由

| 任务 | 最小阅读集合 |
| --- | --- |
| 讨论产品方向或页面职责 | Product 入口 → PRD → 相关 Spec |
| 修改主线 | PRD → ADR-0008 / ADR-0007 → SPEC-0010 → 相关设计和代码 |
| 修改我的画像 | PRD → ADR-0005 / ADR-0007 → SPEC-0011 → 相关设计和代码 |
| 修改 API、数据库或认证 | Architecture 入口 → 系统架构 → 详细技术设计 → 相关 ADR / Spec |
| 修复 Bug | 相关 Spec → 测试 → 实现；若 Spec 缺失或行为要改变，先补文档 |
| 新增功能 | PRD 范围确认 → 必要 ADR → 从模板新建 Spec → 接受后实现 |
| 只整理文档 | 本索引 → 目标分类入口 → 修改后运行文档检查 |

AI 不应把“读完全部文件”当作理解项目。先确定任务域，再加载最小必要上下文；历史文件只在追溯迁移或旧决策时读取。

## 5. 状态与历史规则

- `Accepted` 表示内容已确认，可以作为实现依据。
- `Implemented` 表示代码与自动化测试已完成，不等于人工验收通过。
- `Verified` 表示规格中的验收场景已逐条验证。
- `Superseded` 表示已被新文档替代；保留用于追溯，但不是当前产品依据。
- `Deferred` 表示保留想法但明确暂不排期，不进入当前实现上下文。
- 历史文档不删除，也不在当前文档中复制其过期术语。

## 6. 新增与维护规则

- Product、Architecture、Development 文档使用语义化英文文件名。
- Spec 使用 `NNNN-kebab-case.md`，文档标题使用 `SPEC-NNNN`。
- ADR 使用 `NNNN-kebab-case.md`，文档标题使用 `ADR-NNNN`。
- 新 Spec 从 [Spec 模板](specs/TEMPLATE.md)创建；新 ADR 从 [ADR 模板](architecture/decisions/TEMPLATE.md)创建。
- 移动、重命名或新增文档后，更新本索引和所属分类入口。
- 使用相对链接连接仓库文档，不用只在某台机器有效的绝对路径。
- 完成前运行：

```bash
npm run docs:check
```

`sources/` 不属于上述文档体系。它是外部项目同步来的只读参考材料，任何 Agent 都不得编辑、移动、重命名或删除其中内容。
