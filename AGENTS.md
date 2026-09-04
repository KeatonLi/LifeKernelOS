# ChatGPT project context

This directory is a local mirror of the ChatGPT project “人生内核OS”.

- Treat every file under `sources/` as read-only reference material.
- Do not edit, rename, move, or delete synced project files.
- These files may be replaced the next time a task is created from this ChatGPT project.


## Project instructions

## LifeKernelOS 项目记录

当前主项目目录已经与 GitHub 仓库 `https://github.com/KeatonLi/LifeKernelOS.git` 关联，默认分支为 `main`。

### 项目定位

LifeKernelOS（人生内核 OS）当前只验证一个 MVP 假设：当用户感到混乱、时间有限或精力不足时，帮助用户找到一个现在真正能做的下一步行动。

当前闭环：

```text
当前主线 → 下一步行动 → 根据状态选择 → 完成或调整 → 日终收束
```

### 重要文档

- `README.md`：项目概览。
- `docs/PRD.md`：当前 MVP 的产品范围和验收标准。
- `docs/SDD.md`：规格驱动开发约定。
- `docs/architecture.md`：MVP 技术架构基线。
- `docs/specs/`：可执行功能规格。
- `docs/decisions/`：跨多个规格的架构决策。

### 开发约定

- 采用轻量 SDD：先写并审查规格，再实现、测试和验收。
- 未进入 `Accepted` 的规格不开始开发；未进入 `Verified` 的规格不宣称完成。
- 当前技术基线是响应式 Web 单体、React + TypeScript + Vite、本地优先 IndexedDB、无后端 MVP。
- 需求变更同步更新 PRD；跨规格的架构变化先补充 ADR。
- 当前第一条开发规格是 `SPEC-0001`，先实现“当前主线与行动”。
- 提交信息使用中文，并清楚说明变更内容。
