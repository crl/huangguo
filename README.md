# 黄果下载

macOS 原生，以及 Windows 可用的 Electron 版 [PikPak](https://mypikpak.com) 分享下载器。粘贴 `mypikpak.com/s/…` 链接，浏览目录、勾选文件或文件夹，批量下到本地。

## 功能

- 打开公开分享链接，支持提取码
- 面包屑导航、当前目录搜索
- 勾选文件 / 全选 / 只勾选视频；选中文件夹会递归扫描其中的视频
- 按分享目录结构落盘。macOS 默认 `~/Movies/PikPak`，Windows 默认 `%USERPROFILE%\Videos\PikPak`
- 最多 2 路并发下载，失败可重试
- 「优先转码」：更稳，清晰度可能更低
- 用系统播放器打开已完成的文件

## Windows（Electron）

需要 Node.js 20 或更高版本。

```bash
cd desktop
npm install
npm run dev
```

源码在 `desktop/`。界面和下载逻辑与 macOS 版对应。

## macOS

- macOS 14 或更高版本
- Xcode 15 或更高版本

```bash
git clone https://github.com/crl/huangguo.git
cd huangguo
open Huangguo.xcodeproj
```

在 Xcode 中选择 **Huangguo** scheme，按 `⌘R` 运行。

命令行构建：

```bash
xcodebuild -scheme Huangguo -configuration Debug
```

## 使用

1. 粘贴 PikPak 分享链接（可选填密码），点 **打开**
2. 双击进入文件夹，勾选要下的文件或目录
3. 需要时改保存路径，点 **下载所选**
4. 在右侧队列查看进度；完成后可点文件用系统播放器打开

首次启动会尝试打开内置的默认分享链接。链接、密码和保存目录会记在本地。

## 结构

```
Huangguo/                      # macOS SwiftUI
├── HuangguoApp.swift
├── AppStore.swift
├── Models/
├── Services/
└── Views/
desktop/                       # Windows Electron + React
├── src/main/                  # PikPak 客户端与下载
├── src/preload/
├── src/renderer/              # 顶栏、目录、下载队列
└── src/shared/
```

## 说明

本应用只访问你主动打开的 PikPak 分享，不登录账号。请遵守分享方与 PikPak 的使用条款，仅下载你有权获取的内容。

## Electron 流式播放与打包

视频卡片上的播放按钮可边缓冲边看，暂停播放后仍会继续缓冲；关闭播放器停止缓冲。缓冲文件写入所选下载目录，名称为 `视频名.播放缓冲-编号.part.mp4`，完整接收后去掉 `.part`。总时长与已缓冲时间分开显示。

实时转换 MPEG-TS/HEVC 视频需要 FFmpeg。开发运行可使用 `~/.local/bin/ffmpeg`、`/opt/homebrew/bin/ffmpeg` 或 `/usr/local/bin/ffmpeg`。macOS 打包前，把适用于目标架构、可独立运行的 FFmpeg 可执行文件放到 `desktop/build/ffmpeg`，并赋予执行权限；打包工具会将其复制进应用。该二进制文件不纳入 Git。

```bash
cd desktop
npm ci
npm run dev
# 准备好 build/ffmpeg 后生成 macOS 安装包
npm run dist
```
