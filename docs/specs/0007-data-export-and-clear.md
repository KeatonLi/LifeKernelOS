# SPEC-0007 数据导出与清空

> 状态：Proposed
> 对应 PRD：MVP 基础能力
> 依赖：本地存储
> 目标：让用户可以带走自己的数据，也可以明确清空本地数据。

## 1. 用户目标

用户知道数据在哪里、可以导出什么，也可以在不需要时彻底清除本地记录，不被系统锁定。

## 2. 范围

### In scope

- 在设置页导出完整 JSON。
- 导出包含版本号、导出时间和所有当前已支持的数据。
- 导出文件使用明确的 `.json` 文件名。
- 清空前要求明确确认。
- 清空后所有本地数据不可再从应用恢复。
- 清空完成后回到首次使用空状态。

### Out of scope

- 数据导入和跨设备恢复。
- 加密压缩包和密码保护。
- 云端删除、账号注销和远程数据管理。
- 导出 Markdown；首版只保证 JSON。

## 3. 导出格式

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-09-04T00:00:00.000Z",
  "data": {
    "focuses": [],
    "actions": [],
    "dailyStates": [],
    "dailyCloses": [],
    "captures": [],
    "weeklyReviews": []
  }
}
```

- 数组即使为空也必须存在，保证格式稳定。
- 不导出浏览器缓存、运行日志或内部错误对象。
- 导出失败时不生成部分文件，不提示成功。

## 4. 用例契约

```typescript
type ExportPayload = {
  schemaVersion: 1;
  exportedAt: string;
  data: {
    focuses: Focus[];
    actions: Action[];
    dailyStates: DailyState[];
    dailyCloses: DailyClose[];
    captures: Capture[];
    weeklyReviews: WeeklyReview[];
  };
};

exportData(): Promise<ExportPayload>;
clearData(confirmation: { confirmed: true }): Promise<void>;
```

## 5. 验收场景

### 场景 A：导出完整数据

```gherkin
Given 本地存在主线、行动、每日状态或收束记录
When 用户在设置页点击导出
Then 系统生成一个 JSON 文件
And 文件包含 schemaVersion、exportedAt 和所有数据数组
```

### 场景 B：空数据也可导出

```gherkin
Given 本地没有任何业务数据
When 用户点击导出
Then 系统生成结构合法的空 JSON
And 所有数据数组存在且为空
```

### 场景 C：未确认时不清空

```gherkin
Given 本地存在用户数据
When 用户没有明确确认清空
Then 系统不删除任何数据
And 页面保持原有数据
```

### 场景 D：确认清空

```gherkin
Given 本地存在用户数据
When 用户明确确认清空
Then 系统删除所有业务 object store 数据
And 页面回到首次使用空状态
And 刷新后数据仍为空
```

### 场景 E：导出失败

```gherkin
Given 浏览器拒绝文件写入或读取本地数据失败
When 用户点击导出
Then 页面提示导出失败
And 页面不得提示导出成功
```

### 场景 F：清空失败

```gherkin
Given 用户已经确认清空
When 本地存储删除失败
Then 页面提示数据未完全清除
And 不得展示清空成功
```

## 6. 技术实现与测试

- Application：集中读取各仓储并组装版本化 payload。
- Infrastructure：导出使用浏览器下载能力；清空使用单事务或可验证的逐 store 删除。
- 清空前后都重新读取数据库确认结果，不能只清空页面状态。
- 单元测试覆盖导出结构和空数组。
- 集成测试覆盖导出完整性、清空原子性和失败反馈。
- 端到端测试覆盖下载、取消清空和确认清空。

## 7. Definition of Done

- [ ] 导出结构具备明确版本号。
- [ ] 当前所有业务数据都在导出范围内。
- [ ] 清空必须经过用户明确确认。
- [ ] 清空后重新打开应用不会恢复旧数据。
- [ ] 导出和清空失败都有准确反馈。
- [ ] 所有验收场景通过并记录结果。
