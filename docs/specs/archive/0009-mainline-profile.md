# SPEC-0009 我的画像与知识沉淀

> 状态：Superseded
> 对应 PRD：场景三
> 依赖：`SPEC-0001`、`SPEC-0008`
> 目标：让用户从自己已经完成的主线与任务中，看见一份可追溯、可自己确认的经历画像，并可视化管理正在形成的知识沉淀。
> 历史说明（2026-09-06）：本文记录旧 Focus / 主线画像实现。当前 Goal 语义、双 Tab 导航和汇聚图谱由 `SPEC-0011` 定义；本文不再作为当前界面术语依据。
> 文档分区：Archive；不作为当前画像行为或 API 依据

## 1. 用户目标

用户完成过一些长期主线和任务，却很难回看“自己已经做成过什么、正在积累什么、还有什么需要沉淀”。他希望看到的不只是数字，而是一份基于真实经历的个人描述和知识沉淀图；这份描述必须由自己认可，而不是被系统擅自定义。

## 2. 产品原则

- 画像是“主线经历的沉淀”，不是人格测试、能力评级或心理诊断。
- 每个统计与经历卡片都必须能追溯到当前用户的一条 Focus 或 Action。
- 系统只生成事实概览；用户本人决定一条主线意味着什么，以及如何描述自己。
- 没有已完成主线时不要求用户填写画像，直接说明它会随主线完成而沉淀。
- 知识不是独立的收藏夹：每一条知识都必须关联一条当前或已完成的主线。
- 知识状态由用户确认，系统不根据任务数量自动判定“已经掌握”。

## 3. 范围

### In scope

- 在工作台左侧提供“我的画像”导航项。
- 展示当前用户的事实概览：已完成主线数、已完成任务数，以及当前主线（如有）。
- 展示每条已完成主线的名称、完成时间、完成任务数与可选经历总结。
- 用户可为一条已完成主线新建、编辑或清空经历总结。
- 用户可编辑一段整体“我的描述”。
- 以三列知识沉淀图展示当前用户的知识：已沉淀、正在进行、待沉淀。
- 用户可创建一条关联主线的知识，修改其状态或删除它。
- 用户可在画像中查看一条事实对应的主线详情；原始主线和任务只读展示。
- 刷新和跨设备登录后恢复画像内容。

### Out of scope

- AI 自动撰写或改写画像内容。
- 根据完成数量给用户贴“自律”“优秀”等性格或能力标签。
- 价值观测评、职业测评、人格分类、心理诊断与用户排名。
- 其他用户、团队或公开资料的比较。
- 用户自定义标签体系、复杂图表、成就勋章与社交分享。
- AI 自动识别、分类或评价用户是否掌握某项知识。

## 4. 最小数据

### FocusReflection

```text
FocusReflection {
  id: UUID
  userId: UUID
  focusId: UUID                 // 当前用户的一条 completed Focus，唯一关联
  summary: string               // 去首尾空白后 1—500 字符
  createdAt: ISODateTime
  updatedAt: ISODateTime
}
```

### ProfileDescription

```text
ProfileDescription {
  userId: UUID                  // 每个用户最多一条
  content: string               // 去首尾空白后 1—500 字符
  updatedAt: ISODateTime
}
```

### KnowledgeItem

```text
KnowledgeItem {
  id: UUID
  userId: UUID
  focusId: UUID                  // 当前用户的一条 active 或 completed Focus
  title: string                  // 去首尾空白后 1—80 字符
  status: in_progress | needs_consolidation | consolidated
  note?: string                  // 可选，去首尾空白后 1—300 字符
  consolidatedAt?: ISODateTime   // 仅 consolidated 时存在
  createdAt: ISODateTime
  updatedAt: ISODateTime
}
```

- 创建时默认 `in_progress`。
- `needs_consolidation` 表示用户已经获得零散认识、但需要整理或验证；不代表系统认定它“紧急”。
- `consolidated` 只能由用户手动确认；首次确认时写入 `consolidatedAt`。

