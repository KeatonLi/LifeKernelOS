# Electron 0.3 桌面验收记录

日期：2026-10-03。关联：[SPEC-0012](../specs/current/0012-electron-desktop.md)。

## 已通过

| 检查 | 证据 | 结果 |
| --- | --- | --- |
| 领域、迁移、HTTP、DOM、恢复与冲突回归 | `npm test` | 29/29 |
| Node 22 数据兼容 | Node 22.23.3 运行 desktop.test.ts | 5/5 |
| Electron 内置 SQLite | `ELECTRON_RUN_AS_NODE=1`，Electron 44.5.1 运行 desktop.test.ts | 5/5 |
| 类型与生产构建 | `npm run build` | 通过 |
| Linux 应用目录 | `npm run package:dir` | 通过 |
| 应用资源 | asar 包检查 | main/preload/worker、6 份迁移、renderer 和品牌资源齐全；无 node_modules |
| 收集与转换 | 云浏览器实际保存、指定主线、转换 | 新行动立即出现，1/4→1/5，25%→20% |
| 唯一当前与完成 | 云浏览器设为当前并完成 | 当前释放，2/5、40% |
| 卡住与恢复 | 云浏览器保存原因并恢复 | available，可重新选为当前 |
| 画像与来源 | 云浏览器图谱与任务入口 | 显示主线、知识、完成事实，可追溯来源 |
| 键盘与错误 | DOM 回归 | Escape 关闭返回焦点；数据故障显示重试 |

主工作区脚本从约 529 KB 降至 341 KB，图谱约 189 KB 按需加载；本地字体与资源离线可用。桌面不含 HTTP 服务和原生 SQLite npm 模块。

## 2026-10-04 色彩更新

冷白、石墨黑与朱橙主题通过实际本地预览截图复核；主线、画像、收集和专注使用统一语义 token。29 项回归、类型检查与生产构建通过。主线同内容前后全画面与重点比较、文字对比度及导航往返证据见[视觉 QA](../../design-qa.md)。本次没有改变下列原生桌面待验收范围。

## 当前环境阻塞

Electron 启动在 Chromium singleton Unix socket 初始化时被执行环境拒绝（Operation not permitted）。虚拟显示与 headless 尝试均停在此处；放宽执行权限请求被自动策略拒绝。因此不将 Electron 的 Node 模式数据测试当作完整 Electron 启动验证。

## 仍需在桌面系统验收

- `npm run test:desktop`：真实 main → preload → utility process；首次空工作区、收集转换、专注小窗、完成、退出与重启。
- 原生导出保存、导入数量确认、取消不改数据、备份可恢复。
- 全局快捷键注册、已占用提示、窗口关闭与尺寸恢复。
- 900×640 主窗口、560×680 收集与480×580 专注实际布局。
- macOS/Windows 构建与实机安装；签名、自动升级与运行时 AI 未纳入本轮。

三平台 CI 已提供但尚未运行。使用 [工作流](../../.github/workflows/desktop.yml) 在对应平台完成下一轮验证。
