# Development 文档

Development 文档定义人和 AI 如何协作交付 LifeKernelOS。这里不描述某个功能做什么，而是规定需求、实现、测试和验收如何保持一致。

## 当前文档

| 文档 | 用途 |
| --- | --- |
| [SDD 交付协议](SDD.md) | Spec 生命周期、AI 工作循环、追溯方式和完成定义 |

## AI 的最小交付循环

```text
任务分类
  → 读取最小必要事实源
  → 更新 Product / ADR / Spec
  → 实现最小完整切片
  → 运行自动化验证
  → 同步文档状态
  → 报告证据和未验证项
```

开始任务前先读根目录 [AGENTS.md](../../AGENTS.md)。需要判断文档归属时读 [文档总入口](../README.md)。

## 常用质量命令

```bash
npm run docs:check
npm test
npm run typecheck
npm run build
```

实际运行哪些命令取决于变更风险，但文档移动、重命名或链接变化后必须运行 `npm run docs:check`。

## 交付说明必须区分

- **已决定**：用户或 Accepted 文档已确认。
- **已实现**：代码和自动化测试已完成。
- **已验证**：Spec 验收场景已逐条通过。
- **未验证**：仍需人工、浏览器或真实用户验证。

不能用“代码写完了”代替“产品已验证”。
