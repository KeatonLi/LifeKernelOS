# Electron 工作区视觉 QA

日期：2026-10-04。范围：本地实际运行的 React 界面。Electron 原生窗口、文件对话框与全局快捷键的未验证范围仍以[桌面验收](docs/development/desktop-acceptance.md)为准。

## 比较目标与证据

用户要求重新设计色调。以当前 [PRD v0.9](docs/product/PRD.md) 与 [SPEC-0012](docs/specs/current/0012-electron-desktop.md) 为视觉契约：冷白工作区、石墨黑当前行动、朱橙操作强调。旧暖白墨绿截图是结构与内容基线，颜色差异是本轮明确要求。

| 证据 | 文件 | 状态与尺寸 |
| --- | --- | --- |
| 本轮调整前 | [desktop-palette-before.jpg](docs/images/desktop-palette-before.jpg) | 1363×936；2 条主线、1/4 完成、25%、第二项为当前 |
| 最终主线 | [desktop-carbon-mainline.jpg](docs/images/desktop-carbon-mainline.jpg) | 相同 viewport、内容与状态；1363×936 |
| 全画面比较 | [desktop-carbon-comparison.jpg](docs/images/desktop-carbon-comparison.jpg) | 左为调整前，右为最终；原始像素并排，无缩放 |
| 当前行动重点比较 | [desktop-carbon-action-comparison.jpg](docs/images/desktop-carbon-action-comparison.jpg) | 同一输入内比较标题、正文、元信息和完成操作 |
| 画像 | [desktop-carbon-profile.jpg](docs/images/desktop-carbon-profile.jpg) | 1348×926；2 条主线、1 项知识及相同当前行动 |
| 快速收集 | [desktop-carbon-capture.jpg](docs/images/desktop-carbon-capture.jpg) | 1348×926；输入为空、原有一条待整理记录 |
| 专注 | [desktop-carbon-focus.jpg](docs/images/desktop-carbon-focus.jpg) | 1363×936 浏览器；内容栏 480 CSS px，不等于原生 480×580 窗口 |

主线前后 DOM viewport 均为 1363×936 CSS px，devicePixelRatio=1。画像与收集的浏览器捕获尺寸为 1348×926；不作它们与主线截图逐像素一致的结论。聚焦当前行动的原始像素比较补充全画面中文字缩小时的信息。

## 发现与迭代

- **[P2，已修正] 橙色小字在浅色状态背景上的对比度不足。** 首轮 accent 文本在 accent-soft 上约 4.20:1，在 surface-inset 上约 4.02:1。增加独立 `accent-ink`，按钮保留朱橙，小字用更深的橙色。修正后分别为 5.78:1、5.52:1；重新捕获最终主线并更新同一输入的全画面与重点比较。
- **[P2，已修正] 深色区域需独立的错误提示文字。** 默认 danger 在 focus-bg 上约 2.32:1；增加 danger-on-focus，深色区域错误提示为 8.62:1。
- 同状态最终比较未发现新增的裁切、换行、布局或操作位置回归；完成按钮 bottom≈819，位于 936px 首屏内，页面无横向溢出。

## 五项必查表面

| 表面 | 结论 |
| --- | --- |
| 字体与排版 | 保留本地 Manrope Variable 与系统中文字体、原有字号、行高和字重。主标题、主线、当前行动的层级和换行保持一致。 |
| 间距与布局 | 保留已验证的双栏任务板、侧栏宽度与表单布局；全画面及当前行动重点比较未发现位置回归。原生最小窗口仍待实机。 |
| 色彩与对比度 | 全部旧 CSS 颜色改为语义 token。canvas #f3f4f5、surface #ffffff、focus-bg #22272b、accent #c94a28。正文/白底 15.62:1，次要文字/画布 4.85:1、次要文字/侧栏 4.50:1、按钮白字/朱橙 4.67:1、深色区域次要文字 7.48:1。颜色与状态文字共同表达含义。 |
| 资产与图标 | 保留原品牌 PNG 与 Phosphor 图标，无新绘制资产；图谱节点与真实关系保留，连接线、网格和控件共享 token。 |
| 文案与内容 | 保留产品文案和同一组示例事实，未加入模型回复或 AI 交互。生产首次打开仍为空工作区。 |

## 交互与运行

- 本地预览通过实际业务用例读取独立示例数据库。
- 主线 → 画像、画像“打开当前 To-do” → 同一行动、主线 → 专注 → 回到主线通过。
- 收集面板打开、聚焦、关闭返回“快速记下”焦点通过。
- 最新 15 条 warn/error 检查只包含浏览器扩展 metadata 发送错误，无应用来源错误。
- 29 项自动化回归、类型检查、Vite 与桌面生产构建通过。
- 首轮截图后发现对比度问题，修正并重新捕获最终实现；最终比较没有剩余可行动的 P0/P1/P2 视觉问题。

## 剩余范围

