# Architecture Decision Records

ADR 记录影响多个 Spec、需要长期遵守的关键选择，以及做出选择时的背景和代价。它让后续 AI 不只知道“现在怎么做”，也知道“为什么这样做”。

## 决策索引

| ADR | 决策 | 状态 | 当前用途 |
| --- | --- | --- | --- |
| [ADR-0001](0001-local-first-mvp.md) | MVP 采用本地优先架构 | Superseded | 早期本地优先方案记录；由 ADR-0003 替代 |
| [ADR-0002](0002-web-stack.md) | React + TypeScript + Vite + Dexie | Superseded | 前端栈部分保留；本地持久化由 ADR-0003 替代 |
| [ADR-0003](0003-server-backed-mvp.md) | 服务端持久化的模块化单体 | Proposed（已实现，待评审） | 只记录运行形态；目标模型以 ADR-0008 为准 |
| [ADR-0004](0004-single-mainline-workbench-mvp.md) | 单一主线工作台 | Superseded | 历史产品模型；由 ADR-0008 替代 |
| [ADR-0005](0005-evidence-based-profile.md) | 画像以目标与行动事实为依据 | Accepted | 画像的事实、可追溯与用户确认边界 |
| [ADR-0006](0006-multiple-long-term-goals-and-single-current-action.md) | 多个长期目标与单一当前行动 | Superseded | 由 ADR-0008 替代，保留历史演进 |
| [ADR-0007](0007-two-tab-console-information-architecture.md) | 两个一级 Tab | Accepted | “目标期望”和“我的画像”的当前信息架构 |
| [ADR-0008](0008-mainline-groups-derived-todo-progress.md) | 主线分组与派生 To-do 进度 | Accepted | 主线、To-do、进度与画像的当前核心模型 |

## 状态规则

- `Proposed`：正在评审，不能单独作为不可更改的架构约束。
- `Accepted`：当前有效，受影响的设计、Spec 和代码都必须遵守。
- `Superseded`：已被后续决策替代，只用于历史追溯。

ADR 不通过编辑历史来伪装“一直如此”。方向变化时新增 ADR，或清楚记录更新日期、替代关系和受影响文档。

## 新建决策

1. 复制 [TEMPLATE.md](TEMPLATE.md)，分配下一个稳定编号。
2. 写清背景、决策、备选方案、后果和受影响文档。
3. 初始状态为 `Proposed`。
4. 用户或项目负责人确认后改为 `Accepted`。
5. 同步更新本索引、PRD、相关 Spec 与架构设计。
