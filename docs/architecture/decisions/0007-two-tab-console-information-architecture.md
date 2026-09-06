# ADR-0007：控制台只保留“主线”和“我的画像”两个一级 Tab

> 分类：Architecture Decision Record
> 状态：Accepted
> 日期：2026-09-06
> 影响范围：导航、页面路由、产品术语、画像聚合与规格边界

## 背景

把“现在”“长期目标”和“画像”并列成三个入口，会产生三套心智模型：用户需要先判断自己此刻是在管理主线、选择 To-do，还是查看现在。实际上，“现在做什么”是“主线”的行动层，而不是独立的产品对象。

同时，“我的画像”不是设置或附属报表。它回答用户在持续行动后形成了什么，是产品面向自我理解的第二个长期工作区。

## 决策

- 控制台左侧只保留两个一级 Tab：`主线`、`我的画像`。
- `主线`内部同时承载当前 To-do、状态匹配、候选 To-do 和主线维护。
- `我的画像`聚合目标、行动事实、经历总结、自我描述和知识关系图谱。
- 设置继续放在账号区域，属于辅助入口，不计入一级 Tab。
- `/expectations` 是主线的规范路由；旧 `/now`、`/goals` 和 `/workbench` 只做兼容重定向。
- `/profile` 保持为我的画像规范路由。
- 产品界面使用“主线 / To-do”，领域与 DTO 使用“Goal / Action”；旧 Focus 命名只允许存在于数据库迁移和兼容 API 中，并必须明确标为 legacy。

## 后果

- 用户无需在“现在”和“长期目标”之间来回切换，即可理解主线如何收束为此刻 To-do。
- 画像成为稳定的一级产品能力，但不得扩展为人格、能力或心理推断。
- 前端需要合并原 NowPage 与 GoalsPage，并更新所有入口和空状态。
- Profile API 需要输出 Goal 语义和可追溯的图谱节点、边。

## 关联

- [PRD v0.7](../../product/PRD.md)
- [ADR-0005 我的画像以事实为依据](0005-evidence-based-profile.md)
- [ADR-0008 主线分组与派生 To-do 进度](0008-mainline-groups-derived-todo-progress.md)
- [SPEC-0010 主线](../../specs/current/0010-long-term-goals-and-current-action.md)
- [SPEC-0011 我的画像](../../specs/current/0011-aggregated-profile-graph.md)
