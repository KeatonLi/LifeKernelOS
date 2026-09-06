# LifeKernelOS

> An AI-native personal operating system, built from product intent to verified code.

LifeKernelOS（人生内核 OS）把多条主线拆成清楚的 To-do，收束为此刻真正能做的一步，并把真实行动、经历和知识沉淀成一份可追溯的个人画像。

这个项目从产品讨论、PRD、架构决策、可执行 Spec、代码实现到验证记录都由 AI 协作完成，但产品判断始终由人确认。AI 不靠聊天记忆维护项目，而是从仓库中的结构化事实源恢复上下文。

## 产品只有两个入口

### 目标期望

把多条主线作为 To-do 分组推进，展示由完成事实自动计算的进度，并结合当前时间和精力确认全局唯一的当前 To-do。

它解决的是：目标可以同时存在，但人此刻只能真正推进一步。

### 我的画像

把目标、行动结果、经历总结、自我描述和知识汇聚成可追溯图谱。

它解决的是：经历不应散落在任务列表和记忆里，系统也不应越权替用户定义人格或能力。

```text
主线分组 → 当前 To-do → 完成或调整 → 事实汇聚到我的画像
```

## 为什么这是 AI-native 项目

这里的 AI-native 不是“用 AI 写了代码”，而是把仓库设计成 AI 可以可靠接手、判断和验证的开发系统：

- **上下文在仓库里**：产品、架构、规格和交付规则各有唯一入口。
- **先路由再读取**：AI 从 `AGENTS.md` 和文档索引定位最小必要上下文，不盲读整个仓库。
- **决策可追溯**：产品变化进入 PRD，跨规格选择进入 ADR，具体行为进入 Spec。
- **实现有证据**：测试名称关联 Spec；`Implemented` 和 `Verified` 明确区分。
- **冲突必须收敛**：文档和代码出现多套说法时，修复事实源并同步下游，不把矛盾留给下一次对话。
- **人拥有最终判断**：AI 可以分析、实现和验证，但不能擅自决定人生目标，也不能生成不可追溯的个人画像结论。

## AI 从这里开始

任何遵循仓库 Agent 约定的 AI Agent 进入项目后，第一步必须阅读 [AGENTS.md](AGENTS.md)。它包含：

- 文档地图；
- 按任务类型的自动路由；
- 事实源优先级；
- Spec 生命周期；
- 实现与验证规则。

完整文档入口是 [docs/README.md](docs/README.md)。

对于不会自动识别 `AGENTS.md` 的外部 Agent，仓库根目录提供标准的 [llms.txt](llms.txt) 索引入口；它指向相同的当前事实源，不复制第二套产品定义。

## 文档架构

```text
docs/
├── README.md                     # 全局文档索引
├── product/                      # 为什么做、做什么
│   ├── README.md
│   └── PRD.md
├── architecture/                 # 系统如何成立
│   ├── README.md
│   ├── system-architecture.md
│   ├── technical-design.md
│   └── decisions/                # ADR：跨规格长期决策
├── specs/                        # 功能如何表现和验收
│   ├── README.md
│   ├── TEMPLATE.md
│   ├── current/                  # 当前双 Tab MVP 的有效规格
│   ├── foundation/               # 已实现但仍需持续治理的基础能力
│   ├── backlog/                  # 明确延期、暂不进入当前 MVP
│   └── archive/                  # 被替代的历史规格，仅供追溯
└── development/                  # AI 与人的交付方法
    ├── README.md
    └── SDD.md
```

| 想了解什么 | 从这里开始 |
| --- | --- |
| 产品定位与两个 Tab | [产品文档](docs/product/README.md) |
| 系统、数据、API 和迁移 | [架构文档](docs/architecture/README.md) |
| 当前功能状态与验收标准 | [Spec 索引](docs/specs/README.md) |
| AI-native 开发流程 | [开发方法](docs/development/README.md) |

## 当前状态

- PRD v0.7：`Accepted`
- SPEC-0010 主线：`Implemented`
- SPEC-0011 我的画像：`Implemented`
- 浏览器人工验收与真实用户验证完成前，不标记为 `Verified`

## 本地运行

需要 Node.js 22 或更高版本。

```bash
npm install
LK_SEED_EMAIL="you@example.com" LK_SEED_PASSWORD="请使用你自己的强密码" npm run db:seed
npm run dev
```

默认访问地址为 `http://127.0.0.1:4173`，数据保存在 `data/lifekernel.sqlite`。

## 质量检查

```bash
npm run docs:check   # 检查文档链接和过期路径
npm test             # 运行后端行为与迁移测试
npm run typecheck    # TypeScript 类型检查
npm run build        # 完整生产构建
```

## 协作原则

1. 产品变化先更新 PRD。
2. 跨多个 Spec 的长期决策先更新 ADR。
3. 功能实现前，相关 Spec 必须至少为 `Accepted`。
4. 代码与自动化测试完成后标记 `Implemented`。
5. 验收场景逐条通过后才能标记 `Verified`。
6. 每次交付都报告做了什么、验证了什么、还有什么没有验证。

如果你是人类协作者，从产品文档开始；如果你是 AI Agent，从 `AGENTS.md` 开始。
