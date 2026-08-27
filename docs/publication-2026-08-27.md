# 公开源码上传与恢复核验

日期：2026-08-27。状态：**公开仓库已创建，原源码及七个历史提交已原样推送，并从公开 URL 重新克隆核对。** 本页及交接更新作为之后的一条文档提交，不改写原七个提交。

## 目标、授权与范围

- 仓库：[yangshulin2333/dsh-desktop](https://github.com/yangshulin2333/dsh-desktop)，可见性为 Public，默认分支为 `master`。
- 用户指定使用内置浏览器登录账号，确认公开，并在得知历史中存在邮箱与余额记录后，明确同意不脱敏、直接上传现有源码和历史。原提交内容、作者字段与提交 ID 均保留；本轮没有新增披露具体邮箱或余额值。
- 浏览器账户及 GitHub CLI 的当前账户均核实为 `yangshulin2333`。仓库通过内置浏览器创建，Git 使用同账号的已有授权推送；未读取或导出浏览器 cookies，未创建新令牌或改变全局认证设置。
- 只推送桌面仓库 `master`。包含源码、图标、构建脚本、锁文件、测试、交接文档与 Harness 恢复补丁。不包含 `runtime/`、`node_modules/`、`dist/`、`.repro/` 或用户应用数据；没有创建 GitHub Release、上传 EXE、另建 Harness fork 或操作桌面应用。

## 上传前检查

- 起始工作区干净，没有 remote；原 HEAD 为 `d7e84c993b367963a9ed10250f0f19a96b9e83ce`，共 7 个提交、46 个当前受版本控制文件。
- 已枚举全部历史对象：77 个 blob，合计 2,237,246 字节，最大为运行时锁文件 552,990 字节。没有把被忽略的构建目录打包后上传。
- 对历史文本检查了常见私钥、GitHub token、提供商 key、AWS key、URL 凭据和明文密钥赋值模式，没有发现这些模式的候选。该自定义检查不是专业密钥扫描器，也不是全面安全保证。
- 已有个人邮箱和文档中的历史余额未清理，依据上述明确授权保留；未重写 Git 历史或执行强制推送。

## 远端核验

1. 创建前目标仓库查询返回 404；创建后 API 确认 `private=false`、`visibility=public`、目标账号具有写权限。仓库以空状态创建，没有生成额外的 README、license 或 `.gitignore` 提交。
2. 添加 `origin=https://github.com/yangshulin2333/dsh-desktop.git`，执行普通 `git push --set-upstream origin master`。本地分支保持 `master`，没有重命名。
3. 首次推送后的远端 `refs/heads/master` 为 `d7e84c993b367963a9ed10250f0f19a96b9e83ce`，与本地原 HEAD 完全一致；GitHub 默认分支为 `master`。
4. 禁用本次 clone 的凭据 helper 与交互提示，从公开 HTTPS URL 重新克隆到 `.repro/github-restore-2026-08-27/`。不是本地 clone，不借用工作区对象。
5. 新 clone 的 HEAD、完整 `git rev-list` 历史、完整 `git ls-tree -r`（路径、模式与对象 ID）均与原仓库相同；工作区干净，`git fsck --full` 通过。

## Harness 恢复核验

从上述 GitHub clone 读取补丁及固定输入，再用本机 Harness 的上游基线对象和**独立临时 index**执行 `read-tree`、`apply --cached` 与 `write-tree`：

| 项目 | 核验值 |
| --- | --- |
| 上游基线 | `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e` |
| 下载补丁 SHA-256 | `0f3c0f24cc49cdb67329d413829102273a0292e891fcd64c9c5f06fa5c0a4767` |
| 恢复后的源码树 | `1a61c75417b59cd5622c1c411192f7bb9585611c` |
| 对照输入 | [harness-source.json](../patches/harness-source.json)，哈希与源码树均匹配 |

本机 `D:/AI/DeepSeek` 的实际 index、HEAD 与工作文件未改动。临时 index 保留在忽略目录 `.repro/` 下。本轮验证的是**远端补丁能恢复原源码树**，没有重新下载和编译整份 Harness，也没有重复运行桌面测试；此前的构建和运行证据见[构建复现](reproducible-build.md)与[工具链验证](toolchain-hardening-2026-08-27.md)。

Harness 的两个本地提交本身尚未推送到独立 fork，因此不能从官方仓库直接 checkout 那两个 ID。公开仓库中的基线 + 完整补丁足以恢复相同源码树，消除了修改仅存在本机目录中的风险。

## 日常操作与剩余边界

```powershell
git clone https://github.com/yangshulin2333/dsh-desktop.git
# 在原桌面仓库中检查远端同步状态：
git status --short --branch
git log -1 --format='%h %s'
git ls-remote origin refs/heads/master
```

后续普通提交使用 `git push`，不要强推或重新初始化仓库。源码上传并不代表本机应用数据已备份，也不代表安装器/便携入口已验收。

- 当前只公开源码；二进制发布需要另行安排，并先完成安装器、便携入口及全新机器验收。
- 已验收的本地 0.1.2 及用户数据没有修改，不需要重装。
- 代码签名与未来 CI 仍是独立事项。
- 当前交接入口：[HANDOVER.md](../HANDOVER.md)。
