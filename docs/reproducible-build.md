# 0.1.1 源码恢复与构建复现

本页记录 Windows x64 上的构建输入和恢复步骤。目标是从确定的源码与依赖重新得到可运行客户端，不承诺安装包逐字节相同。源码与依赖缓存可复用；这不是全新 Windows 机器的离线安装验证。

后续 0.1.2 只修复桌面 EXE 图标/名称及任务栏重启信息，保留这里的 harness 输入。当前打包步骤与验收边界见 [0.1.2 记录](validation-0.1.2.md)；下文的 0.1.1 测试数量与未完成事项是当时的历史状态。

## 固定输入

- 桌面依赖：根目录 `package-lock.json`，使用 `npm ci`。本次环境为 Node.js 24.15.0、npm 11.12.1。
- Electron 42.10.1 的包使用按需二进制安装；桌面 `postinstall` 显式运行其安装器，测试通过 `require('electron')` 获取可执行路径，不假定 `npm ci` 自带旧式依赖安装钩子。不要对桌面安装使用 `--ignore-scripts`。
- harness 基线、两个本地提交、源码树和补丁 SHA-256：[harness-source.json](../patches/harness-source.json)。本地分支为 `desktop/0.1.1`，尚未发布远端 fork。
- harness 依赖：上游提交自带 `pnpm-lock.yaml`，使用 `pnpm install --frozen-lockfile`；该仓库指定 pnpm 11.7.0。
- 发布运行时：[runtime-lock/](../runtime-lock/package.json) 中的 manifest、pnpm 配置及锁文件，指定 pnpm 11.0.8。锁文件来自已验收的 0.1.1，SHA-256 为 `d2e06350c731443286c624fd696211030f85e3d25f36c7bb4ea6d484052edcda`。

构建机需要 Node.js、npm、pnpm、Git。最终用户无需安装它们；DeepSeek 模型请求仍需要网络及 API 配置。

## 从上游基线恢复补丁

在桌面仓库根目录运行以下 PowerShell 命令。目标 `.repro/harness-clean` 必须尚不存在，不要把补丁重复应用到已修改的 checkout。

```powershell
$dshDesktopRoot = (Get-Location).Path
git clone https://github.com/deepseek-ai/deepseek-harness.git .repro/harness-clean
if ($LASTEXITCODE -ne 0) { throw 'Clone failed' }
git -C .repro/harness-clean checkout --detach b150a551b8d465e31e418e1b2eaf5e79bbb7d28e
if ($LASTEXITCODE -ne 0) { throw 'Pinned checkout failed' }
git -C .repro/harness-clean apply --index "$dshDesktopRoot/patches/deepseek-harness.patch"
if ($LASTEXITCODE -ne 0) { throw 'Patch application failed' }
$dshSourceTree = git -C .repro/harness-clean write-tree
if ($LASTEXITCODE -ne 0 -or $dshSourceTree -ne '1a61c75417b59cd5622c1c411192f7bb9585611c') {
  throw 'Recovered source differs from the recorded tree'
}
```

如果本机 `D:/AI/DeepSeek` 还在，也可以从它的 `desktop/0.1.1` 分支进行独立本地 clone。两个本地提交还不在上游 GitHub 仓库，不能对上游直接 checkout 这些提交；其他机器应使用上述“基线 + 补丁”路径。

## 编译 harness

```powershell
Push-Location .repro/harness-clean
try {
  pnpm install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) { throw 'Harness install failed' }
  $env:NODE_OPTIONS = '--max-old-space-size=12288'
  pnpm run build
  if ($LASTEXITCODE -ne 0) { throw 'Harness build failed' }
} finally {
  Pop-Location
}
```

首次安装可能提示 demo 的 `lib/bin.js` 尚未存在；本轮完整构建成功后相关输出已生成。Linux 原生包的平台提示和上游 workspace 循环依赖提示不是 Windows 构建失败。

