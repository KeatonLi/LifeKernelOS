# LifeKernelOS v0.7 设计验收

> 日期：2026-09-06
> 范围：`主线`任务板、`我的画像`汇聚图谱与响应式控制台

## 参考与实现对照

| 页面 | 参考稿 | 实现截图 | 结论 |
| --- | --- | --- | --- |
| 主线任务板 | `exec-560cef97-208a-4807-9d48-64827abf297b.png` | `/tmp/lifekernel-mainline-implementation.png` | 保留左侧 To-do 列表、右侧内容详情和单一主操作；替换为黑白灰与高饱和蓝，并增加真实进度。 |
| 我的画像 | `exec-23883e5d-0d69-4468-aea3-c41658ab0cc9.png` | `/tmp/lifekernel-profile-implementation-refined.png` | 保留中心 self、主线辐射、知识来源连线和可缩放画布；主线节点显示真实 `完成 / 总数 / 百分比`。 |

对照图已在同一视觉输入中审阅：`/tmp/lifekernel-mainline-comparison.png`、`/tmp/lifekernel-profile-comparison-refined.png`。

## 设计检查

- 信息层级：每个页面首屏只有一个明确重点；主线页直接呈现主线进度和选中 To-do，画像页先呈现图谱。
- 视觉语言：以近白画布、白色卡片、深黑文字和电蓝交互色构成主色；完成与知识状态使用小面积绿色，不使用暖黄灰或渐变。
- 图谱：使用真实可缩放、可平移的 React Flow 节点与边，不用静态示意图；进度条来自服务端投影。
- 易用性：桌面端主线内容在同一任务板内阅读和操作；窄屏转为单列，并保留两级导航、设置齿轮和主要操作。
- 图标：导航、状态与动作使用 Phosphor 图标库；favicon 在登录和控制台路由均保留。

## 运行验收

- 在 `http://127.0.0.1:4173` 使用演示账号登录成功，并能切换主线、我的画像和设置入口。
- 已检查桌面端主线任务板、桌面端画像图谱和 390px 窄屏主线布局；浏览器控制台无新增错误或警告。
- 已确认控制台页面的 favicon 链接为 `/brand/favicon.svg?route=%2Fprofile`。

## 待真实用户验收

- 用真实主线、To-do 内容和知识记录检验长期使用时的命名与阅读习惯。
- 设置页的实际文件下载交由用户浏览器验收，因此相关 Spec 保持 `Implemented`，不提前标记为 `Verified`。

## Final result: passed
