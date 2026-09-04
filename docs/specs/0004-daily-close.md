# SPEC-0004 日终收束

> 状态：Proposed
> 对应 PRD：MVP 场景四
> 依赖：`SPEC-0001`、`SPEC-0002`
> 目标：让用户用不超过 1 分钟结束一天，留下推进、阻力和明天最小一步。

## 1. 用户目标

用户不需要写完整日记，只需回看当天行动并回答三个问题，就能结束今天并为明天留下一个可执行的起点。

## 2. 范围

### In scope

- 查看指定本地日期的主线、行动、状态和当前行动。
- 填写三个可选文本：推进、阻力或消耗、明天最小一步。
- 保存和修改当天的 `DailyClose`。
- 一天最多一条收束记录，重复保存执行更新。
- 没有行动或没有状态时仍可收束。

### Out of scope

- 强制用户完成收束。
- 自动判断情绪、原因或人生规律。
- AI 生成总结。
- 周复盘和趋势图。

## 3. 数据

```text
DailyClose {
  date: LocalDate
  progressNote?: string       // <= 2000 chars
  blockerNote?: string        // <= 2000 chars
  nextStepNote?: string       // <= 1000 chars
  createdAt: ISODateTime
  updatedAt: ISODateTime
}
```

- `date` 使用用户本地日期，不使用服务器日期。
- 三个字段都可以为空；三个字段都为空时不创建记录，已有记录可被清空后删除。
- 记录只反映用户主动输入，不把系统推断写入正文。

## 4. 用例契约

```typescript
getDailyContext(date: string): Promise<DailyContext>;
getDailyClose(date: string): Promise<DailyClose | null>;
saveDailyClose(input: {
  date: string;
  progressNote?: string;
  blockerNote?: string;
  nextStepNote?: string;
}): Promise<DailyClose | null>;
deleteDailyClose(date: string): Promise<void>;
```

## 5. 验收场景

### 场景 A：查看当天上下文

```gherkin
Given 用户进入日终收束页面
When 页面加载今天的数据
Then 页面展示今天的主线、行动结果、状态和当前行动
And 页面展示三个收束问题
```

### 场景 B：保存部分收束

```gherkin
Given 用户只填写“今天推进了什么”
When 用户提交收束
Then 系统保存一条今天的 DailyClose
And 未填写的字段保持为空
```

### 场景 C：跳过收束

```gherkin
Given 用户没有填写任何内容
When 用户选择跳过
Then 系统返回今日页面
And 不创建空的 DailyClose
```

### 场景 D：修改收束

```gherkin
Given 今天已经存在一条 DailyClose
When 用户修改其中一个字段并保存
Then 系统更新原记录
And 不产生第二条同日期记录
```

### 场景 E：输入过长

```gherkin
Given 用户正在填写日终收束
When 任一字段超过规定长度
Then 系统拒绝保存
And 页面提示对应字段超出长度限制
```

### 场景 F：没有行动也可以收束

```gherkin
Given 今天没有创建任何 Action
When 用户填写并保存日终收束
Then 系统成功保存 DailyClose
```

### 场景 G：刷新后恢复

```gherkin
Given 用户已经保存今天的 DailyClose
When 用户刷新页面
Then 页面仍然展示相同内容
```

## 6. 技术实现与测试

- Domain：文本长度校验和本地日期校验。
- Application：`GetDailyContext` 聚合只读数据，`SaveDailyClose` 负责 upsert。
- Persistence：`dailyCloses` 以 `date` 为唯一键。
- 集成测试覆盖新增、更新、删除和同日期唯一性。
- 端到端测试覆盖部分填写、跳过、修改和刷新恢复。

## 7. Definition of Done

- [ ] 收束流程默认可在 1 分钟内完成。
- [ ] 所有字段可选，不能因没有行动阻止用户收束。
- [ ] 不会创建空记录或重复日期记录。
- [ ] 用户输入不会被系统自动改写成推断结论。
- [ ] 所有验收场景通过并记录结果。
