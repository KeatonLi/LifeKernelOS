# LifeKernelOS 详细技术设计

> 版本：0.11
> 状态：Accepted
> 更新时间：2026-10-04
> 范围：SPEC-0012 与现有主线、画像、快速收集
> 决策：[ADR-0009](decisions/0009-electron-local-desktop.md)

## 技术与目录

- Electron 44、React 19、TypeScript、Vite、Phosphor Icons、React Flow。
- SQLite 使用 node:sqlite DatabaseSync，适配现有 prepare/transaction 接口；事务支持嵌套 savepoint。
- apps/api/src 保存复用领域服务；apps/desktop/src 保存 main、preload、worker 与 JSON 恢复。
- 构建：Vite 输出 dist，esbuild 输出 dist-desktop。打包包含迁移与本地品牌资产，无原生 SQLite npm 依赖。

## IPC 与用例

固定 bridge 接收 method/path/body，后台路由只允许注册的业务路径。Zod 校验原始 IPC 输入，用户 ID 由本地进程确定，渲染端不能指定。主进程校验 sender 是已创建窗口且 URL 为应用 origin；回复为成功数据或结构化业务错误。超时与进程退出清理挂起请求。所有已提交写入广播 data-changed，窗口重新加载所需事实。

桌面 IPC 与兼容 HTTP 都要求主线、任务、知识编辑及当前状态更新至少包含一个字段；空编辑被拒绝，不触碰时间戳或使既有 AI 来源快照失效。显式 null 仍可清除可空字段。

所有当前操作传 expectedActionId 并在事务内比对选择，冲突返回 CURRENT_ACTION_CHANGED。阻塞恢复仅限 blocked 与 active Goal。Action content 最大 2000，与 Capture 一致。

## 身份、迁移、备份

本地身份复用 users 归属模型，使用不可登录的本地占位凭据。初次启动仅创建身份，不生成任务。createDatabase 显式接受 migrationsPath，默认以源码位置解析；发布用 app 资源绝对路径。

导出 schemaVersion 7，不含身份秘密；兼容导入 v6/v7，旧版本缺失日期补 null。校验全部数据字段、日期、ID 唯一性、单一源用户与引用归属，以及当前行动 ID/选择时间成对；映射导出 userId 至本地用户，保留业务 ID 与时间。业务进程校验备份时返回当前导出 data 的 SHA-256 事实版本（不含每次变化的 exportedAt），原生确认完成后提交同一版本；若其他窗口已修改数据，先返回 WORKSPACE_CHANGED，要求重新核对确认。导入前原子写入当前 JSON 备份，再事务清除用户业务数据并插入全部关系。任何失败回滚。启动备份与导入备份保留最近 10 份，设置可打开目录。

## 桌面与视觉

JSON 导出按主进程中的目标绝对路径排队，Windows 使用不区分大小写的队列键；先固定 JSON 快照，前一次失败不阻塞后续写入。使用目标旁的 UUID 临时文件，以 `wx` 排他创建、权限 0600，完整写入并关闭后 rename 原子替换。Windows 对 EACCES / EPERM / EBUSY 最多重试三次，等待 50/100/200ms；不预先删除目标或放宽权限。失败或成功后只清理本次拥有的临时文件。多窗口导出不共享暂存路径，目标始终是一份完整快照。保存对话框的默认名称使用与 Todo 相同的本地日期函数。

主窗口默认 1360×900、最小 900×640，持久化尺寸。快速收集和专注小窗保持独立布局。Cmd/Ctrl+K 收集，Cmd/Ctrl+Shift+Space 全局收集。导航仅主线和画像，设置底部。冷白、石墨黑与朱橙基线不变。用户正文及模型建议按文本渲染，不允许 HTML。

## 验证

领域事务与旧迁移测试、桌面恢复与错误输入测试、React 主要路径交互测试、生产构建、Electron 实际启动/隔离/多窗口/重启验证、浏览器截图检查、文档链接检查。各平台安装与签名独立记录，不混同本地 Linux 验证。

## 基础 Todo 与日期视图增量

主线状态、标题与派生进度使用同一条用户隔离的聚合 SQL 读取，避免目标数量增加时逐条查询，也避免读取中混用不同版本的目标和进度。画像在一致性事务中复用这项聚合，并一次读取当前用户的经历总结；列表、事实概览和图谱继续使用同一份计数。

以 [ADR-0010](decisions/0010-todo-calendar-views.md) 和 [SPEC-0013](../specs/current/0013-basic-todo-and-calendar.md) 为准。Action 新增可空 scheduledDate（本地 YYYY-MM-DD）；迁移 007 为旧任务补空，索引 user_id/scheduled_date。列表、今日、月/周日历读取同一份用户隔离事实。按 ID 完成/恢复/移除带 expectedStatus；状态、resolvedAt 与对应当前选择同事务提交，保留其他当前任务。导出 v7；导入 v6/v7 时先校验并归一化，v6 缺日期补 null。共享日期函数不依赖 Node 或 SQL，UI 不接触数据库。CI/CD 见[交付说明](../development/ci-cd.md)。

## BYOK AI（SPEC-0014）

- shared/ai 定义严格命令与步骤校验；preload 只暴露 ai 命令。main 校验 trusted sender，AiController 发请求；不扩大渲染网络策略。
- AiSettingsStore 串行比对配置 revision，原子保存 userData/ai-connection.json。safeStorage 使用异步 API；Linux basic_text 禁止持久化。新地址要求新 Key，失败不覆盖已存配置。
- source 在 worker 获取 Action/Goal 快照，SHA-256 覆盖字段与时间。generate 带源版本和配置版本，发送前、生成后再查来源。只发送显式任务上下文，Key 仅在 Authorization。
- 主进程通过 Electron net.fetch 请求 chat/completions，支持系统代理，不携带浏览器 Cookie。采用非流式文本请求，60 秒超时，256 KiB 响应上限，无自动重试或重定向。输出 JSON 1–6 步，严格限长；错误使用固定中文消息，回显当前 Key 被隐藏。
- 预览保存在主进程内存并绑定窗口。apply 以 previewId 作 operationId，经 worker 单事务保存来源、原状态、新任务和回执。action_split_batches 支持幂等与未改任务撤销；任何步骤失败回滚。
- 结果面板在 AiWorkspace 中独立于任务列表，数据刷新不卸载结果与撤销入口；关闭/取消忽略晚到结果。导入取消请求、清预览与回执，Key 不受任务导入影响。
