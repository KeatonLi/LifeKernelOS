# SPEC-0001 当前主线与任务

> 状态：Superseded
> 对应 PRD：MVP 场景一、场景二
> 依赖：`SPEC-0008`
> 目标：打通“创建长期主线 → 记录主线进度 → 创建行动 → 查看行动 → 完成行动”的第一个可运行纵向切片。
> 后续关系：本规格保留为现有单一主线原型的事实记录；下一版产品模型由 `SPEC-0010` 提议替代。
> 文档分区：Archive；不作为当前产品或实现依据

## 1. 用户目标

用户有一件当前想推进的事情，希望把它拆成可以直接执行的行动，并在完成后留下明确结果。首次使用不应要求用户先建立完整的价值观、角色或目标体系。

## 2. 与 MVP 的关系

本规格是完整 MVP 的第一个切片，不等于完整 MVP。后续场景保持独立：

| PRD 场景 | 规格 | 当前关系 |
| --- | --- | --- |
| 场景一：首次创建当前主线 | `SPEC-0001` | 本规格完整覆盖 |
| 场景二：在工作台维护主线 | `SPEC-0001` | 本规格完整覆盖 |
| 场景三：我的画像 | `SPEC-0009` | 本规格保留画像所需的完成主线事实 |
| 场景四：任务调整 | `SPEC-0003` | 本规格只覆盖“完成” |
| 场景五：日终收束 | `SPEC-0004` | 本规格不覆盖 |
| MVP 基础能力：数据导出 | `SPEC-0007` | 本规格不覆盖 |

## 3. 范围

### In scope

- 没有 active 主线时，引导用户创建一条主线。
- 从首页进入工作台；无主线时只显示一个主线名称输入框。
- 本规格的工作台左侧保留品牌与“当前主线”标识；返回首页入口固定在右上角，不作为侧栏导航项。`SPEC-0009` 被接受后，侧栏新增“我的画像”。
- 创建一条当前主线，名称必填，初始进度为 `0%`。
- 展示并手动更新当前主线的 `0%—100%` 进度；进度达到 `100%` 时完成主线。
- 为当前主线创建至少一条行动，并可以继续补充行动。
- 查看未完成和已完成行动。
- 将 available 行动标记为 completed。
- 刷新页面或重新打开应用后恢复数据。
- 空状态、非法输入和持久化失败有明确反馈。

### Out of scope

- 多条 active 主线。
- 延后、拆小、放弃和卡住。
- 价值观、角色、方向、项目层级和目标树。
- 复杂账户、公开注册、提醒、AI 和第三方集成；最小登录和用户数据隔离由 `SPEC-0008` 提供。
- 数据导出；由 MVP 基础能力规格单独验收，不阻塞本切片的主流程。

## 4. 最小数据

### 当前主线 Focus

- `id`：UUID，系统生成。
- `title`：必填，去除首尾空白后长度为 1—100 个字符。
- `progressPercent`：必填整数，范围 `0—100`；创建时为 `0`，更新为 `100` 时 Focus 状态变为 `completed`。
- `status`：`active` / `completed` / `archived`，创建时为 `active`。
- `completedAt`：仅 completed Focus 存在的 UTC ISO 8601 时间；首次完成时写入，后续不可改写。
- `createdAt`、`updatedAt`：ISO 8601 时间。

### 行动 Action

- `id`：UUID，系统生成。
- `focusId`：必填，必须指向存在的 Focus。
- `title`：必填，去除首尾空白后长度为 1—200 个字符。
- `status`：`available` / `completed`，创建时为 `available`。
- `createdAt`、`updatedAt`：ISO 8601 时间。

Action 只表示一条服务于 Focus 的任务；本规格不记录精力、时长、日期、优先级或选中状态。

## 5. 领域规则

- 每个用户最多允许一条 `active` Focus。
- 当前用户已有 active Focus 时，不能通过本规格再创建第二条 active Focus。
- Action 必须关联 Focus；关联不存在时拒绝写入。
- 空白字符串在校验前统一执行首尾空白清理。
- Action 只能从 `available` 转为 `completed`。
- 完成 Action 不自动改变 Focus 的 `progressPercent`；用户确认实际推进后手动更新主线进度。
- 只能更新当前用户的 active Focus 进度；`progressPercent = 100` 时在同一事务中将 Focus 标记为 `completed` 并写入 `completedAt`。
- 已完成 Action 不再出现在未完成列表中。
- Focus 完成后保留其标题、完成时间、进度与任务记录，供后续 `SPEC-0009` 作为经历事实读取；本规格不展示完成主线历史。
- 重复点击完成不会产生重复 Action 或重复完成记录，页面保持 `completed` 状态。
- 页面加载不自动创建空 Focus、空 Action 或空的完成记录。