## 生成并验证客户端

在一份没有 `runtime/` 产物的新桌面 checkout 中运行：

```powershell
npm ci
if ($LASTEXITCODE -ne 0) { throw 'Desktop install failed' }
node scripts/build-runtime.mjs --harness .repro/harness-clean
if ($LASTEXITCODE -ne 0) { throw 'Runtime staging failed' }
npm test
if ($LASTEXITCODE -ne 0) { throw 'Runtime checks failed' }
npm run dist
if ($LASTEXITCODE -ne 0) { throw 'Packaging failed' }
```

脚本在安装前检查补丁来源、四个包的版本与编译入口，并拒绝覆盖任何非空输出目录。已有 `runtime/` 时使用新 checkout，或指定未使用的 `--output .repro/runtime-check`；后者验证时设置 `$env:DSH_TEST_RUNTIME` 为该目录。正式打包默认读取桌面 checkout 的 `runtime/`，不会自动改用自定义输出。

无补丁的上游运行时只允许显式使用 `--upstream-only`，且不能同时传 `--harness` 或设置 `DSH_HARNESS`。它不包含费用、余额或 picker 修复，不能替代本项目的发布运行时。

每个成功的运行时含 `build-info.json`：记录锁文件哈希、实际使用的 pnpm 版本、构建 Node 版本、源码 Git HEAD/dirty 状态和覆盖入口哈希。用补丁恢复时 Git HEAD 仍为基线、dirty 为 true，这是预期状态；已核对的 `write-tree` 值用于确认补丁源码。

## 本轮验证与边界

- 恢复补丁生成的 Git 树与提交后的源码树一致；原 harness 工作区干净。
- 独立 clone 从无 `node_modules`、无 `lib` 状态进行 frozen install 和完整 `pnpm run build`：通过，构建后 Git 工作区干净。
- 新运行时使用固定 registry 锁文件安装并覆盖四包：通过，锁文件字节未变。
- 5 项构建输入检查、3 项 Electron picker 后台回归、1 项空数据目录/无密钥的真实后台启动检查：通过。
- 桌面独立 checkout（代码提交 `619b67e`）执行 `npm ci`、锁定运行时生成、9 项测试、安装包和便携包构建：全部通过；构建后 Git 工作区干净。
- 使用重建后的打包 exe 及其内置运行时再跑 9 项后台测试：全部通过。`app.asar` 仅含 `main.js`、`package.json` 与图标；四个覆盖包入口哈希与构建记录一致。
- 机器可读结果与两个产物的 SHA-256 见 [build-reproduction-0.1.1.json](build-reproduction-0.1.1.json)。验证产物保留在 `.repro/desktop-0.1.1/dist/`，不是对已验收产物的替换。
- 依赖审计另行记录：桌面打包工具链 `npm audit` 报 12 项（11 high、1 critical），主要为 electron-builder 25.1.8 的传递依赖；运行时 `pnpm audit --prod` 本次报 0 项。审计结果不等于全面安全保证；本轮不执行 `audit fix --force` 或打包工具大版本升级。
- 不使用真实密钥、不发送模型请求、不操作桌面。之前的用户 UI 验收针对 `dist/0.1.1/win-unpacked/`，该产物本轮不覆盖。
- 安装包/便携包入口、签名与 exe 图标、全新机器测试仍是独立发布事项。harness 的全仓 `doc-sync` 三个既有失败见 [0.1.1 验收记录](validation-0.1.1.md)，不在本次构建归档范围内。

## 回滚与远端归属

原 0.1.1 程序和数据未改动；继续使用原产物即可。源码恢复补丁保留原哈希，可按上文重新恢复。构建脚本失败时会留下新建的部分输出供检查，不会删除旧运行时。

本地提交不等于远端备份。发布前仍需确定 GitHub 仓库所有者与可见性，再创建 fork/桌面仓库并推送；本轮不创建远端仓库或修改 upstream remote。
