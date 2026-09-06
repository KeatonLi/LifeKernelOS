# SPEC-0007 数据导出

> 状态：Implemented
> 对应产品：[PRD v0.7](../../product/PRD.md) 数据所有权边界
> 相关设计：[详细技术设计](../../architecture/technical-design.md#9-导出契约)
> 依赖：`SPEC-0008`、`SPEC-0010`、`SPEC-0011`
> 文档分区：Foundation
> 目标：让用户可以带走自己的完整服务端记录。

## 1. 用户问题

用户需要知道数据在哪里，并能主动下载一份可迁移、可理解的 JSON 记录；导出不能泄露账号凭证或其他用户数据。

## 2. 范围

### In scope

- 设置页导出当前账号的完整 JSON。
- 导出包含版本号、导出时间和当前支持的 Goal、Action、CurrentContext、GoalReflection、ProfileDescription、KnowledgeItem。
- 即使没有业务数据，也返回结构稳定的空数组或空值。
- 导出失败时不生成部分文件，不提示成功。

### Out of scope

- 数据导入、跨账号恢复、加密压缩包和密码保护。
- 账号注销或管理员远程数据管理。
- 清空当前账号数据；如未来需要，另行评审独立规格。

## 3. 导出契约

```typescript
type ExportPayload = {
  schemaVersion: 5;
  exportedAt: string;
  data: {
    goals: Goal[];
    currentContext: CurrentContext | null;
    actions: Action[];
    goalReflections: GoalReflection[];
    profileDescription: ProfileDescription | null;
    knowledgeItems: KnowledgeItem[];
    goalStatusEvents: GoalStatusEvent[];
  };
};
```

物理数据库仍可保留旧 `focuses`、`focus_id` 等兼容命名，但当前导出只使用 Goal 语义，不同时导出两套含义重复的字段。不得导出密码摘要、Session、Cookie 或运行日志。

## 4. 验收场景

### 场景 A：导出完整数据

```gherkin
Given 当前账号存在目标、行动、当前状态或画像记录
When 用户在设置页点击导出
Then 服务端返回 schemaVersion 为 5 的 JSON 文件
And 文件包含所有当前支持的数据集合
And 文件只包含当前账号的数据
```

### 场景 B：空数据也可导出

```gherkin
Given 当前账号没有任何业务数据
When 用户点击导出
Then 服务端返回结构合法的空 JSON
And 所有数组存在且为空
```

### 场景 C：导出失败

```gherkin
Given 服务端读取数据失败
When 用户点击导出
Then 页面提示导出失败
And 页面不得提示导出成功
```

## 5. 实现与验证

- 端点固定为 `GET /api/export`，由服务端在一致性事务读取中组装 payload。
- Action 的 `content` 与其他 To-do 事实一并导出；`schemaVersion` 发生不兼容变化时必须更新本 Spec、技术设计、类型和测试。
- 自动化测试覆盖完整结构、空数据、用户隔离和版本号。
- 下载行为和错误展示仍需浏览器人工验收；验收完成前保持 `Implemented`。

## 6. Definition of Done

- [x] 当前支持的数据全部进入 v5 导出契约。
- [x] 不导出密码、Session、Cookie 或其他用户数据。
- [x] 自动化测试覆盖完整和空数据导出。
- [ ] 浏览器下载和失败反馈验收通过。
- [ ] 所有验收场景通过后标记为 `Verified`。
