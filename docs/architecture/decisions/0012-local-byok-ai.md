# ADR-0012：桌面客户端使用用户 API Key 提供任务 AI

> 状态：Accepted
> 日期：2026-10-04
> 依据：用户明确确认定位，要求客户端配置自己的 API Key，并由 AI 帮助拆解任务。
> 影响：PRD、SPEC-0014、桌面安全、任务写入与恢复边界。

## 决策

- 首项 AI 能力：用户请求 → 建议预览 → 编辑选择 → 明确应用 → 可撤销。生成本身不写任务。
- 首版使用 OpenAI Chat Completions 兼容文本接口，配置 Base URL、模型名和 API Key。直接 HTTP 请求，暂不引入 Agent、工具执行或服务端代理。
- Key 在主进程使用 Electron safeStorage 加密保存。读取只返回是否已有 Key；输入新 Key 在成功保存后清空。业务 worker、SQLite、任务 JSON 备份与日志不接收 Key。
- 系统加密不可用或 Linux basic_text 后端时，禁止持久化 Key，允许仅本次运行。解密失败要求重新输入，不明文回退。
- 主进程校验应用窗口与固定命令，处理取消、超时、输出限制与错误脱敏。远程地址用 HTTPS，本机回环允许 HTTP；禁止 URL 凭据、查询参数与重定向。
- 请求前展示目的地与上下文。只发任务标题、内容、卡住原因、主线名称与完成标准，以及用户补充要求；不上传整个画像、知识或数据库。
- 业务 worker 在同一事务校验任务/主线快照，原任务 superseded，创建 1–6 条同主线 available 子任务，保留来源与原安排日。仅清除指向原任务的当前选择，不自动选新任务。
- 操作 ID 保证采纳幂等。撤销只在原任务和新增任务均未改动、目前未被选为当前行动时允许；恢复原任务并将新增任务可恢复移除。

## 取舍与后果

| 方案 | 取舍 |
| --- | --- |
| 用户 Key + 桌面直接请求 | 无需账号或自建代理；服务、模型权限和费用由用户选择 |
| 托管 Key + 服务端代理 | 可提供统一配置计费，但增加账户、额度与部署，后续再讨论 |
| 渲染端保存 Key 并请求 | 扩大秘密与网络权限，不采用 |

safeStorage 保护本机静态秘密，不能承诺防御同一用户权限下的恶意软件。系统密钥服务与未签名 macOS 更新的权限提示需实机验收。

## 实施与验证

行为以 [SPEC-0014](../../specs/current/0014-byok-ai-task-decomposition.md) 为准。拆解回执是本机恢复元数据，不随任务导出，导入时清除。已有任务导出 v7 与 Key 配置相互独立。

验证无秘密回读、加密/仅会话、重定向拒绝、错误脱敏、取消无写入、快照冲突、采纳幂等、事务回滚与保护后续修改的撤销。

官方依据：[Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)、[DeepSeek API](https://api-docs.deepseek.com/)、[OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat)。