### ProfileView

这是读模型，不单独持久化：

```text
ProfileView {
  factSummary: {
    completedFocusCount: number
    completedActionCount: number
    activeFocus?: { id: UUID, title: string, progressPercent: number }
  }
  description?: ProfileDescription
  knowledgeItems: KnowledgeItem[]
  experiences: Array<{
    focus: Focus
    completedActionCount: number
    reflection?: FocusReflection
  }>
}
```

事实统计从 Focus 与 Action 实时计算；不能把统计数字保存为可编辑值。

## 5. 领域规则

- 只读取和写入当前用户的数据；跨用户的 Focus 或 Action 一律按不存在处理。
- 只有 `completed` Focus 可以拥有 FocusReflection；一条完成主线最多一条经历总结。
- 画像中一条 Focus 的完成任务数，只统计其 `status = completed` 的 Action。
- FocusReflection 与 ProfileDescription 去首尾空白后为空时，删除已有内容而非保存空字符串。
- KnowledgeItem 必须关联当前用户的一条 active 或 completed Focus；不允许关联其他用户的主线。
- KnowledgeItem 状态只能为 `in_progress`、`needs_consolidation` 或 `consolidated`。首次变更为 `consolidated` 时写入 `consolidatedAt`；再次编辑标题或备注不改写该时间。
- 删除一条 KnowledgeItem 不删除或修改其关联的主线、任务、经历总结和整体描述。
- 编辑或清空画像文字不会修改 Focus、Action、进度或完成时间。
- 没有 completed Focus 时，`experiences` 为空，事实概览仍返回 `0` 和当前主线；页面不显示错误。
- 页面不得显示“系统认为你是……”等推断文案；事实概览使用中性表述，例如“你已完成 2 条主线、18 项任务”。

## 6. 用户可见流程

### 6.1 首次打开我的画像

1. 用户从工作台左侧点击“我的画像”。
2. 系统读取 ProfileView。
3. 若没有已完成主线，页面说明“完成的主线会在这里沉淀为你的经历”，并展示当前主线（如有）。
4. 不弹出引导表单，也不要求用户填写整体描述。

### 6.2 回看完成主线

1. 用户查看一条完成主线经历卡片。
2. 页面展示主线标题、完成时间、完成任务数及已有经历总结。
3. 用户可打开原始主线详情，只读回看任务事实。

### 6.3 留下一条经历总结

1. 用户在某条完成主线中填写“这段经历让我完成或积累了什么”。
2. 系统校验并保存 FocusReflection。
3. 页面立即在该经历卡片展示这段文字；原始主线和任务不发生变化。

### 6.4 编辑我的描述

1. 用户编辑一段整体的“我的描述”。
2. 系统保存 ProfileDescription。
3. 用户可随时修改或清空；清空后页面只展示事实概览和经历卡片。

### 6.5 查看并维护知识沉淀图

1. 用户在“我的画像”中首先看到知识沉淀图：已沉淀、正在进行、待沉淀三个区域。
2. 用户添加一条知识时，只填写名称、关联主线和可选备注；初始进入“正在进行”。
3. 用户根据实际情况把知识移到“待沉淀”或“已沉淀”。
4. 用户可以查看一条知识关联的主线，但知识状态不会自动改变主线进度。

## 7. API 与模块边界

### Application

- `GetProfileView(userContext)`：聚合事实概览、当前主线、完成主线、任务数和画像文字。
- `UpsertFocusReflection(userContext, focusId, summary)`：仅对当前用户的 completed Focus 写入或更新总结。
- `DeleteFocusReflection(userContext, focusId)`：清空该主线总结。
- `UpsertProfileDescription(userContext, content)`：写入或更新整体描述。
- `DeleteProfileDescription(userContext)`：清空整体描述。
- `CreateKnowledgeItem(userContext, input)`：为当前用户的一条主线创建知识，初始状态为 `in_progress`。
- `UpdateKnowledgeItem(userContext, knowledgeId, input)`：更新标题、备注或状态。
- `DeleteKnowledgeItem(userContext, knowledgeId)`：删除当前用户的一条知识。

