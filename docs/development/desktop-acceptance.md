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

以上为 0.3 的历史验收状态。

## 2026-10-04 基础 Todo 0.4

关联：[SPEC-0013](../specs/current/0013-basic-todo-and-calendar.md)。保留已认可的冷白、石墨黑与朱橙，不接入运行时 AI。

| 检查 | 证据 | 结果 |
| --- | --- | --- |
| 完整领域/HTTP/DOM/恢复回归 | `npm test` | 46/46；新增 17 项 Todo/日历回归 |
| Electron 内置 SQLite | Electron 44.5.1 Node 模式运行 Todo 与 desktop 数据测试 | 12/12；真实 v6 DB 升级及 v6/v7 备份往返 |
| 类型与生产构建 | `npm run build` | 通过；业务进程与本地 renderer 资源构建 |
| 日期创建与编辑 | 浏览器 10月8日选日新建，清除后重新填日期并保存、刷新 | 内容与日期保留；清除进入未安排 |
| 直接完成与恢复 | 浏览器勾选、即时撤销、移除取消/确认与恢复 | 恢复内容/日期；不释放其他当前任务 |
| 多视图与筛选 | 浏览器列表、今日、月/周、搜索与主线筛选 | 同一任务 ID 与事实；选10月8日后周历为10月5—11日 |
| 视觉与运行 | [QA](../../design-qa.md)、[月历](../images/todo-calendar.jpg)、[列表](../images/todo-list.jpg) | 保留主题；无页面横向溢出；未观察到应用来源 warn/error |

真实 Electron 启动/IPC/隔离/重启测试已扩展日期与“处理其他任务不清除当前”场景。三平台 CI 和标签发布按 [CI/CD](ci-cd.md) 自动运行；本地环境的 Unix socket 限制仍存在，不将 Node 模式等同于原生桌面验证。原生对话框、快捷键、最小窗口和实机安装继续待验收。
