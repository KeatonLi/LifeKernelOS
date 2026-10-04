# 自动检查与桌面发布

## 每次修改

[Desktop CI](../../.github/workflows/desktop.yml) 在 main push、面向 main 的 PR、手动触发时运行。Linux、macOS、Windows 均执行 npm ci、文档检查、领域/HTTP/DOM/迁移/恢复测试、生产构建，以及真实 Electron 启动、隔离 IPC 与重启测试。AI smoke 只调用临时本机脚本服务，验证网络鉴权、预览、重复采纳、撤销和重启后会话 Key 消失；CI 不需要用户 Key，不调用付费模型，也不代表建议质量或原生密钥服务已验收。任何平台失败都会阻止后续打包。

Linux 托管 runner 在测试前下载锁定的 Electron 二进制，并将其 chrome-sandbox helper 配置为 root 所有、4755 权限，满足 Chromium SUID sandbox 的运行要求。只调整临时 CI runner 中该 helper，不关闭产品的 sandbox/contextIsolation，也不使用关闭沙箱的测试参数。

main 与手动运行在全部检查通过后生成 Linux x64、Windows x64、macOS arm64/x64 未签名安装包，附带各文件 SHA-256。Actions 产物保留 14 天；不上传应用目录或用户数据库。PR 只验证，避免为每个 PR 构建全部安装包。新的同分支检查取消旧任务，版本发布不取消。

## 版本发布

[Desktop release](../../.github/workflows/release.yml) 由 `v*` 标签触发；标签必须精确匹配 package.json，并指向 main 历史中的提交。再调用相同的三平台检查/打包；全部成功后下载本次运行的安装包、校验哈希，再创建 GitHub Release。预发布标签 alpha/beta/rc 自动标记 prerelease。

```bash
# 先提交版本变更并等 main CI 成功，然后有意发布对应版本：
git tag v0.5.0
git push origin v0.5.0
```

默认工作流只读仓库；仅最终发布 job 拥有 contents:write 和 actions:read。使用 GitHub 自动提供的 GITHUB_TOKEN，无需新增 PAT 或硬编码凭证。正式代码签名和自动升级以后单独配置。当前安装包明确标注未签名。

本轮配置发布能力，不创建版本标签。CI 检查进程启动与数据闭环，原生对话框、快捷键和实机安装体验仍需按[桌面验收](desktop-acceptance.md)人工验证。