- Electron 原生窗口、快捷键、文件对话框及 macOS/Windows 安装继续待验收；没有把浏览器截图当成 Electron 实机截图。
- 2026-10-03 的原始蓝色与暖白墨绿历史证据保留在 docs/images；本轮保持它们的布局修正结果。
- 运行时 AI、同步、签名与自动升级未纳入本轮；SPEC-0012 保持 Implemented。

## 2026-10-04 基础 Todo 与日历增量

用户已认可上方色彩结果。本次以 [desktop-carbon-mainline.jpg](docs/images/desktop-carbon-mainline.jpg) 作为视觉基线，按 [PRD v0.10](docs/product/PRD.md)、[SPEC-0013](docs/specs/current/0013-basic-todo-and-calendar.md) 扩展主线内视图。月/周日历属于新增页面，验证同一套 token、字体和组件，不宣称与旧主线逐像素相同。

| 证据 | 文件 | 内容与捕获尺寸 |
| --- | --- | --- |
| 主线增量 | [todo-mainline.jpg](docs/images/todo-mainline.jpg) | 原主线 1/4、25%、同一当前行动；1348×926 |
| 同一输入全画面比较 | [todo-mainline-comparison.jpg](docs/images/todo-mainline-comparison.jpg) | 左为用户认可截图，右为新主线；右图按 viewport 归一化至1363×936，非原始像素完全匹配结论 |
| 当前行动重点比较 | [todo-action-comparison.jpg](docs/images/todo-action-comparison.jpg) | 对齐当前行动卡片，检查标题、完整正文、日期元信息与完成按钮；1210×445 |
| 任务列表 | [todo-list.jpg](docs/images/todo-list.jpg) | 4项未完成；新建阅读笔记详情；1363×936 |
| 今日 | [todo-today.jpg](docs/images/todo-today.jpg) | 今天安排的当前任务；1363×936 |
| 月历 | [todo-calendar.jpg](docs/images/todo-calendar.jpg) | 42日、选中10月8日、当天任务及新建入口；1348×926 |
| 周历 | [todo-week.jpg](docs/images/todo-week.jpg) | 10月5—11日，选中日期与同一任务；1363×936 |

DOM viewport 为1363×936 CSS px、dpr=1；工具部分捕获为1348×926。新日历数据含浏览器实际新建的阅读笔记，与旧主线比较采用的第一条主线数据分开说明。未把捕获缩放或新增视图的结构差异误报成视觉缺陷。

### 发现与修正

- **[P2，已修正] 日期另占一行将主线完成操作推至首屏底部。** 日期移入现有元信息，收紧视图导航间距；最终完成按钮 bottom≈870 CSS px，936px 首屏可见。旧主线同内容比较没有新增正文裁切。
- **[P2，已修正] 原生日历输入显示已改、React 状态却未提交。** 同时处理 input/change；浏览器重新编辑、保存及刷新后日期保留，并补回归。其他字段编辑不重置日期。
- **[P2，已修正] 月转周曾跟随旧月份锚点。** 改为跟随选定日；10月8日切周落在10月5—11日。
- **[P2，已修正] 编辑期间筛选可能重置未保存表单。** 编辑时禁用筛选、翻页和行勾选；关闭后回到可用的入口焦点。
- **[P2，已修正] 月历编辑未安排任务误带选定日期。** 仅新建任务采用选定日，编辑保留原日期，包括空值。浏览器已确认日期输入为空且其他任务按钮禁用；增加保存后日期仍为空的回归。拆小也支持继承、明确改期与清除，非法日期不会部分提交。

### 五项表面与交互复核

| 表面 | 增量结论 |
| --- | --- |
| 字体与排版 | 继续本地 Manrope 与系统中文字体；任务标题、详情、日期层级清晰。日历预览10px，完整标题和正文可在选定日/详情访问。 |
| 间距与布局 | 复用侧栏、工作区标题与详情卡。列表和日历均无页面横向溢出；小屏日历采用内部滚动，原生最小窗口仍需实机验收。 |
| 色彩与对比度 | 不改变用户认可的语义 token；选中日使用浅朱橙，今天使用石墨黑。日期、完成、当前、移除均有文字/图标辅助。 |
| 资产与图标 | 复用品牌 PNG、Phosphor 图标；没有新增生成图片或远程字体。 |
| 文案与内容 | 日期表示安排日；未安排保留入口。明确完成、撤销、移除确认与恢复，没有 AI 文案或模型调用。 |

实际浏览器完成了选日新建、日期清除/重新安排、直接勾选/撤销、取消与确认移除/恢复、搜索和主线筛选、刷新保存、月周切换。最终最新12条 warn/error 仅为浏览器扩展 metadata 错误，无应用来源错误。46项回归与生产构建通过；原生桌面范围继续按验收记录保留，SPEC-0012/0013 为 Implemented。

最终同一输入全画面与重点比较、实际新视图截图已查看；当前验收范围没有剩余可行动的 P0/P1/P2 问题。

final result: passed
