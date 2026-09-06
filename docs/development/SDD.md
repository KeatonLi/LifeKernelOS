# LifeKernelOS AI-native 规格驱动开发协议

> SDD：Spec-Driven Development，规格驱动开发。
> 目标：让每次产品变化都能从用户意图追溯到文档、实现、测试和验收证据，并让新的 AI Agent 可以仅依赖仓库恢复正确上下文。

## 1. 为什么采用 SDD

LifeKernelOS 的主要风险不是功能做不出来，而是“人生管理系统”很容易无限扩张，对话中的临时说法也容易演变成多套互相冲突的产品模型。

SDD 在这里承担四个职责：

- 用具体场景和 Out of scope 控制每次交付范围。
- 先确认用户可见行为，再决定实现方式。
- 让 Product、ADR、Spec、代码和测试可以互相追溯。
- 把项目记忆保存在仓库中，而不是依赖某次 AI 对话。

## 2. 文档层级与所有权

```text
docs/product/PRD.md
  ├── docs/architecture/
  │     ├── system-architecture.md
  │     ├── technical-design.md
  │     └── decisions/NNNN-*.md
  └── docs/specs/
        ├── current/       # 当前产品行为
        ├── foundation/    # 已实现的基础能力
        ├── backlog/       # Deferred，暂不排期
        └── archive/       # Superseded，仅供追溯

代码、测试与验收证据跟随对应 Spec，不属于任何历史分类。
```

- [Product](../product/README.md)：拥有产品意图、用户价值、范围和用户可见信息架构。
- [ADR](../architecture/decisions/README.md)：拥有跨多个 Spec、需要长期遵守的关键选择。
- [Specs](../specs/README.md)：拥有单个功能的行为、不变量、边界和验收契约。
- [Architecture](../architecture/README.md)：拥有系统边界和实现方案。
- 代码与测试：展示当前运行事实和自动化验证证据，但不能静默改写产品意图。

一个事实只能有一个主要所有者。其他文档应链接到它，不复制一套容易过期的定义。

## 3. Spec 生命周期

```text
Proposed → Accepted → Implementing → Implemented → Verified
                         │               │
                         └───────────────┴→ Superseded
```

- `Proposed`：已提出，仍可能改变，不能开始对应实现。
- `Deferred`：明确暂不排期；重新启动前必须按当前 Product 和数据模型重审。
- `Accepted`：范围、行为和验收标准已经确认，可以开发。
- `Implementing`：正在实现，可用于协作时表达进行中状态。
- `Implemented`：代码与自动化测试已经完成，尚待完整验收。
- `Verified`：Spec 中的验收场景已逐条通过，可以宣称该功能完成。
- `Superseded`：已被新 Spec 替代，保留作为历史和迁移依据。

没有进入 `Accepted` 的 Spec 不开始开发；没有进入 `Verified` 的 Spec 不宣称产品功能已经完成。

## 4. AI 每次任务的交付循环

### 4.1 分类和读取

1. 先读根目录 [AGENTS.md](../../AGENTS.md)。
2. 根据 [文档总入口](../README.md)判断任务属于 Product、Architecture、Spec 还是 Development。
3. 只读取完成任务需要的当前文档、代码和测试。
4. 只有迁移、冲突追溯或替代关系需要时，才读取历史和 `Superseded` 文档。

### 4.2 明确变化

在动手前区分：

- **实现缺陷**：代码偏离已接受 Spec，修代码与回归测试。
- **需求变化**：用户想要的行为改变，先更新 Product / ADR / Spec。
- **实现方案变化**：用户行为不变，但技术方案变化，更新 Architecture；长期选择补 ADR。
- **待确认问题**：不同答案会明显改变产品结果，不能由 AI 静默代选。

### 4.3 写最小可执行 Spec

新功能使用 [Spec 模板](../specs/TEMPLATE.md)，至少写清：

- 具体用户问题和价值问题；
- In scope / Out of scope；
- 用户可见行为和状态变化；
- 数据不变量与事务边界；
- Given / When / Then 验收场景；
- 空状态、错误、恢复路径和测试追溯。

