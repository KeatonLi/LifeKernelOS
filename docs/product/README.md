# Product 文档

Product 文档是 LifeKernelOS 产品意图的事实源，回答“为什么做”和“用户最终得到什么”。

## 本目录负责

- 目标用户、使用情境和核心用户问题。
- 产品定位、价值主张和验证假设。
- 一级信息架构、页面职责和用户可见术语。
- 当前版本的 In scope / Out of scope。
- 跨功能的用户旅程和产品级验收边界。

本目录不固定数据库表、HTTP DTO、代码模块或 UI 组件细节。此类内容分别属于 Architecture 和 Specs。

## 当前文档

| 文档 | 状态 | 用途 |
| --- | --- | --- |
| [Todo 体验参考](todo-reference-products.md) | Research | 官方产品能力与本项目取舍 |
| [功能完成度与后续建议](feature-gap-analysis.md) | Analysis | main 合并后的实现事实、待验收边界与尚未开发的功能，不接受新的产品范围 |
| [PRD v0.11](PRD.md) | Accepted | 目标驱动定位、基础 Todo / 日历、画像事实、用户 Key AI 拆解与简约日常界面 |
| [PRD v0.12：行动积累与个人成长卡片](goal-growth-prd.md) | Proposed，待用户审核 | 四个成长目标、完成后自动归类、可追溯分析与游戏化成长；新方向评审优先阅读 |
| [PRD v0.11 方向讨论](next-direction-prd.md) | Proposed（剩余范围） | 定位、BYOK 与日常简约界面已并入当前 PRD；画像概览、回顾与新 AI 场景仍待评审 |

当前界面研发从 [SPEC-0015](../specs/current/0015-minimal-action-interface.md) 与 [ADR-0011](../architecture/decisions/0011-progressive-action-workspace.md) 的已接受范围进入；先完成界面，再研发新功能。画像继续采用图谱主画面。

2026-10-07 新方向评审以 PRD v0.12 为入口，配套 [ADR-0013](../architecture/decisions/0013-goal-growth-and-automatic-ai.md) 同为 Proposed。v0.11 的旧方向讨论保留历史与剩余提案；若与 v0.12 建议不同，评审时优先讨论新版，实施仍遵循当前 Accepted 规格。

## AI 读取与更新规则

以下任务必须先读 PRD：

- 讨论产品方向、导航、页面职责或用户价值；
- 新增、删除或重命名用户可见能力；
- 改变“目标期望”或“我的画像”的边界；
- 判断一个想法是否属于当前 MVP。

用户可见范围变化时：

1. 先把用户问题、价值和范围写入 PRD。
2. 若选择会影响多个 Spec 或形成长期约束，更新 [ADR](../architecture/decisions/README.md)。
3. 更新或新增对应 [Spec](../specs/README.md)。
4. 最后同步架构、实现与测试。

产品文档不能把尚未确认的推测写成已决定内容。未确认想法应明确标为“待确认”或留在讨论中。