### HTTP

```text
GET    /api/profile
PUT    /api/profile/description        Body: { content }
DELETE /api/profile/description
PUT    /api/focuses/:id/reflection     Body: { summary }
DELETE /api/focuses/:id/reflection
POST   /api/knowledge                  Body: { focusId, title, note? }
PATCH  /api/knowledge/:id              Body: { title?, note?, status? }
DELETE /api/knowledge/:id
```

### Persistence

- 新增 `focus_reflections`：`focus_id` 唯一，并用 `user_id + focus_id` 约束归属。
- 新增 `profile_descriptions`：`user_id` 唯一。
- 新增 `knowledge_items`：包含 `user_id`、`focus_id`、`status` 与创建时间索引。
- `GetProfileView` 可以使用只读聚合查询；统计不单独建表或缓存。
- `SPEC-0007` 实现或升级数据导出时，须将 `focusReflections`、`profileDescription` 与本规格的 `knowledgeItems` 纳入新的 `schemaVersion`；本规格不单独实现导出界面。

## 8. 验收场景

### 场景 A：无完成主线的空状态

```gherkin
Given 当前用户没有 completed Focus
When 用户打开“我的画像”
Then 页面说明完成的主线会沉淀为经历
And 页面不要求用户填写任何描述
And 系统不展示人格或能力推断
```

### 场景 B：事实概览可追溯

```gherkin
Given 当前用户有 2 条 completed Focus，共 18 条 completed Action
When 用户打开“我的画像”
Then 页面显示已完成 2 条主线和 18 项任务
And 每个数字都可由该用户的 Focus 与 Action 记录重新计算
```

### 场景 C：完成主线成为经历卡片

```gherkin
Given 当前用户完成了一条名为“发布第一个产品”的 Focus
When 用户打开“我的画像”
Then 页面展示该主线的名称、完成时间和完成任务数
And 用户可以打开其只读任务事实
```

### 场景 D：保存经历总结不影响原始记录

```gherkin
Given 当前用户拥有一条 completed Focus
When 用户为它保存“完成从想法到产品发布的完整闭环”
Then 系统创建或更新该 FocusReflection
And Focus 的标题、进度、状态和 Action 均保持不变
```

### 场景 E：清空我的描述

```gherkin
Given 当前用户已保存整体“我的描述”
When 用户清空该内容
Then 系统删除 ProfileDescription
And 页面仍展示事实概览与经历卡片
```

### 场景 F：用户隔离与导出

```gherkin
Given 用户 A 与用户 B 都有画像内容
When 用户 A 查询或导出自己的数据
Then 返回内容只包含用户 A 的主线、任务、经历总结和整体描述
And 用户 A 不能通过修改 Focus ID 读取用户 B 的经历总结或知识
```

### 场景 G：知识沉淀图

```gherkin
Given 当前用户有一条 active Focus “学习系统设计”
When 用户创建“SQLite 事务边界”并关联这条主线
Then 知识出现在“正在进行”列
When 用户将它标记为 needs_consolidation
Then 知识移入“待沉淀”列
When 用户手动确认 consolidated
Then 知识移入“已沉淀”列并保存 consolidatedAt
And 当前主线进度不自动变化
```

## 9. 测试与完成条件

- [ ] Domain / Application 测试覆盖完成主线校验、文本长度、知识状态转换、清空语义和用户隔离。
- [ ] 集成测试覆盖事实统计、FocusReflection 唯一性、KnowledgeItem 归属与用户隔离。
- [ ] 端到端测试覆盖空状态、保存经历总结、编辑整体描述和跨设备恢复。
- [ ] 页面无任何人格、心理或能力评分推断。
- [ ] 所有验收场景通过并记录结果后，规格才可标记为 `Verified`。
