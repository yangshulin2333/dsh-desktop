# 打包工具链审计修复与回归验证

日期：2026-08-27。状态：**构建依赖审计由 12 项降为 0，运行时生产依赖审计为 0；隔离完整打包及 18 项不同的自动检查通过，修改已合回桌面源码。**

本次维护构建工具，不发布新客户端版本。Electron 42.10.1、应用版本 0.1.2、`main.js`、图标与资源编辑脚本、harness 源码和已验收的 `dist/0.1.2/` 均未修改。用户无需为此重新安装；新包只保留在 `.repro/toolchain-26.15.3/dist/0.1.2/`，不是新的发布包。未操作桌面、执行安装器或便携启动器、使用真实密钥、修改应用数据或推送远端。

## 输入、选择与审计边界

- 原桌面提交：`a360733d76e1284344ff3c01b35c6f9755902b7a`。
- 在全新的本地 clone `.repro/toolchain-26.15.3/` 安装和验证，再合回主工作区。运行时复制自已验收的 `dist/0.1.2/win-unpacked/resources/runtime/`；本轮没有重新编译 harness。以前的源码恢复/完整 harness 重建证据仍在[原复现记录](reproducible-build.md)。
- 测试环境：Windows x64，Node.js 24.15.0、npm 11.12.1；运行时锁定 pnpm 11.0.8。所有版本及产物哈希见[机器可读记录](toolchain-hardening-2026-08-27.json)。
- `electron-builder` 从 `^25.1.8` 改为精确的 `26.15.3`，提交生成的 `package-lock.json`，用 `npm ci` 安装。选择的是本轮 npm `latest` 标签与 audit 建议的修复版本，不是声称它是最新的 GitHub release；另有 `v26` 标签指向 26.15.7。本轮没有使用 `npm audit fix --force`。
- `@electron/rebuild@4.2.0` 要求 Node >=22.12.0；现有构建要求 `^22.19.0 || >=24.0.0` 满足它。Electron 仍锁定 42.10.1，`resedit` 仍为 1.7.2。

