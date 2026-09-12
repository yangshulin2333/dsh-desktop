# 0.1.3 Windows 兼容修复

## 修改

- `build.portable.unpackDirName=true`：锁定的 electron-builder 26.15.3 实际代码在 true 时不定义 UNPACK_DIR_NAME，使用每次启动独立的 $PLUGINSDIR/app。其类型文档写 false，但实现相反，必须以实际构建和双启动验证为准。
- `main.js` 设置 DSH_DESKTOP=1；`scripts/desktop-compat.mjs` 为已 staging 的补丁 runtime 添加 Windows 桌面专用 browse 分支。命令行原生选择和 upstream-only 不变。
- 目录选择改为应用内浏览器，绕开原生 COM 弹窗崩溃路径；没有修改账户配置，也没有安装全局 Node。

## 已验证

- 真实 0.1.2 便携 EXE 双启动：第一个实例退出码 1，报 cannot resolve profile bundle "@deepseek-ai/dsh-web-app"。两个启动器共用目录，第二个退出清理了第一个仍在使用的资源。
- 真实 0.1.3 便携 EXE 相同双启动：第一个实例退出码 0，依赖仍可解析，路径位于每次启动独立的 ns*.tmp/app。
- 打包后的 17 项测试通过，实际 EXE 的 3 项资源/完整性检查通过。
- 使用实际打包后端、独立空白 DSH_HOME，在浏览器里完成中文目录选择、取消和选择另一目录，工作区显示正确。没有输入 API Key 或发送模型请求。
- 原生弹窗的具体 Win10 崩溃机制尚未在 Win10 重现；此版本通过换用现有 browse 交互规避该路径。

## 限制与对方复测

测试机为 Windows 11，不声称 Windows 10 已验收。对方先完全退出 0.1.2，打开 0.1.3，依次测试选择文件夹、取消、重新选择，再关闭并打开程序。安装器完整交互、全新 Win10 机器和代码签名未验收。

旧版 EXE 保留，可退出新版后启动旧版回退，但旧版仍有上述已确认缺陷。不需要删除会话或 API Key。