# 更新记录

## v1.4.1

- 新增 Windows x64 单文件便携 EXE。首次启动自动解压并打开桌面客户端；使用者无需再解压 ZIP、复制运行依赖或运行 CMD。
- 通过 electron-builder 的 Windows `portable` 目标生成无人值守便携启动器，运行级别为普通用户。
- Electron 待办数据继续保存在原有 `%APPDATA%\TodoDesktop` 位置。
- 自动保留 v1.4.0 的 Windows ZIP 作为备用下载；新版本 EXE 当前没有代码签名，Windows 可能显示 SmartScreen 提示。

## v1.4.0

首次 GitHub 公开发布 Todo Desktop Electron 桌面客户端。

- 米灰色与灰蓝色界面，支持紧凑小窗和完整界面切换。
- 桌面窗口置顶、位置记忆、系统托盘与单实例运行。
- 待办标题、多行正文、计划日期、紧急事项、编辑、完成与删除。
- 本地 JSON 保存、原子写入、上一版本备份与异常恢复。
- JSON 导入与导出，兼容旧网页数据，合并时保留冲突记录并跳过重复内容。
- 隔离的 Electron 预加载桥接、受信 IPC 与本地资源白名单。

提供 Windows x64 免安装目录 ZIP 包与 SHA-256 校验文件。解压整个文件夹后运行 `TodoDesktop.exe`，请保留旁边的 DLL、resources 与 locales 文件。该版本未进行应用代码签名，不含安装器或自动更新。

源码开发与打包需要 Node.js 22.12+，推荐 Node.js 24 LTS；运行 Release 包无需安装 Node.js。