原 `npm audit` 报 12 个依赖条目（11 high、1 critical），主要是同一构建依赖链的传播告警，**不等于客户端有 12 个可直接利用的独立漏洞**。本轮参考维护者的[26.15.3 发布记录](https://github.com/electron-userland/electron-builder/releases/tag/electron-builder@26.15.3)及以下公告：

| 范围 | 修复依据 | 当前锁定结果 |
| --- | --- | --- |
| 构建下载时跨源跳转的认证头传播 | [builder-util-runtime 公告](https://github.com/electron-userland/electron-builder/security/advisories/GHSA-p2f4-r6v6-j797)，修复版本 >=9.7.0 | 9.7.0 |
| Linux AppImage 的 `LD_LIBRARY_PATH` 行为 | [app-builder-lib 公告](https://github.com/electron-userland/electron-builder/security/advisories/GHSA-7g7r-gx96-252g)，修复版本 >=26.15.0；不是当前 Windows 目标的相同利用条件 | 26.15.3 |
| tar 解包路径处理 | [node-tar 公告](https://github.com/isaacs/node-tar/security/advisories/GHSA-r292-9mhp-454m)，<=7.5.20 受影响，7.5.21 修复 | 7.5.22 |

新增 `npm run audit:build` 与 `npm run audit:runtime`，分别检查根构建依赖和已 staging 的生产运行时。两者本轮报告均为 0。结果仅代表当时审计数据库；不覆盖全部 Electron/Chromium、原生二进制、应用权限或业务逻辑风险。安装时仍有 `inflight`、旧 `glob`、`rimraf`、`boolean` 的弃用提示，未为消除提示强行改写其上游依赖。

## 隔离回归暴露的漏打包问题

只升级依赖、保留原配置时，源目录的 14 项测试与 EXE 的 3 项资源检查都能通过，但打包运行时的 14 项测试中有 **4 项失败**：3 个 picker 测试找不到 Koffi，后台找不到 `@deepseek-ai/dsh/lib/bin.js`。包内 runtime 仅剩 manifest/锁文件，没有 `node_modules`。

排查边界：源 runtime 中后端入口与原生依赖存在，排除源文件缺失；相同 Electron/源 runtime 可以通过后台测试，未支持 ABI 回归假设；实际打包输出整体缺少依赖，问题在资源复制边界。

定位到锁定的 `app-builder-lib/out/util/filter.js`：复制过滤器对相对于 FileSet 来源的根 `node_modules` 直接返回 false。原配置 `from: "runtime"` 使 `runtime/node_modules` 正好成为这个根目录；正向 glob 不能越过该提前返回。此行为在旧版 25.1.8 的过滤器中不存在。

最小适配只改变 FileSet 的基准，最终目标位置不变：

```json
{
  "from": ".",
  "to": ".",
  "filter": [
    "runtime/**/*",
    "!**/*.map",
    "!**/*.ts",
    "!**/*.md",
    "!**/test/**",
    "!**/tests/**",
    "!**/.bin/**"
  ]
}
```

这样 runtime 的依赖以 `runtime/node_modules/` 的相对路径复制到 `resources/runtime/node_modules/`；根目录的开发依赖及其他项目文件不在白名单内。没有改动 `node_modules` 中的打包器代码或放宽已有过滤条件。

新增 `tests/runtime-packaging.test.cjs`，直接使用锁定打包器的资源复制函数，以临时目录验证后端入口、worker、Koffi、ConPTY、OpenConsole 和嵌套依赖被复制，同时排除开发依赖、无关文件、源码、测试及 `.bin`。这项测试在原配置下失败，修改后通过，并加入 `npm test` 和 `test:build`。它有意覆盖构建器实际行为；升级构建器时若内部导出改变，应重新核对适配，而不是删除测试。

## 验证结果

| 检查 | 结果与限制 |
| --- | --- |
| 隔离 clone 的 `npm ci` | 283 个依赖安装成功，显式 Electron 安装钩子成功；使用本机已有下载缓存，不是全新机器或离线测试 |
| 源目录 `npm test` | 15/15；无窗口、无密钥的真实 Electron Node 后台 HTTP 200 |
| `dist:dir` 后指定 EXE/runtime 再跑 `npm test` | 15/15，包括复制回归、picker、后台启动、资源编辑及任务栏参数 |
| 新解包版 `test:artifact` | 3/3；名称、7 帧图标、ASAR 完整性正确 |
| 安装包、便携包生成 | 均成功；先验证解包版，再通过 `--prepackaged` 封装 |
| 两个包内的 EXE、ASAR | 用 `7za e -so` 只读提取，分别与已检查的解包版逐字节一致；两个启动器自身的 7 帧图标也与 ICO 一致 |
| 与已验收运行时比较 | 全部 11,499 个 runtime 文件，路径和字节一致；新旧主 EXE 的非 `.rsrc` 节一致；ASAR 仅包含主程序、manifest 和图标 |
| 签名 | Windows `Get-AuthenticodeSignature` 确认新主 EXE、安装器与便携启动器均为 `NotSigned`；不能把构建日志中的 signing 步骤当作已签名 |
| 合回主工作区 | 用完全相同的锁文件再次 `npm ci`，两个 audit 为 0，源测试 15/15，原已验收 EXE 的资源检查 3/3 |
| 原产物保护 | `docs/release-0.1.2.json` 中四个原产物的 SHA-256 全部重新匹配；harness HEAD/工作区未变 |

这是 **18 项不同的自动检查**，源目录和打包目录的 15 项部分重复执行，不叠加宣称更多测试覆盖。主 EXE/ASAR 和安装器因构建器及 manifest 变化而有新哈希，不宣称整个包与原产物逐字节相同。

保留现有 `signAndEditExecutable: false` 与 `afterPack` 资源编辑方案。新版提示支持 `signExecutable: false`，但本轮没有顺便切换已验收的图标写入机制；现有方案在新工具链下完整通过检查，不需要开启开发者模式。

## 后续重复验证

以下命令用于**新的、已 staging runtime 的桌面 checkout**，输出 `dist/toolchain-check` 必须尚不存在。不要在已验收的 `dist/0.1.2/` 重建同版本覆盖原文件。

```powershell
npm ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency install failed' }
npm run audit:build
if ($LASTEXITCODE -ne 0) { throw 'Build audit failed' }
npm run audit:runtime
if ($LASTEXITCODE -ne 0) { throw 'Runtime audit failed' }
npm test
if ($LASTEXITCODE -ne 0) { throw 'Source checks failed' }
if (Test-Path -LiteralPath 'dist/toolchain-check') { throw 'Choose a fresh output directory' }
npm run dist:dir -- --config.directories.output=dist/toolchain-check
if ($LASTEXITCODE -ne 0) { throw 'Unpacked build failed' }
$dshPreviousTestExe = $env:DSH_TEST_EXECUTABLE
$dshPreviousTestRuntime = $env:DSH_TEST_RUNTIME
try {
  $env:DSH_TEST_EXECUTABLE = (Resolve-Path 'dist/toolchain-check/win-unpacked/DSH Desktop.exe').Path
  $env:DSH_TEST_RUNTIME = (Resolve-Path 'dist/toolchain-check/win-unpacked/resources/runtime').Path
  npm run test:artifact
  if ($LASTEXITCODE -ne 0) { throw 'EXE checks failed' }
  npm test
  if ($LASTEXITCODE -ne 0) { throw 'Packaged backend checks failed' }
} finally {
  $env:DSH_TEST_EXECUTABLE = $dshPreviousTestExe
  $env:DSH_TEST_RUNTIME = $dshPreviousTestRuntime
}
npm run dist -- --prepackaged dist/toolchain-check/win-unpacked --config.directories.output=dist/toolchain-check
if ($LASTEXITCODE -ne 0) { throw 'Installer/portable packaging failed' }
```

`--prepackaged` 不执行 `afterPack`；不得跳过之前的解包构建、实际 EXE 检查和打包后台检查。`audit:runtime` 需要已存在的 runtime 并查询网络数据库，它不是 staging 命令。

## 回滚、剩余事项与交接

- 运行层面无需回滚：用户已验收的 0.1.2 文件未变，也未迁移任何数据。继续使用它即可。
- 工具链若需回退，优先将旧提交 `a360733d76e1284344ff3c01b35c6f9755902b7a` 克隆到新的检查目录再 `npm ci`；不要重置或删除当前工作区。旧工具链仍带已知审计告警，不作为后续发布默认方案。
- 本轮隔离目录和产物仅用于验证，版本号仍为 0.1.2。未来发布应设置新的版本并用新目录输出，另外完成用户入口验收。
- 用户已确认的目录选择、重新选择、取消对话框、任务栏 bug 不重新打开。安装器、便携入口及其固定/关闭/重启、全新机器、代码签名仍未验收。
- 尚无远端备份；需用户明确 GitHub 所有者与可见性后才能创建仓库/fork 并推送。已有本地提交和源码恢复补丁不等于异机备份。
- [HANDOVER.md](../HANDOVER.md) 已更新当前状态；历史 0.1.1/0.1.2 的发布记录与哈希保持原样。
