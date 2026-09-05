# LifeKernelOS

人生内核 OS：一个帮助人理解自己、选择方向、持续行动并定期校准的个人操作系统。

## 当前状态

项目处于 MVP 规格和技术架构设计阶段，尚未开始具体功能开发；当前采用服务端持久化的模块化单体，产品需求见 [docs/PRD.md](docs/PRD.md)。

当前优先把普通用户的行动闭环做好：根据精力和时间选择一件下一步、完成或调整、日终收束。Agent、AI、主题切换等能力不进入当前 MVP，等这一闭环验证后再单独评估。

## 产品闭环

```text
当前主线 → 下一步行动 → 根据状态选择 → 完成或调整 → 日终收束
```

## 目录

- `docs/PRD.md`：产品需求文档（MVP 版本）
- `docs/SDD.md`：规格驱动开发约定
- `docs/architecture.md`：MVP 技术架构基线
- `docs/technical-design.md`：第一阶段详细技术设计
- `docs/decisions/`：跨规格的架构决策记录
- `docs/specs/`：可执行的功能规格
