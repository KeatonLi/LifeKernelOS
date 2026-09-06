# LifeKernelOS 功能规格索引

Spec 是功能开发与验收的直接契约：它把 [PRD](../product/PRD.md) 的产品意图拆成可实现、可测试、可明确判断通过或失败的行为。

## AI 如何使用本索引

1. 当前产品功能只从 [current/](current/) 读取。
2. 基础能力从 [foundation/](foundation/) 读取。
3. [backlog/](backlog/) 是未来候选，不进入当前实现上下文。
4. [archive/](archive/) 只用于迁移和历史追溯，不得作为当前行为依据。
5. 新 Spec 从 [TEMPLATE.md](TEMPLATE.md) 创建，初始状态为 `Proposed`；进入 `Accepted` 前不实现。

## Current：当前产品规格

| 编号 | 名称 | 产品位置 | 依赖 | 状态 |
| --- | --- | --- | --- | --- |
| [SPEC-0010](current/0010-long-term-goals-and-current-action.md) | 主线：分组 To-do 与当前行动 | 主线 Tab | `SPEC-0008` | Implemented |
| [SPEC-0011](current/0011-aggregated-profile-graph.md) | 我的画像：进度感知汇聚图谱 | 我的画像 Tab | `SPEC-0010`、`SPEC-0008` | Implemented |

`SPEC-0010` 与 `SPEC-0011` 分别承接当前两个一级 Tab。v0.7 的代码和自动化测试已经完成并进入 `Implemented`；浏览器人工验收和真实用户验证完成前不得标记为 `Verified`。

## Foundation：基础能力规格

| 编号 | 名称 | 用途 | 依赖 | 状态 |
| --- | --- | --- | --- | --- |
| [SPEC-0008](foundation/0008-identity-and-server-persistence.md) | 身份与服务端数据边界 | 登录、会话、用户隔离和持久化 | 无 | Implemented |
| [SPEC-0007](foundation/0007-data-export-and-clear.md) | 数据导出 | 当前 Goal / Action / Profile 数据导出 | `SPEC-0008`、`SPEC-0010`、`SPEC-0011` | Implemented |

## Backlog：未来候选规格

这些能力明确不属于当前双 Tab MVP。`Deferred` 表示保留想法但暂不排期，重新启动前必须按当前 Goal 模型重审。

| 编号 | 名称 | 当前状态 | 重新启动前的要求 |
| --- | --- | --- | --- |
| [SPEC-0004](backlog/0004-daily-close.md) | 日终收束 | Deferred | 重写为 Goal / Action / CurrentContext 语义 |
| [SPEC-0005](backlog/0005-quick-capture.md) | 快速捕捉 | Deferred | 明确其与两个 Tab 的归属，不恢复“当前主线”术语 |
| [SPEC-0006](backlog/0006-weekly-review.md) | 周复盘 | Deferred | 去除“下周唯一主线”，重新定义验证目标 |

## Archive：历史规格

这些文档只保留迁移事实和决策轨迹，不能指导当前 UI、DTO 或业务规则。

| 编号 | 名称 | 状态 | 替代依据 |
| --- | --- | --- | --- |
| [SPEC-0001](archive/0001-current-focus-and-actions.md) | 当前主线与任务 | Superseded | SPEC-0010 |
| [SPEC-0002](archive/0002-state-aware-next-action.md) | 根据状态选择下一步 | Superseded | SPEC-0010 |
| [SPEC-0003](archive/0003-unfinished-action-resolution.md) | 任务调整 | Superseded | SPEC-0010 |
| [SPEC-0009](archive/0009-mainline-profile.md) | 我的画像与知识沉淀 | Superseded | SPEC-0011 |

## 依赖与交付顺序

```text
基础能力：0008 → 0010 → 0011
                      └→ 0007（导出契约跟随当前数据模型）

历史实现：0008 → 0001 → 0009
                   └────→ 0007（旧版导出，仅供迁移追溯）
```

## 文件和状态规则

- 文件名：`NNNN-kebab-case.md`；标题：`SPEC-NNNN 功能名称`。
- `Proposed`：提出但未接受；`Accepted`：可以开始开发；`Implemented`：代码和自动化测试完成；`Verified`：验收场景逐条通过；`Superseded`：被新 Spec 替代；`Deferred`：明确暂不排期。
- 一个 Spec 聚焦一个可以独立交付和验收的用户场景。
- 规格描述用户可见行为、领域规则和必要边界；具体实现链接到[详细技术设计](../architecture/technical-design.md)。
