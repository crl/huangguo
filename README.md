# 黄果下载

macOS 原生的 [PikPak](https://mypikpak.com) 分享下载器。粘贴 `mypikpak.com/s/…` 链接，浏览目录、勾选文件或文件夹，批量下到本地。

## 功能

- 打开公开分享链接，支持提取码
- 面包屑导航、当前目录搜索
- 勾选文件 / 全选 / 只勾选视频；选中文件夹会递归扫描其中的视频
- 按分享目录结构落盘，默认保存到 `~/Movies/PikPak`
- 最多 2 路并发下载，失败可重试
- 「优先转码」：更稳，清晰度可能更低
- 用系统播放器打开已完成的文件

## 环境

- macOS 14 或更高版本
- Xcode 15 或更高版本

## 构建

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
Huangguo/
├── HuangguoApp.swift          # 入口
├── AppStore.swift             # 分享浏览与勾选状态
├── Models/                    # 分享条目、下载任务
├── Services/
│   ├── PikPakShareClient.swift
│   ├── PikPakConfig.swift
│   └── DownloadManager.swift
└── Views/                     # 顶栏、目录、下载队列
```

## 说明

本应用只访问你主动打开的 PikPak 分享，不登录账号。请遵守分享方与 PikPak 的使用条款，仅下载你有权获取的内容。
