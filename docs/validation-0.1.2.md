# 0.1.2 任务栏图标修复与验收

日期：2026-08-27。状态：代码修复、两个包的生成、17 项自动检查通过；**实际固定/取消固定、右键菜单与固定后重新启动仍待用户验收**。没有操作用户桌面、启动 GUI、改 Windows 开发者模式、清图标缓存或重启 Explorer。

## 目标、证据与根因

用户反馈：运行中显示终端图标，但右键菜单显示 Electron，固定后图标也变为 Electron。

只读检查发现：

- 运行中的主程序仍是 `dist/0.1.1/win-unpacked/DSH Desktop.exe`。
- Windows 原生 `FileVersionInfo` 读到 `FileDescription=Electron`、`ProductName=Electron`、`InternalName=electron.exe`、`OriginalFilename=electron.exe`，版本为 `42.10.1`。
- 用户固定目录中的 `Electron.lnk` 指向上述 0.1.1 EXE，`IconLocation=,0`，没有另指定图标。只读取该文件，未保存或修改。
- 新的产物检查针对旧 EXE 得到 **2 失败 / 1 通过**：名称错误、内嵌图标仍为 Electron 的 4 帧而非项目的 7 帧；ASAR 完整性正确。

对照假设：

| 假设 | 证据与结论 |
| --- | --- |
| 打包跳过了 EXE 资源写入 | 确认。electron-builder 25.1.8 的 `signApp` 在 `signAndEditExecutable=false` 时直接返回，同时跳过 `signAndEditResources`。 |
| 没有设置 AppUserModelID | 不是当前主因。旧 `main.js` 已设置 `com.dsh.desktop`，但没有设置窗口的完整 relaunch 信息。 |
| 只是 Windows 图标缓存错误 | 不能解释原始问题。EXE 本身的名称与图标已错误；旧固定项仍需人工移除，因为它仍指向旧程序。 |
| 便携版固定后可能引用临时目录 | 从本地 `portable.nsi` 确认该生命周期风险，非本次用户实际复现的入口。启动器设置 `PORTABLE_EXECUTABLE_FILE` 并在结束时移除解包目录，因此补上持久启动器路径并单测。 |

## 最小修改与边界

1. 保留 `signAndEditExecutable: false`，仍不签名，不触碰 Windows 权限配置。
2. `scripts/brand-windows.cjs` 作为 `afterPack`，只写入主 EXE 的图标、产品名称和版本等资源。直接声明 `resedit@1.7.2`；它原已在 electron-builder 的锁定依赖中，没有升级打包工具链或引入另一套原生签名工具。
3. 保留原 `RT_GROUP_ICON` 标识，用现有 `build/icon.ico` 的 7 个尺寸替换图标。保留代码段、执行 manifest、ASAR 完整性资源和第三方 EXE。遇到签名输入或意外资源布局时失败，不静默绕过。
4. `main.js` 在打包的 Windows 窗口显示前设置 `setAppDetails`：相同 App ID、EXE 图标、名称和带引号的重启命令。安装/解包版用 `process.execPath`；便携版用 `PORTABLE_EXECUTABLE_FILE`。开发运行和其他平台不改 relaunch 信息。
5. 版本为 0.1.2，产物独立放在 `dist/0.1.2/`。原 0.1.1 文件保留，应用数据目录不变，无数据迁移。