Spec 应描述结果，不提前固定不必要的组件结构或未来扩展点。

### 4.4 审查再实现

进入 `Accepted` 前检查：

1. 它是否解决当前真实用户问题？
2. 能否删掉一半字段或交互仍然验证假设？
3. 每条验收标准能否明确判定通过或失败？
4. 是否偷偷带入未来功能、复杂架构或不可逆的数据承诺？
5. 是否与当前 Product、ADR 或其他 Spec 冲突？

确认后，从贯穿用户流程的最小完整切片开始实现，再补齐边界和测试。

### 4.5 验证和同步

1. 运行与变更风险相称的自动化测试、类型检查和构建。
2. 文档有变化时运行 `npm run docs:check`。
3. 代码与自动化测试完成后，将 Spec 标为 `Implemented`。
4. 逐条执行验收场景；全部通过后才标为 `Verified`。
5. 若实现中发现 Spec 不合理，先更新并重新确认 Spec，再同步代码和测试。

## 5. 变更路由矩阵

| 变化类型 | 必须更新 | 视影响更新 |
| --- | --- | --- |
| 产品定位、Tab、页面职责、用户价值 | PRD | ADR、Spec、Architecture、README |
| 跨多个 Spec 的领域或技术选择 | ADR | PRD、Spec、Architecture |
| 单个功能行为、状态或验收标准 | Spec | PRD、Technical Design、测试 |
| 数据模型、API、事务、安全、迁移 | Technical Design | ADR、System Architecture、Spec |
| 模块边界、部署或数据事实源 | System Architecture + ADR | Technical Design、Spec |
| 实现偏离 Accepted Spec 的 Bug | 代码 + 回归测试 | Spec 的测试追溯记录 |
| 文档移动或重命名 | 所属目录索引 + 所有链接 | 根 README、AGENTS |

## 6. 规格与代码的追溯

- 每份 Spec 使用稳定编号，如 `SPEC-0010`。
- 关键测试名称包含 Spec 编号或明确对应的验收场景。
- 提交信息使用中文并包含适用的 Spec 编号，例如：`实现 SPEC-0010 目标期望与当前行动`。
- 一个提交尽量只对应一个可独立理解的变化。
- PR 或交付说明必须列出实现的场景、运行的验证和明确未做或未验证的内容。
- 不通过删除历史 Spec 或 ADR 掩盖方向变化；使用 `Superseded` 和替代链接保留决策链。

## 7. 当前交付顺序

现有基础能力已经完成 `SPEC-0008` 和当前导出契约 `SPEC-0007` 的实现阶段；旧 Focus 原型规格均已归档。当前产品边界为：

1. 以已接受的 `ADR-0008` 和 `ADR-0007` 为产品模型与信息架构依据。
2. `SPEC-0010` 承接“主线”的分组 To-do、派生进度和全局唯一当前 To-do。
3. `SPEC-0011` 承接“我的画像”的进度感知事实聚合与可追溯关系图谱。
4. 两个 Spec 当前为 `Implemented`，完成浏览器人工验收后才能标记 `Verified`。
5. 双 Tab 核心假设验证前，不扩展离线同步、价值观体系、AI 人格推断、日历或社交能力。

`SPEC-0001`、`SPEC-0002` 和 `SPEC-0009` 仅作为旧 Focus / 主线原型与迁移事实，不再定义当前导航和术语。

## 8. Definition of Done

一个 Spec 只有同时满足以下条件才算完成：

- 状态为 `Verified`。
- 范围没有超出 In scope。
- 核心行为有自动化测试或可重复的验收步骤。
- 空状态、错误状态和数据恢复路径已经验证。
- 用户可以完成 Spec 描述的完整流程。
- Product、ADR、Spec、Architecture、代码和测试没有已知冲突。
- 文档链接检查、相关测试、类型检查或构建已按风险通过。
- 交付说明清楚区分已决定、已实现、已验证和未验证。
