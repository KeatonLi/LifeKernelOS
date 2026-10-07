# 自动检查与桌面发布

## 每次修改

[Desktop CI](../../.github/workflows/desktop.yml) 在 main push、面向 main 的 PR、手动触发时运行。用户要求的“镜像”按桌面安装包交付；ARM 指 ARM64，x86 指 64 位 x86（x86_64 / x64）。macOS、Windows 各有 ARM64 与 x64 两个原生目标，另保留 Linux x64。

| 目标 | GitHub runner | electron-builder 参数 | 安装包格式 | Actions 产物名 |
| --- | --- | --- | --- | --- |
| macOS Apple Silicon | `macos-15` | `--mac --arm64` | DMG、ZIP | `LifeKernelOS-macOS-arm64` |
| macOS Intel | `macos-15-intel` | `--mac --x64` | DMG、ZIP | `LifeKernelOS-macOS-x64` |
| Windows ARM | `windows-11-arm` | `--win --arm64` | NSIS EXE | `LifeKernelOS-Windows-arm64` |
| Windows Intel / AMD | `windows-2025` | `--win --x64` | NSIS EXE | `LifeKernelOS-Windows-x64` |
| Linux Intel / AMD | `ubuntu-24.04` | `--linux --x64` | AppImage、tar.gz | `LifeKernelOS-Linux-x64` |

五个目标均使用原生 CPU 架构的 Node 24 LTS 最新补丁，分别执行 npm ci、文档检查、领域/HTTP/DOM/迁移/恢复测试、打包与发布门禁回归、类型/生产构建，以及真实 Electron 启动、隔离 IPC 与重启测试。任何目标失败都会阻止后续打包。开发工具的 Node engines 为 `^22.22.2 || ^24.15.0 || >=26.0.0`，与锁定的 jsdom 要求一致。

AI smoke 只调用临时本机脚本服务，验证网络鉴权、预览、重复采纳、撤销和重启后会话 Key 消失；CI 不需要用户 Key，不调用付费模型，也不代表建议质量或原生密钥服务已验收。

Linux 托管 runner 在测试前下载锁定的 Electron 二进制，并将其 chrome-sandbox helper 配置为 root 所有、4755 权限，满足 Chromium SUID sandbox 的运行要求。只调整临时 CI runner 中该 helper，不关闭产品的 sandbox/contextIsolation，也不使用关闭沙箱的测试参数。

main 与手动运行在全部检查通过后生成上表五个目标的八个未签名安装包。NSIS 明确关闭多架构合包，每个 Windows 文件只包含对应架构。安装包名称含版本、系统与架构；例如 `LifeKernelOS-0.5.1-win-arm64.exe`、`LifeKernelOS-0.5.1-mac-x64.dmg`。electron-builder 的 AppImage 架构宏使用 `x86_64`，tar.gz 使用 `x64`。

上传前由 [包检查](../../scripts/check-desktop-package.mjs) 验证 PE / Mach-O / ELF 可执行文件架构，以打包的可执行文件在 Node 模式核对 Electron 版本并执行内置 SQLite 查询；同时核对 asar 中主进程、preload、worker、renderer、数据库迁移和品牌资源与本次构建一致，拒绝缺失入口、版本错误、用户数据库和 node_modules。每个目标随后加载实际打包 asar，从独立临时工作目录执行启动、IPC、任务/AI 闭环及退出后重启；检查不依赖仓库 cwd。该界面测试使用锁定的 Electron 测试运行时加载 asar，不等同于安装器安装后的实机验收。

[SHA-256 脚本](../../scripts/package-checksums.mjs) 以流式读取生成每个安装包的 `.sha256`，避免将整个大文件一次读入内存。Actions 产物保留 14 天；只上传安装包及哈希。PR 只验证，避免为每个 PR 构建全部安装包。新的同分支检查取消旧任务，版本发布不取消。

## 版本发布

[Desktop release](../../.github/workflows/release.yml) 由 `v*` 标签触发；标签必须精确匹配 package.json，并指向 main 历史中的提交。再调用相同的五目标原生检查/打包；全部成功后下载本次运行的安装包，再创建 GitHub Release。预发布标签 alpha/beta/rc 自动标记 prerelease。

发布前的 [产物门禁](../../scripts/check-release-assets.mjs) 要求五个 Actions 产物目录齐全，且每个目录只有对应版本、系统、架构的预期安装包和哈希。八个安装包必须非空，哈希内容与文件名必须逐项精确匹配；缺少 Windows ARM64、漏传某个格式/哈希、安装包被篡改、版本过期或额外未知文件都阻止发布。回归见 [打包测试](../../scripts/desktop-packaging.test.mjs)。

```bash
# 先提交版本变更并等 main CI 成功，然后有意发布对应版本：
git tag v0.5.1
git push origin v0.5.1
```

默认工作流只读仓库；仅最终发布 job 拥有 contents:write 和 actions:read。使用 GitHub 自动提供的 GITHUB_TOKEN，无需新增 PAT 或硬编码凭证。正式代码签名和自动升级以后单独配置。当前安装包明确标注未签名。

## 本地复现与证据

在对应操作系统和 CPU 架构运行，例如 Windows x64：

```bash
npm ci
npm run docs:check
node --test scripts/desktop-packaging.test.mjs
npm run build
npm run test:desktop
npx electron-builder --win --x64 --publish never
node scripts/check-desktop-package.mjs win x64
npm run test:desktop -- release/win-unpacked/resources/app.asar
node scripts/package-checksums.mjs
```

macOS ARM64 的包检查参数为 `mac arm64`，asar 位于 `release/mac-arm64/LifeKernelOS.app/Contents/Resources/app.asar`；Intel macOS 使用 `mac x64` 与 `release/mac/…`。Windows ARM64 使用 `win arm64` 与 `release/win-arm64-unpacked/resources/app.asar`。Linux 执行 `node scripts/prepare-electron-sandbox.mjs` 后以 `xvfb-run -a` 运行 smoke。

2026-10-07：原有三平台检查仅在 macOS 一个 runner 上交叉生成 Intel 与 ARM 包，Windows 缺少 ARM64。已改为上表原生矩阵，并补齐打包资源、架构、完整产物与哈希门禁。本地发布门禁 7/7 回归通过；实际原生桌面验证记录见 [桌面验收](desktop-acceptance.md)。本轮工作流尚未推送运行，macOS / Windows ARM64 与全部 GitHub runner 的执行结果须由首次 Actions 运行补录，不将配置存在视为五目标通过。

官方依据：GitHub 的 [runner 架构与标签](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)、electron-builder 26 的 [平台与架构](https://www.electron.build/v26/docs/architecture/) 和 [NSIS 分架构配置](https://www.electron.build/v26/docs/nsis/)。

## 发布历史

版本标签与发布须由用户明确授权。2026-10-05 用户已要求将简约界面推送至 main 并触发 GitHub Release。首轮 main 的三平台检查与打包成功，但 `v0.5.0` 的 Windows 发布检查被 Tab 菜单测试超时阻断，未创建 Release。已修正测试的异步等待，后续使用修正版本 `v0.5.1`；保留原标签及失败记录。正式发布状态以 [GitHub Releases](https://github.com/KeatonLi/LifeKernelOS/releases) 与对应工作流结果为准。CI 检查进程启动与数据闭环，原生对话框、快捷键和实机安装体验仍需按[桌面验收](desktop-acceptance.md)人工验证。
