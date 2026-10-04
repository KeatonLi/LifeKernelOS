# ADR-0009 Electron 本地桌面客户端

> 状态：Accepted
> 日期：2026-10-03
> 决策依据：用户明确选择 Electron，并要求优化整体样式与产品设计。
> 替代：ADR-0003 的默认部署、认证和数据事实源。

## 背景

服务端部署、登录和浏览器入口增加了个人行动工具的使用成本。已有 React 交互与 SQLite 领域逻辑应当复用，客户端必须打开即可用、离线可写、重启不丢数据。

## 决策

- 默认产品为 Electron + React + TypeScript 桌面客户端。Fastify 保留为兼容 Web 入口。
- React 只通过受限 preload bridge 调用用例；不开启 Node integration，启用 context isolation 和 sandbox。
- Electron 主进程管理窗口、快捷键、原生文件对话框；utility process 独占 SQLite 与领域用例，不开放 HTTP 端口。
- SQLite 使用 Node 内置驱动，保留现有迁移与 SQL，避免不同 Electron ABI 的原生模块重编译。
- 数据写入 OS 的 userData，迁移从应用资源加载，均不依赖启动目录。
- 本地单用户无登录。可导入旧服务端 schemaVersion 6 JSON，导入前自动备份；不迁移密码和 Session。
- 保留两个一级入口，快速收集和专注小窗是辅助入口。视觉基线由 SPEC-0012 定义；2026-10-04 按用户要求调整为冷白、石墨黑和朱橙，保持细边框与有节奏的留白。
- 运行时 AI 是后续独立切片：根据开始、卡住、完成等事件提出建议，用户确认后写入。当前不伪装模型响应。

## 后果

失去默认跨设备访问；自动同步、AI 提供商、签名和自动升级需要独立规格。多窗口必须广播已提交变化，并验证当前行动 ID，防止旧窗口误处理新选择。备份恢复必须先校验关系、再事务替换，失败不能破坏现有数据。

## 追溯

[PRD](../../product/PRD.md)、[SPEC-0012](../../specs/current/0012-electron-desktop.md)、[技术设计](../technical-design.md)。