## 6. 用户可见流程

### 6.1 首次进入

1. 用户从首页进入工作台。
2. 应用读取 active Focus；如果不存在，展示唯一的主线名称输入框。
3. 创建成功后，显示主线进度和任务创建区域。

### 6.2 查看和创建行动

1. 页面首先展示当前主线和主线进度，再展示任务列表。
2. 用户只输入任务名称。
3. 创建成功后，行动出现在未完成列表。
4. 空列表提供“创建第一条行动”的明确入口。

### 6.3 完成行动

1. 用户在未完成列表中点击完成。
2. 系统持久化状态变化。
3. 页面将行动移动到已完成列表，并给出成功反馈。

## 7. 验收场景

### 场景 A：无主线时进入创建状态

```gherkin
Given 当前用户没有 active Focus
When 用户打开应用
Then 系统展示当前主线创建状态
And 不自动创建默认主线
```

### 场景 B：创建当前主线

```gherkin
Given 用户位于当前主线创建状态
When 用户填写主线名称并提交
Then 系统创建一条 active Focus
And 用户进入行动创建和查看状态
```

### 场景 C：主线名称为空或只有空白

```gherkin
Given 用户位于当前主线创建状态
When 用户不填写主线名称或只填写空白字符并提交
Then 系统不创建 Focus
And 页面提示主线名称为必填项
```

### 场景 D：不创建第二条 active 主线

```gherkin
Given 当前用户已经存在一条 active Focus
When 用户再次提交新的主线
Then 系统拒绝创建第二条 active Focus
And 页面提示当前已经存在一条主线
```

### 场景 E：创建行动

```gherkin
Given 用户已经拥有一条 active Focus
When 用户填写任务名称并提交
Then 系统创建一条属于该 Focus 的 available Action
And 行动出现在未完成列表中
```

### 场景 F：行动输入不合法

```gherkin
Given 用户正在创建 Action
When 任务名称为空或只有空白字符
Then 系统不创建 Action
And 页面在对应字段显示可理解的错误
```

### 场景 G：完成行动

```gherkin
Given 未完成列表中存在一条 available Action
When 用户点击完成
Then 系统将 Action 状态改为 completed
And Action 从未完成列表移入已完成列表
And 页面给出成功反馈
```

### 场景 G-1：更新主线进度并完成主线

```gherkin
Given 当前用户有一条进度为 60% 的 active Focus
When 用户将主线进度更新为 100%
Then 系统保存 Focus.progressPercent 为 100
And 系统在同一事务中将 Focus 状态更新为 completed
And 系统写入 Focus.completedAt
And 页面明确显示主线已完成
```

### 场景 H：重复完成不产生副作用

```gherkin
Given 一条 Action 已经是 completed
When 用户再次触发完成操作
Then 系统不创建重复数据
And Action 仍保持 completed
```

### 场景 I：刷新后恢复

```gherkin
Given 用户已经创建 Focus 和 Action，并完成了一条 Action
When 用户刷新页面或重新打开应用
Then 系统展示相同的 Focus 和 Action 状态
And 已完成 Action 仍不出现在未完成列表
```

### 场景 J：持久化失败

```gherkin
Given 用户提交了合法的 Focus 或 Action
When 服务端数据库或网络写入失败
Then 页面明确提示数据未保存
And 页面不得展示保存成功或伪造已持久化状态
```

## 8. 技术实现规格

### 8.1 模块边界

- `domain/focus`：Focus 类型、字段校验和 active 唯一性规则。
- `domain/action`：Action 类型、字段校验和完成状态转换。
- `application/focus`：`CreateFocus`、`GetActiveFocus`、`UpdateFocusProgress`。
- `application/action`：`CreateAction`、`ListActions`、`CompleteAction`。
- `apps/api/src/infrastructure/persistence`：SQLite 的 Focus、Action 仓储实现。
- `features/home`：产品介绍和进入工作台入口。
- `features/workbench`：主线创建、主线进度与任务交互。

页面不直接调用数据库；通过 API 调用服务端 application 用例，所有写操作都经过 application 用例和 domain 规则。

### 8.2 用例契约

