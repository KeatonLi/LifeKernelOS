# Electron 工作区视觉 QA

日期：2026-10-03。范围：浏览器渲染的桌面界面与关键交互；Electron 原生窗口单独记录在[桌面验收](docs/development/desktop-acceptance.md)。

## 比较目标与证据

本次是用户要求的重新设计。视觉意图以 [PRD v0.9](docs/product/PRD.md) 和 [SPEC-0012](docs/specs/current/0012-electron-desktop.md) 的暖白、墨绿、清楚层级和当前行动重点为准。旧截图是可见问题的基线，不要求复刻旧蓝色界面。

| 证据 | 路径 | 像素尺寸与状态 |
| --- | --- | --- |
| 主线原始基线 / source visual truth | [desktop-before.jpg](docs/images/desktop-before.jpg) | 1348×926；2 条主线，当前主线 4 项任务、1 项完成、25%，第 2 项为当前 |
| 主线最终实现 | [desktop-mainline.jpg](docs/images/desktop-mainline.jpg) | 1363×936；同一内容、选择、完成事实和收集数量 |
| 全视图合并比较 | [desktop-comparison.jpg](docs/images/desktop-comparison.jpg) | 两张图在同一输入中比较；等比缩放到 1348×926 的画布，保留整幅内容 |
| 当前行动重点比较 | [desktop-action-comparison.jpg](docs/images/desktop-action-comparison.jpg) | 原始像素裁剪，检查标题、正文、完成标准、操作位置与对比度 |
| 画像修正前 / 后 | [desktop-profile-before.jpg](docs/images/desktop-profile-before.jpg)、[desktop-profile.jpg](docs/images/desktop-profile.jpg) | 均 1348×926；2 条主线、1 项完成、1 项知识，同一图谱状态 |
| 图谱重点比较 | [desktop-profile-comparison.jpg](docs/images/desktop-profile-comparison.jpg) | 同一输入包含前后节点标题与连线 |
| 收集修正前 / 后 | [desktop-capture-before.jpg](docs/images/desktop-capture-before.jpg)、[desktop-capture.jpg](docs/images/desktop-capture.jpg) | 均 1363×936；同一条想法，输入为空、抽屉打开 |
| 收集重点比较 | [desktop-capture-comparison.jpg](docs/images/desktop-capture-comparison.jpg) | 同一输入包含前后记录卡片、类型、日期和操作 |
| 专注模式 | [desktop-focus.jpg](docs/images/desktop-focus.jpg) | 1363×936 浏览器，内容栏实测 480 CSS px；不等同于 480×580 原生窗口验收 |

浏览器 DOM 读回主线 / 专注 viewport 为 1363×936 CSS px、devicePixelRatio=1。画像截图捕获为 1348×926。主线基线与最终画面有 15px / 10px 的捕获差异，比较按完整内容等比归一，未作逐像素一致性结论。字号、换行、首屏完成操作和节点关系分别用重点裁剪与 DOM 尺寸补充判断。

## 发现、修正与迭代

1. **[P1，已修正] 旧主线标题与详情标题过大，完成操作落到首屏之外。** 基线标题占据过多高度，任务详情换行明显。主线标题改为 21px，当前行动标题改为 24px，拆开页面标题与主线卡片层级，使用墨绿当前面板与鼠尾草绿完成按钮。最终主线截图能同时看到进度、4 项任务和完成操作；DOM 读回按钮 top≈773、bottom≈819，小于 936px viewport 高度。
2. **[P2，已修正] 画像长名称被单行省略，左侧来源连线绕回。** 修正前主线和知识名称不完整；字号 14px 随图谱缩放。改为 16px、最多两行、保留完整 title 提示，事实文字改为 11px；为左右布局分配正确的连接 Handle。修正后同一张图谱的主线和知识名称完整显示，连线沿正确方向连接；Enter 能打开对应主线。
3. **[P2，已修正] 收集记录的样式选择器与实际组件类名不一致。** 修正前条数单独占一行、类型控件过宽、日期与操作紧挨，记录缺少分组。将 CSS 对齐 capture-card / capture-meta / capture-actions / capture-convert，恢复卡片边界、横向元信息、操作间距和转换表单布局。修正后重点比较显示清晰记录卡片与分离操作；转换表单有完整标签和独立确认按钮。
4. **[P2，已修正] 次要文字原色偏浅。** 对暖白背景上的说明、日期、任务事实和设置说明统一提高对比度；当前面板说明使用浅绿灰，保留安静的色调。最终截图和重点区域复核通过。

每个 P1/P2 修正都重新捕获实现；主线、图谱、收集的前后图置于同一比较输入。代码格式化、构建和打包未作为视觉 QA 迭代证据。

## 五项必查表面

| 表面 | 结果 |
| --- | --- |
| 字体与排版 | Manrope Variable 本地加载，中文使用系统字体；页面标题 29px，主线 21px，详情 24px。长任务内容保留换行并允许区域滚动，图谱标题两行；没有旧版本的大标题压迫感。macOS/Windows 系统中文字体仍需实机观察。 |
| 间距与布局 | 侧栏、页头、主线、列表和当前行动层级清楚；卡片与表单有一致边界和间距。当前浏览器无横向溢出，主线完成按钮在首屏。原生最小窗口及辅助窗口高度仍待实机验收。 |
| 色彩与对比度 | 画布 #f8f9f5、表面 #fffefa、正文 #27332c、当前面板 #354a3c、完成按钮 #b8cca2。次要文字 #626f56；当前面板次要文字 #b5c4a9，计算对比度约 5.2:1。状态同时以文字和图标说明。 |
| 资产与图标 | 保留仓库原有品牌 PNG 与 favicon，无替代品牌绘图。Phosphor 图标风格一致、边缘清晰；图谱为真实数据节点与关系，没有截图冒充交互。 |
| 文案与内容 | 主线回答现在能推进什么，收集允许先记下再整理，画像表达行动事实；设置明确 AI 尚未接入。预览为独立示例工作区，生产首次启动为空。 |

## 交互与控制台

- 在独立预览工作区实际保存收集、指定主线转换，任务与进度从 1/4、25% 更新为 1/5、20%。
- 选为当前并完成，当前释放，进度变为 2/5、40%；保存阻塞原因、恢复和重新选择可用。
- 画像当前任务入口与图谱来源能跳转；图谱节点 Enter 跳转同样通过。
- 收集弹层有标签和焦点边框，背景 inert；Escape / 关闭恢复到“快速记下”焦点。转换表单视觉复核通过。
- 专注模式显示同一当前行动；返回主线通过。原生置顶、全局快捷键和对话框尚未在操作系统进程验证。
- 控制台最新 12 条 warn/error 记录已检查，均来自 chrome-extension 的 metadata 发送错误，未包含应用来源错误；未把浏览器扩展错误记为应用错误。自动化加载错误与重试场景另有回归覆盖。

## 实施检查与剩余范围

- [x] 重新设计后的主线全视图与重点区域比较。
- [x] 修正图谱标题、来源线和收集记录样式，重新捕获复核。
- [x] 29 项自动化回归、类型与生产构建、Linux 应用目录打包通过。
- [ ] Electron 实机窗口、原生对话框、全局快捷键、macOS/Windows 字体与安装验证。
- [ ] 运行时 AI、同步、签名与自动升级属于后续阶段。

当前浏览器证据内没有剩余可行动的 P0/P1/P2 视觉发现。这里的通过仅表示这轮浏览器视觉与交互复核通过；SPEC-0012 保持 Implemented。

final result: passed
