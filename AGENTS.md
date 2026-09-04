# LifeKernelOS 协作记录

## 项目概况

LifeKernelOS（人生内核 OS）是一个以个人价值观为核心、以目标和行动为载体、以状态和复盘为反馈的个人生活管理系统。

产品希望帮助用户完成这条闭环：

```text
价值观与边界 → 目标与项目 → 今日行动 → 状态记录 → 复盘与校准
```

## 当前状态

- 仓库已完成基础初始化。
- 当前版本已收窄为“根据状态找到下一步行动”的 MVP，尚未开始具体功能开发。
- 产品需求文档位于 [`docs/PRD.md`](docs/PRD.md)，开发流程约定位于 [`docs/SDD.md`](docs/SDD.md)。
- 当前第一份开发规格为 [`docs/specs/0001-current-focus-and-actions.md`](docs/specs/0001-current-focus-and-actions.md)。
- 项目概览位于 [`README.md`](README.md)。

## 协作约定

- `docs/PRD.md` 是 MVP 范围和验收标准的主要依据；需求变更应同步更新 PRD。
- 项目采用轻量 SDD（Spec-Driven Development）：先写并审查规格，再实现和验收；未进入 `Accepted` 的规格不开始开发。
- 每个可独立交付的小场景在 `docs/specs/` 下使用稳定编号维护，并通过规格、测试和提交信息保持追溯。
- 产品设计遵循隐私优先、轻量记录、允许跳过和可持续复盘的原则。
- 不把智能摘要当作诊断或绝对结论；涉及用户个人数据的能力必须可解释、可关闭、可导出和可删除。
- 新增功能应优先服务“内核—方向—目标—行动—状态—复盘”的核心闭环，避免为了增加功能而增加复杂度。
- 提交信息使用中文，并清楚说明本次变更内容。

## 初始化记录

- 初始仓库：`https://github.com/KeatonLi/LifeKernelOS.git`
- 本地目录：`~/IdeaProjects/LifeKernelOS`
- 首次提交包含项目说明、产品需求文档和基础忽略规则。