```typescript
type CreateFocusInput = {
  title: string;
};

type UpdateFocusProgressInput = {
  progressPercent: number;
};

type CreateActionInput = {
  focusId: string;
  title: string;
};

createFocus(input: CreateFocusInput): Promise<Focus>;
getActiveFocus(): Promise<Focus | null>;
updateFocusProgress(focusId: string, input: UpdateFocusProgressInput): Promise<Focus>;
createAction(input: CreateActionInput): Promise<Action>;
listActions(focusId: string, status?: 'available' | 'completed'): Promise<Action[]>;
completeAction(actionId: string): Promise<Action>;
```

用例负责校验输入、检查关联数据、执行领域规则和持久化；UI 只负责收集输入、展示结果和映射错误。

### 8.3 仓储和持久化

- SQLite 表：`focuses`、`actions`；所有记录都带当前用户的 `userId`。
- `focuses.status = active` 最多一条，由 application/domain 双重保护。
- `actions.focusId` 必须指向存在的 Focus。
- ID 使用服务端 `crypto.randomUUID()` 生成。
- 时间使用 ISO 8601 字符串保存。
- 数据库通过迁移管理结构版本，导出 payload 的 `schemaVersion` 当前值由 `SPEC-0007` 维护为 `2`。
- 创建和完成操作使用事务，失败时不留下半完成状态。
- 列表读取按 `createdAt` 升序，已完成列表单独展示。

### 8.4 错误映射

- `ValidationError`：字段错误，定位到对应输入。
- `ActiveFocusExistsError`：提示已有当前主线。
- `FocusNotFoundError`：提示关联主线不存在并刷新页面。
- `ActionNotFoundError`：提示行动不存在并刷新列表。
- `PersistenceError`：提示数据未保存，不更新成功状态。

错误类型不直接暴露数据库错误信息；开发环境保留原始错误用于排查。

## 9. 测试追溯

| 规格场景 | 领域测试 | 集成测试 | 端到端测试 |
| --- | --- | --- | --- |
| A 无主线空状态 | `GetActiveFocus` 返回空 | 空数据库读取 | 首次进入显示创建状态 |
| B 创建主线 | `CreateFocus` 成功 | Focus 写入 | 创建后进入行动区域 |
| C 空主线拒绝 | 字段校验 | 不产生记录 | 表单显示错误 |
| D active 唯一性 | 唯一性规则 | 重复写入被拒绝 | 页面提示已有主线 |
| E 创建行动 | `CreateAction` 与关联校验 | Action 写入 | 行动出现在列表 |
| F 非法行动拒绝 | 字段校验 | 不产生记录 | 字段显示错误 |
| G 完成行动 | 状态转换 | Action 更新 | 移入已完成列表 |
| G-1 更新主线进度 | 进度范围与完成转换 | Focus 进度与状态同一事务更新 | 显示 100% 与主线完成 |
| H 重复完成 | 状态转换幂等性 | 不新增记录 | 页面无重复项 |
| I 刷新恢复 | — | SQLite 读写 | 刷新后状态保持 |
| J 持久化失败 | — | 模拟写入失败 | 显示未保存 |

## 10. 实现顺序

1. 建立 TypeScript 工程和测试运行环境。
2. 实现 Focus、Action 领域类型、校验和规则测试。
3. 实现 SQLite 仓储和持久化集成测试。
4. 实现 application 用例和错误映射测试。
5. 实现 Home 和 Workbench 页面。
6. 使用 Playwright 执行本规格的端到端场景。
7. 逐条完成验收并记录结果。
8. 代码和自动化测试完成后，将规格状态改为 `Implemented`；验收通过后再改为 `Verified`。

## 11. Definition of Done

- [ ] 本规格状态已进入 `Accepted` 后才开始实现。
- [ ] 所有 In scope 场景都有自动化测试或可重复验收步骤。
- [ ] 空状态、非法输入、重复操作和持久化失败已验证。
- [ ] 用户可以完成“进入工作台 → 创建主线 → 创建任务 → 完成任务 → 更新主线进度”的完整流程。
- [ ] 刷新后数据仍然存在且状态正确。
- [ ] 没有引入本规格 Out of scope 的能力。
- [ ] 规格、代码、测试和提交信息可以互相追溯。

## 12. 规格审查结论

- 首次创建只要求主线名称，避免任何额外表单负担。
- 首轮允许只创建一条任务，不强制批量填写。
- 延后、拆小、放弃和卡住保留给 `SPEC-0003`，不在本规格提前实现。
