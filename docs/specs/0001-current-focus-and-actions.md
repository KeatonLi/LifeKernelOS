# SPEC-0001 当前主线与行动

> 状态：Proposed
> 对应 PRD：MVP 场景一、场景三
> 目标：先打通“创建主线 → 创建行动 → 完成行动”的最小纵向切片。

## 1. 用户目标

用户有一件当前想推进的事情，希望把它拆成几条可以直接执行的行动，并在完成后留下明确结果。

## 2. 范围

### In scope

- 创建一条当前主线。
- 为当前主线创建至少一条行动，并可以继续补充行动。
- 查看行动列表。
- 将一条行动标记为完成。
- 查看已完成和未完成行动。
- 刷新页面后数据仍然存在。

### Out of scope

- 多条 active 主线。
- 价值观、角色、项目层级和目标树。
- 根据精力自动筛选行动。
- 延期、拆小、放弃和卡住的处理方式。
- 登录、云同步、提醒和第三方集成。

## 3. 最小数据

### 当前主线

- 名称：必填，长度 1—100 个字符。
- 完成标准：可选，长度不超过 500 个字符。
- 状态：`active` / `completed` / `archived`。

### 行动

- 名称：必填，长度 1—200 个字符。
- 预计耗时：必填，正整数分钟，范围 1—480。
- 精力要求：`low` / `medium` / `high`，默认 `medium`。
- 状态：`available` / `completed`。
- 所属主线：必填。

## 4. 验收场景

### 场景 A：创建当前主线

```gherkin
Given 用户首次进入当前主线页面
When 用户填写主线名称并提交
Then 系统创建一条 active 主线
And 用户进入行动创建区域
```

### 场景 B：主线名称为空

```gherkin
Given 用户位于当前主线创建页面
When 用户不填写主线名称并提交
Then 系统不创建主线
And 页面提示主线名称为必填项
```

### 场景 C：创建行动

```gherkin
Given 用户已经拥有一条 active 主线
When 用户填写行动名称、预计耗时和精力要求并提交
Then 系统创建一条属于当前主线的 available 行动
And 行动出现在未完成列表中
```

### 场景 D：完成行动

```gherkin
Given 未完成列表中存在一条行动
When 用户将行动标记为完成
Then 行动状态变为 completed
And 行动从未完成列表移入已完成列表
```

### 场景 E：刷新后恢复

```gherkin
Given 用户已经创建主线和行动
When 用户刷新页面或重新打开应用
Then 系统仍然展示相同的主线和行动状态
```

## 5. 测试清单

- [ ] 创建主线成功。
- [ ] 空主线被拒绝。
- [ ] 创建行动成功。
- [ ] 非法耗时被拒绝。
- [ ] 行动完成后状态正确变化。
- [ ] 刷新页面后数据不丢失。
- [ ] 没有主线和没有行动时，空状态提供明确的下一步。

## 6. 技术实现规格

### 6.1 模块边界

- `domain/focus`：主线字段校验和 active 主线唯一性。
- `domain/action`：行动字段校验和 `available → completed` 状态转换。
- `application/focus`：`CreateFocus`、`GetActiveFocus`。
- `application/action`：`CreateAction`、`ListActions`、`CompleteAction`。
- `infrastructure/persistence`：IndexedDB 的 Focus、Action 仓储实现。
- `features/setup`：创建主线和行动的页面交互。
- `features/today`：展示当前主线、未完成行动和已完成行动。

页面不直接调用 IndexedDB；所有写操作经过 application 用例。

### 6.2 用例契约

```typescript
type CreateFocusInput = {
  title: string;
  doneDefinition?: string;
};

type CreateActionInput = {
  focusId: string;
  title: string;
  estimatedMinutes: number;
  energyRequired: 'low' | 'medium' | 'high';
};

createFocus(input: CreateFocusInput): Promise<Focus>;
getActiveFocus(): Promise<Focus | null>;
createAction(input: CreateActionInput): Promise<Action>;
listActions(focusId: string, status?: 'available' | 'completed'): Promise<Action[]>;
completeAction(actionId: string): Promise<Action>;
```

用例负责校验输入、检查关联数据、执行领域规则和持久化；UI 只负责收集输入、展示结果和映射错误。

### 6.3 持久化约束

- object store：`focuses`、`actions`、`metadata`。
- `focuses.status = active` 必须最多一条。
- `actions.focusId` 必须指向存在的 Focus。
- ID 使用 `crypto.randomUUID()` 生成。
- 时间使用 ISO 8601 字符串保存。
- 初始化数据库时写入 `schemaVersion`，当前值为 `1`。
- 创建或完成操作失败时，页面必须明确显示“未保存”，不能只保留本地页面状态。

### 6.4 测试追溯

| 规格场景 | 领域 / 集成测试 | 端到端测试 |
| --- | --- | --- |
| A 创建主线 | `CreateFocus` 成功 | 首次进入后创建主线 |
| B 空主线 | 主线校验 | 表单显示错误 |
| C 创建行动 | `CreateAction` 与 Focus 关联 | 创建行动后出现在列表 |
| D 完成行动 | `CompleteAction` 状态转换 | 行动移入已完成列表 |
| E 刷新恢复 | IndexedDB 仓储读写 | 刷新后数据仍存在 |

### 6.5 实现顺序

1. 建立 TypeScript 工程和测试运行环境。
2. 实现 Focus、Action 的领域类型、校验和规则测试。
3. 实现 IndexedDB 仓储和持久化集成测试。
4. 实现 application 用例，并补充错误映射测试。
5. 实现 Setup 和 Today 页面。
6. 使用 Playwright 完成端到端验收。
7. 验收通过后将本规格状态从 `Proposed` 改为 `Verified`。

## 7. 规格审查问题

- 是否真的需要在第一步填写完成标准？如果阻碍首次使用，可降为可选。
- 首轮允许只创建一条行动，不强制用户批量填写；页面可以在不阻塞开始行动的前提下建议继续补充。
- 数据存储方式由实现阶段决定，但不得改变上述用户可见行为。
