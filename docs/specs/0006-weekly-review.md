# SPEC-0006 周复盘

> 状态：Proposed
> 对应 PRD：MVP 场景六
> 依赖：`SPEC-0001`～`SPEC-0004`
> 目标：用固定、可编辑的模板帮助用户从一周记录中做出下周决策。

## 1. 用户目标

用户不需要自己翻阅所有记录，系统将一周的行动和日终收束整理成事实摘要，用户据此决定下周保留、停止和开始什么。

## 2. 范围

### In scope

- 按用户本地周一至周日确定复盘周期。
- 展示本周完成、延期、拆小、放弃、卡住的数量和清单。
- 展示本周 DailyState 和 DailyClose 的原始记录入口。
- 生成固定模板草稿。
- 用户编辑并保存保留、停止、开始、下周主线。
- 同一周复盘可重复编辑，不产生重复记录。
- 无数据时展示空状态，不生成虚假结论。

### Out of scope

- AI 生成文字、心理判断或自动建议。
- 趋势图、评分和用户排名。
- 自动修改用户的主线或行动。
- 跨用户、跨项目和公开分享。

## 3. 数据

```text
WeeklyReview {
  id: UUID
  weekStart: LocalDate
  weekEnd: LocalDate
  progressNote?: string       // <= 3000 chars
  keepNote?: string            // <= 2000 chars
  stopNote?: string            // <= 2000 chars
  startNote?: string           // <= 2000 chars
  nextFocusNote?: string       // <= 1000 chars
  createdAt: ISODateTime
  updatedAt: ISODateTime
}
```

系统展示的统计和清单从原始数据实时计算，不把统计数字作为用户可编辑正文保存。

## 4. 固定模板

1. 本周完成与推进：展示 completed Action 和用户可编辑补充。
2. 反复出现的阻力：展示 blocked、延期和日终阻力记录。
3. 本周的保留：用户填写。
4. 本周的停止：用户填写。
5. 下周的开始：用户填写。
6. 下周唯一主线：用户填写，可为空。

系统生成的内容必须标注为“基于本周记录的事实摘要”，不把推断写成结论。

## 5. 用例契约

```typescript
type WeeklySummary = {
  weekStart: string;
  weekEnd: string;
  completedActions: Action[];
  deferredActions: Action[];
  droppedActions: Action[];
  blockedActions: Action[];
  dailyCloses: DailyClose[];
};

getWeeklySummary(weekStart: string): Promise<WeeklySummary>;
getWeeklyReview(weekStart: string): Promise<WeeklyReview | null>;
saveWeeklyReview(input: {
  weekStart: string;
  progressNote?: string;
  keepNote?: string;
  stopNote?: string;
  startNote?: string;
  nextFocusNote?: string;
}): Promise<WeeklyReview | null>;
```

## 6. 验收场景

### 场景 A：生成有记录的周摘要

```gherkin
Given 本周存在已完成和卡住的行动
When 用户打开周复盘
Then 系统展示对应的事实清单和数量
And 系统不编造用户没有记录的内容
```

### 场景 B：保存复盘决策

```gherkin
Given 用户正在查看本周复盘
When 用户填写保留、停止、开始和下周主线并保存
Then 系统保存本周的 WeeklyReview
And 页面展示保存后的内容
```

### 场景 C：重复编辑

```gherkin
Given 当前周已经存在 WeeklyReview
When 用户修改内容并再次保存
Then 系统更新原复盘
And 当前周仍然只有一条 WeeklyReview
```

### 场景 D：无数据空状态

```gherkin
Given 本周没有行动和日终收束记录
When 用户打开周复盘
Then 页面展示没有记录的空状态
And 用户仍可手动填写并保存复盘
```

### 场景 E：周边界正确

```gherkin
Given 用户使用本地时区且当前日期跨越周日到周一
When 用户打开周复盘
Then 系统按本地周一至周日计算周期
And 不把相邻周的数据混入当前复盘
```

### 场景 F：不调用 AI

```gherkin
Given 用户打开周复盘
When 系统生成摘要
Then 摘要只来自本地原始记录
And 不发送用户内容到外部 AI 服务
```

## 7. 技术实现与测试

- Domain：实现本地周起止计算和周期边界测试。
- Application：`GetWeeklySummary` 只读聚合，`SaveWeeklyReview` 负责 upsert。
- Persistence：新增 `weeklyReviews` store，以 `weekStart` 建立唯一索引。
- 集成测试覆盖跨周边界、摘要来源和同周唯一性。
- 端到端测试覆盖有数据、无数据、编辑保存和周边界。

## 8. Definition of Done

- [ ] 摘要中的事实均可追溯到原始记录。
- [ ] 用户可以删除或改写所有系统生成的草稿内容。
- [ ] 不调用 AI，不生成心理或价值判断。
- [ ] 同一周不会产生重复复盘记录。
- [ ] 所有验收场景通过并记录结果。
