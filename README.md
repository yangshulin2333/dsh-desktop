# DSH Desktop

面向 Windows 的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 桌面客户端。下载成品 EXE 即可使用，无需另装 Node.js、pnpm 或运行命令行。

> 本项目是非官方社区项目，不由 DeepSeek 开发、背书或提供支持。客户端与后端在本地运行，模型推理仍调用云端 API，需要联网和 DeepSeek API Key，并按 API 使用情况计费；不是离线模型。

## 下载与使用

**普通用户请选择下面的 EXE，不要下载 Code → Download ZIP 或 Release 中的 Source code：那些是源码，里面没有可直接运行的程序。**

| 版本 | 下载 | 怎么用 |
| --- | --- | --- |
| 便携版（推荐） | [下载 Portable 0.1.2](https://github.com/yangshulin2333/dsh-desktop/releases/download/v0.1.2/DSH-Desktop-Portable-0.1.2-x64.exe) | 放到固定文件夹，双击 EXE 启动，无需手动解压 |
| 安装版 | [下载 Setup 0.1.2](https://github.com/yangshulin2333/dsh-desktop/releases/download/v0.1.2/DSH-Desktop-Setup-0.1.2-x64.exe) | 双击，按向导选择安装目录，之后从桌面或开始菜单启动 |

[查看发布页与校验文件](https://github.com/yangshulin2333/dsh-desktop/releases/tag/v0.1.2)。当前提供 Windows x64 包，两个版本选一个即可。

1. 下载便携版或安装版。
2. 启动后按提示填写 [DeepSeek API Key](https://platform.deepseek.com/api_keys)。请勿把密钥发到 Issues 或公开仓库。
3. 在应用里选择工作目录并开始对话。

构建未签名，Windows 可能显示发布者未知提示。请核对下载来源和发布页的 SHA-256。此发布沿用已有 0.1.2 成品，未重新构建；已有自动验证，但全新电脑安装、安装器和便携启动器的完整交互验收仍待完成，详见[验证记录](docs/validation-0.1.2.md)。

## 功能

- 将 Harness 包装为独立桌面窗口。
- 在输入框下方显示当前会话的人民币费用估算，例如 `约 ¥0.02`。
- 在 Settings → Models → DeepSeek 的 API Key 下方显示账户余额。

估算方法与边界见[补丁说明](docs/patches.md)，实际费用以账户账单为准。

## 数据目录与升级

桌面版使用独立数据目录：

```text
%APPDATA%\DSH Desktop\dsh-home
```

会话与 API Key 和命令行版的 `~/.dsh` 分开存放，避免两边插件配置相互影响。

从 0.1.1 升级时，先取消固定旧 Electron 项并完全退出旧版，再启动新版并重新固定任务栏。便携版固定后不要移动或删除 EXE。详情见[任务栏验收记录](docs/validation-0.1.2.md)。

## 从源码构建（开发者）

需要 Node.js `^22.19.0 || >=24.0.0`、pnpm、Git，以及已构建的带补丁 Harness 源码。完整恢复步骤、源码版本与限制见[可复现构建指南](docs/reproducible-build.md)。

```bash
git clone https://github.com/yangshulin2333/dsh-desktop.git
cd dsh-desktop
npm ci
# 先按构建指南恢复 Harness 补丁并执行 pnpm run build
node scripts/build-runtime.mjs --harness /path/to/deepseek-harness
npm start
# 运行检查与生成安装版、便携版
npm test
npm run dist
```

`--harness` 必须指向已编译的补丁源码。输出目录须不存在或为空，不要覆盖已有的 `dist/0.1.2/`。仅研究上游原版时可用 `--upstream-only`，它不等于本项目的完整桌面发行版。

当前源码工具链与已保留的 0.1.2 成品构建工具版本不同；本次发布的是原始成品，哈希见[产物记录](docs/release-0.1.2.json)。验证新构建时需检查实际 EXE 和打包后的后端，不能仅以打包命令成功作为验收。

## 开发与验证资料

- [完整英文技术说明](README.en.md)：运行原理、资源复制边界、Electron 要求、签名与打包问题。
- [工具链维护记录](docs/toolchain-hardening-2026-08-27.md)：依赖检查、实际产物验证及回滚说明。
- [源码公开记录（2026-08-27，历史状态）](docs/publication-2026-08-27.md)。安装包发布以当前 Releases 为准。

## 许可证

[MIT](LICENSE)。DeepSeek Harness 在构建时从公共 npm 仓库获取，源码恢复补丁保留[上游 MIT 许可证](patches/LICENSE.deepseek-harness)。
