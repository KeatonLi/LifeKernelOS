# LifeKernelOS 详细技术设计

> 版本：0.9
> 状态：Accepted
> 更新时间：2026-10-03
> 范围：SPEC-0012 与现有主线、画像、快速收集
> 决策：[ADR-0009](decisions/0009-electron-local-desktop.md)

## 技术与目录

- Electron 44、React 19、TypeScript、Vite、Phosphor Icons、React Flow。
- SQLite 使用 node:sqlite DatabaseSync，适配现有 prepare/transaction 接口；事务支持嵌套 savepoint。
- apps/api/src 保存复用领域服务；apps/desktop/src 保存 main、preload、worker 与 JSON 恢复。
- 构建：Vite 输出 dist，esbuild 输出 dist-desktop。打包包含迁移与本地品牌资产，无原生 SQLite npm 依赖。

## IPC 与用例

固定 bridge 接收 method/path/body，后台路由只允许注册的业务路径。Zod 校验原始 IPC 输入，用户 ID 由本地进程确定，渲染端不能指定。主进程校验 sender 是已创建窗口且 URL 为应用 origin；回复为成功数据或结构化业务错误。超时与进程退出清理挂起请求。所有已提交写入广播 data-changed，窗口重新加载所需事实。

所有当前操作传 expectedActionId 并在事务内比对选择，冲突返回 CURRENT_ACTION_CHANGED。阻塞恢复仅限 blocked 与 active Goal。Action content 最大 2000，与 Capture 一致。

## 身份、迁移、备份

本地身份复用 users 归属模型，使用不可登录的本地占位凭据。初次启动仅创建身份，不生成任务。createDatabase 显式接受 migrationsPath，默认以源码位置解析；发布用 app 资源绝对路径。

导出保持 schemaVersion 6，不含身份秘密。导入只接收该版本，校验全部数据字段、ID 唯一性与引用归属；映射导出 userId 至本地用户，保留业务 ID 与时间。导入前原子写入当前 JSON 备份，再事务清除用户业务数据并插入全部关系。任何失败回滚。启动备份与导入备份保留最近 10 份，设置可打开目录。

## 桌面与视觉

主窗口默认 1360×900、最小 900×640，持久化尺寸。快速收集约 520×620；专注窗约 460×540，可置顶。主窗口 Cmd/Ctrl+K 收集，Cmd/Ctrl+Shift+Space 全局收集。导航仅主线和画像，设置底部。暖白背景、墨绿当前行动、柔和边框、统一字号和间距；窄窗独立布局。用户正文按文本渲染，不允许 HTML。

## 验证

领域事务与旧迁移测试、桌面恢复与错误输入测试、React 主要路径交互测试、生产构建、Electron 实际启动/隔离/多窗口/重启验证、浏览器截图检查、文档链接检查。各平台安装与签名独立记录，不混同本地 Linux 验证。
