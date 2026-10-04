# LifeKernelOS

LifeKernelOS 是一个本地桌面行动工作区：把想法随手记下来，把主线拆成可执行的小步骤，此刻只做一件事，并把真实行动与知识留在自己的画像里。

默认客户端使用 **Electron + React + TypeScript**。打开即可用，无需登录、部署服务或联网。记录保存在本机；主线进度来自完成事实。

![主线工作区](docs/images/desktop-carbon-mainline.jpg)

## 本轮产品内容

- **主线**：多个方向、任务内容、派生进度与一个全局当前行动。支持完成、拆小、卡住、恢复、放弃和暂时放下。
- **快速记下**：不必先分类，稍后再整理到主线。完整保留最多 2000 字符。
- **我的画像**：主线、完成事实、知识、自我描述和经历的可追溯图谱。
- **桌面体验**：专注小窗、收集小窗、快捷键、自动保存、导出、确认后备份导入。
- **视觉**：冷白与石墨黑，朱橙强调当前行动和主要操作；清楚的文字层级、低噪声侧栏，完成操作留在首屏。

产品方向是“增强 Todo + AI 帮助开始行动 + 事件触发”。本轮先交付本地行动底座，**尚未连接运行时 AI**。下一阶段优先拆解任务、建议下一步与帮助处理卡住；AI 建议须由用户确认，不替用户判断人格、能力或人生优先级。

## 启动桌面客户端

需要 Node.js 22.13 或以上，建议 Node.js 24 LTS，以及桌面图形环境。

```bash
npm ci
npm run dev
```

开发启动会自动构建 Electron 主进程并打开桌面窗口。应用只有一个 SQLite 业务进程，窗口通过受限 IPC 访问，不启动 HTTP API 服务。

使用生产资源运行：

```bash
npm run build
npm start
```

快捷键：`Cmd/Ctrl + K` 快速记下，`Cmd/Ctrl + Shift + Space` 全局收集小窗，辅助窗口 `Esc` 关闭。如果全局快捷键被占用，可从应用菜单打开。

## 数据与迁移

- 数据存于操作系统的应用 userData，包含 `lifekernel.sqlite` 与 `backups/`。设置页可打开目录。
- 每次启动和导入前生成 JSON 备份，保留最近 10 份。
- 旧服务端用户先导出 schemaVersion 6 JSON，再从桌面设置导入。客户端会显示数量，明确确认后备份并事务替换；失败回滚。
- 导出不含密码或 Session。当前无云同步、自动升级与模型调用。

## 构建安装包

```bash
npm run package:dir  # 当前平台的应用目录，输出 release/
npm run package      # 当前平台的安装包，不自动发布
```

macOS：DMG/ZIP；Windows：NSIS；Linux：AppImage/tar.gz。各平台请在相应系统构建。仓库提供三平台 GitHub Actions 工作流，生成未签名预览包；签名与正式发布另行配置。

## 验证与当前状态

```bash
npm run docs:check
npm test
npm run build
npm run test:desktop # 真实 Electron 启动、IPC、小窗及重启测试；需要图形环境
```

PRD v0.9、ADR-0009 已接受；SPEC-0012 为 `Implemented`。29 项自动化回归、浏览器核心交互、Electron 内置 SQLite 数据测试及 Linux 打包目录已通过。当前执行环境禁止 Electron 所需的 Unix socket，**完整桌面进程、原生对话框、全局快捷键与 macOS/Windows 实机仍待验收**，未标记 `Verified`。

详见 [桌面验收记录](docs/development/desktop-acceptance.md) 与 [视觉 QA](design-qa.md)。界面预览使用独立示例工作区，不会在首次桌面启动时生成示例记录：

```bash
npm run dev -- --preview
```

## 兼容 Web 入口

Fastify Web 入口保留用于旧部署，使用独立数据库与服务端账号：

```bash
LK_SEED_EMAIL="you@example.com" LK_SEED_PASSWORD="请使用自己的强密码" npm run db:seed
npm run dev:legacy
```

## 产品与协作事实源

从 [AGENTS.md](AGENTS.md) 或 [llms.txt](llms.txt) 进入，按 [文档索引](docs/README.md) 路由。[PRD](docs/product/PRD.md) 记录产品范围，[ADR-0009](docs/architecture/decisions/0009-electron-local-desktop.md) 记录桌面选择，[SPEC-0012](docs/specs/current/0012-electron-desktop.md) 记录可验证行为。

需求先进入 PRD/ADR/Spec，再实现与验证；`Implemented` 与 `Verified` 分开记录。`sources/` 保持只读。
