# LifeKernelOS 架构基线

> 版本：0.11
> 状态：Accepted
> 更新时间：2026-10-04
> 对应产品：[PRD](../product/PRD.md)
> 决策：[ADR-0009](decisions/0009-electron-local-desktop.md)、[ADR-0008](decisions/0008-mainline-groups-derived-todo-progress.md)

## 系统边界

默认运行形态是 Electron 本地桌面。React 渲染主线、画像及辅助窗口；受限 preload 将业务请求转交主进程，主进程转发到独占 SQLite 的 utility process。后台业务进程是事实源，前端不得读写数据库。Fastify 作为兼容入口，不随桌面启动。

## 进程职责

| 层 | 职责 | 禁止 |
| --- | --- | --- |
| React | 导航、表单、展示、接收已提交变化 | 文件系统、SQL、Node API |
| Preload | 固定 request/ai、变更订阅、桌面命令 | 通用 ipcRenderer 暴露 |
| Electron 主进程 | 窗口、协议、来源校验、原生对话框、Key 加密、模型请求 | 执行任意渲染端路径或 shell、回传 Key |
| Utility process | 输入校验、身份、事务、进度、画像、备份恢复 | 加载远程代码、监听 HTTP |
| SQLite | 本地事实、外键、迁移、WAL | 前端直接连接 |

## 领域约束

多个 Goal 分组、一个全局当前 Action；进度由 available/completed/blocked 的比例派生；completed Goal 由用户确认。画像只聚合可追溯事实。Capture 转换原子保存完整内容。多窗口操作携带预期行动 ID，提交后广播。导入在校验通过、明确确认和备份成功后才开始事务。

## 数据与交付

SQLite 与最多 10 份 JSON 备份存于 OS userData；应用资源包含版本迁移，启动不依赖 cwd。主窗口关闭退出时取消模型请求并关闭数据库；辅助窗口支持 Escape。应用单实例。开发使用 Vite，发布载入本地 app 协议，拒绝外部导航与权限。Electron Builder 打包三平台；签名、自动升级和同步另行定义。

相关行为见 [SPEC-0012](../specs/current/0012-electron-desktop.md)，可执行实现见 [技术设计](technical-design.md)。

## 基础 Todo 与日期视图增量

以 [ADR-0010](decisions/0010-todo-calendar-views.md) 和 [SPEC-0013](../specs/current/0013-basic-todo-and-calendar.md) 为准。Action 新增可空 scheduledDate（本地 YYYY-MM-DD）；迁移 007 为旧任务补空，索引 user_id/scheduled_date。列表、今日、月/周日历读取同一份用户隔离事实。按 ID 完成/恢复/移除带 expectedStatus；状态、resolvedAt 与对应当前选择同事务提交，保留其他当前任务。导出 v7；导入 v6/v7 时先校验并归一化，v6 缺日期补 null。共享日期函数不依赖 Node 或 SQL，UI 不接触数据库。CI/CD 见[交付说明](../development/ci-cd.md)。

## 用户 Key 与 AI 增量

[ADR-0012](decisions/0012-local-byok-ai.md) / [SPEC-0014](../specs/current/0014-byok-ai-task-decomposition.md)：主进程独占 Key 与兼容模型请求，渲染端保持 connect-src none。配置独立于业务备份，Key 通过 safeStorage 加密；不可用时仅会话。worker 校验任务/主线版本，事务采纳或撤销；迁移 008 的拆解回执保存幂等和恢复信息，任务 JSON 仍为 v7，导入清回执并使预览失效。
