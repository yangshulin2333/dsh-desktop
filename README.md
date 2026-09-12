# DSH Desktop 社区安装版

基于 [DeepSeek 官方 Harness](https://github.com/deepseek-ai/deepseek-harness) 桌面程序制作的 Windows 一键安装包，内置 Node.js、pnpm 和运行依赖，并增加**每次使用的费用估算**和**账户总余额查询**。

这是社区打包与修改版，不是 DeepSeek 官方发行包。当前为预发布测试版：本机 Windows 11 已验证，Windows 10 实机仍待验收。

## 点哪里下载、怎么安装

**[下载 Windows 64 位安装 EXE](https://github.com/yangshulin2333/dsh-desktop/releases/download/v0.1.5-rc.2-community.1/DSH-Desktop-Community-0.1.5-rc.2-Setup-x64.exe)** · [发布说明与校验文件](https://github.com/yangshulin2333/dsh-desktop/releases/tag/v0.1.5-rc.2-community.1)

1. 下载上面的 `Setup-x64.exe`，双击安装。
2. 从桌面打开 **DSH Desktop Community**，等待首次本地初始化。
3. 填写并保存自己的 DeepSeek API Key，选择工作目录后使用。

不需要另外安装 Node 或 pnpm，不需要执行命令行。首次依赖初始化可离线完成；模型调用和余额查询需要联网。

**Code → Download ZIP 和 Source code 是源码，不是安装程序。** 当前提供安装版；旧便携版资料保留在仓库历史说明中。

## 两个新增功能

- **费用估算**：回答下方的用量按钮显示本轮估算费用，点击后查看各次请求金额。按请求原模型、时间、缓存命中和输出用量计算，显示人民币。统计不足或模型未知时显示无法估算。
- **账户总余额**：在设置 → 模型 → DeepSeek 的编辑页，点击“刷新余额”。使用已经保存的 API Key 查询官方账户余额；更换密钥后须先保存。

估价表依据 [2026-09-12 官方人民币价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)，金额是估算，实际扣费以账户账单为准。价格变化需要更新本版本的价格表。

## 安装与数据

安装包约 161 MB，当前用户安装，不要求预装开发工具。默认数据放在 `%APPDATA%\DSH Desktop Community\harness-home`，与旧版数据分开；旧会话和密钥不会自动迁移。显式设置 `DSH_HOME` 时使用该路径。

此包未签名，Windows 可能显示“未知发布者”。请核对本仓库下载地址和发布页 SHA-256。社区版不连接官方自动更新源；更新时下载新的社区安装包。

## 已验证与待验证

已验证安装 EXE 成功退出；从实际安装后的文件，使用全新数据目录和不含 Node 的 PATH 完成离线安装、真实后端启动、页面 HTML 加载及第二次启动检查。费用计算、余额显示和相关回归检查已通过。目录选择使用官方已有的应用内浏览组件。

尚未完成：对方 Windows 10 实机操作、真实付费请求、真实账户余额，以及完整桌面界面的人工验收。不要把这些本机检查理解为 Win10 已通过。

## 源码与复现

仓库 `official-community` 目录提供源码补丁、上游固定版本和构建脚本。Release 同时提供完整源码、验证记录和源码回滚材料。仓库根目录保留旧版外壳代码，新安装版使用 `official-community` 中的构建入口。