接口依据：[Electron setAppDetails](https://www.electronjs.org/docs/latest/api/browser-window#winsetappdetailsoptions-windows)、[Windows RelaunchCommand](https://learn.microsoft.com/en-us/windows/win32/properties/props-system-appusermodel-relaunchcommand)。资源写入 API 以本地 `resedit@1.7.2` 的 README/类型声明，以及打包器自身的 `addWinAsarIntegrity` 用法为依据。

## 自动验证

- `npm test`：**14/14**。包括此前 9 项 staging/picker/backend 检查，新增 3 项任务栏参数测试、2 项资源编辑测试。
- 任务栏参数测试在修复前是 **2 失败 / 1 通过**；修复后 3 项全通过。运行真实 `main.js`，替换 Electron 为测试对象，覆盖中文/空格路径、便携版目标与非打包运行，不创建窗口。
- 资源编辑测试使用 Electron 二进制的临时副本，检查除图标/版本外的资源及所有非 `.rsrc` 节字节哈希不变，第三方 EXE 未改。
- `npm run test:artifact`：**3/3**。实际 0.1.2 EXE 的名称/版本正确，7 帧图标与源 ICO 各帧逐字节一致，EXE 内 ASAR 哈希与包内文件匹配。
- Windows 原生读取：`DSH Desktop` / `DSH Desktop.exe` / `0.1.2.0`；`Icon.ExtractAssociatedIcon` 可加载其 32×32 图标，无窗口。
- 指定打包 EXE 和其 runtime 后再次运行 `npm test`：**14/14**。真实 Electron Node 后台以空临时数据目录、无 API 密钥启动，HTTP 返回 200，测试结束只停止自有子进程。
- 安装包和便携包通过 `7za e -so` 读取内嵌 `DSH Desktop.exe` 和 `resources/app.asar`，均与已检查解包版逐字节一致。没有执行安装包或便携启动器。
- 安装包和便携启动器自身的默认内嵌图标也各有 7 帧，逐帧内容与源 ICO 一致。
- ASAR 只含 `main.js`、`package.json` 和图标；其中 `main.js` 与源码一致，包版本为 0.1.2。
- 0.1.2 和已验收 0.1.1 的 **11,499 个 runtime 文件**，文件列表及文件内容逐一相等。本次没有换入另一份重建的前端 bundle，也没有修改费用、余额和目录选择功能。
- 两个产物的大小与 SHA-256 见 [release-0.1.2.json](release-0.1.2.json)。尚未做 0.1.2 的全新机器安装或独立干净 checkout 重建；0.1.1 的复现证据保留在原记录中。

## 重复检查命令

在已按[构建说明](reproducible-build.md)准备好依赖及补丁 runtime 的桌面 checkout 中运行。新版本应选新的输出目录，不覆盖正在使用的版本。

```powershell
npm test
if ($LASTEXITCODE -ne 0) { throw 'Source checks failed' }
npm run dist:dir -- --config.directories.output=dist/0.1.2
if ($LASTEXITCODE -ne 0) { throw 'Unpacked build failed' }
npm run test:artifact
if ($LASTEXITCODE -ne 0) { throw 'EXE resource checks failed' }
$env:DSH_TEST_EXECUTABLE = (Resolve-Path 'dist/0.1.2/win-unpacked/DSH Desktop.exe').Path
$env:DSH_TEST_RUNTIME = (Resolve-Path 'dist/0.1.2/win-unpacked/resources/runtime').Path
npm test
if ($LASTEXITCODE -ne 0) { throw 'Packaged backend checks failed' }
npm run dist -- --prepackaged dist/0.1.2/win-unpacked --config.directories.output=dist/0.1.2
if ($LASTEXITCODE -ne 0) { throw 'Installer/portable packaging failed' }
```

`--prepackaged` 会打包已有目录，不执行 `afterPack`。必须先完成上面的 `dist:dir` 和实际 EXE 检查，不能拿旧 0.1.1 解包目录直接套新版本安装包名称。

## 用户操作与通过标准

1. 取消固定旧的 **Electron** 项，然后完全退出旧 DSH。单实例机制会让第二次启动聚焦旧进程；需要先退出再换版本。
2. 运行 `D:\AI\dsh-desktop\dist\0.1.2\win-unpacked\DSH Desktop.exe`。
3. 右键任务栏：应用入口应为 **DSH Desktop** 和终端图标，再点击固定。
4. 关闭应用：固定项仍应是终端图标。再从固定项启动：能正常打开 DSH，名称/图标仍正确。
5. 如果改用安装包或便携包，单独重复步骤 3–4；便携 EXE 应先放在以后会保留的位置，不要固定后移动或删除它。

这些步骤由用户操作。自动测试不能替代 Windows Shell 对新固定项的实际验收。不要再次把“窗口显示正确”当作“固定后正确”。

## 回滚与剩余风险

- 回滚：退出 0.1.2，再打开保留的 `dist/0.1.1/win-unpacked/DSH Desktop.exe`，数据目录无需迁移。原包仍有已知的 Electron 图标问题。
- 已存在的固定快捷方式没有自动改写，不清缓存、不改注册表、不重启 Explorer。
- 仍是未签名构建。既有打包工具链的依赖审计问题、远端备份/仓库归属、全新机器及安装包/便携入口验收不在此次图标修复的已完成范围内。
