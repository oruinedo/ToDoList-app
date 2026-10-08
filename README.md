# Todo Desktop V1.4 · Electron 桌面小窗

米灰色背景、灰蓝色点缀。启动即打开独立桌面小窗，不连接原来的网页服务；日常运行不需要 Docker、Nginx、浏览器或数据库。

> **直接使用：** 前往 [Releases](https://github.com/oruinedo/ToDoList-app/releases/latest)，下载 `TodoDesktop-v1.4.0-win32-x64.zip`，解压整个文件夹后双击 `TodoDesktop.exe`。无需安装 Node.js。
> 本仓库提供源码；从源码启动需要 Windows 上的 Node.js 22.12 或更高版本，以及网络下载 Electron。
> 推荐使用 Node.js 24 LTS。在 Windows 本机启动或打包，不要在 WSL 中运行这份 Windows 打包脚本。
> 打包成功后，运行输出目录内的 `TodoDesktop.exe` 不再需要单独安装 Node.js，也不需要联网下载运行依赖。

## 目录

- [1. 最快启动方式](#1-最快启动方式)
- [2. 生成可双击的客户端](#2-生成可双击的客户端)
- [3. 小窗的操作](#3-小窗的操作)
- [4. 数据保存与备份](#4-数据保存与备份)
- [5. 从旧网页迁移待办](#5-从旧网页迁移待办)
- [6. 后续更新](#6-后续更新)
- [7. 文件结构](#7-文件结构)
- [8. 排错与边界](#8-排错与边界)
- [9. 测试与实现依据](#9-测试与实现依据)

## 1. 最快启动方式

先将整个 ZIP 解压到一个独立文件夹，例如 `D:\todo-electron-v1.4`。不要覆盖原来的 Docker 项目，也不要把这里的 `src/index.html` 放进 Nginx。

确认 Windows 已安装 Node.js 22.12+（推荐 24 LTS）后，**双击根目录的 `start.cmd`**。

它会进入当前项目目录；首次运行时安装 Electron，然后启动客户端。安装失败时会保留命令行错误，不会清空待办数据。第一次下载可能需要等待，后续已有运行包时不再重复下载。

也可以在能看到 `package.json` 的文件夹打开普通 PowerShell，分别执行：

```powershell
npm.cmd install --include=dev --no-audit --no-fund
```

```powershell
npm.cmd start
```

出现独立小窗即为客户端；无需打开 `localhost:8088`。

使用 `npm.cmd start` 时保留该终端；彻底结束客户端可从托盘或「数据与设置」退出。日常双击启动可以使用 `start.cmd`，或使用下一节打包后的程序。

## 2. 生成可双击的客户端

在 Windows 中双击项目根目录的 **`build-client.cmd`**。

或在同一项目目录运行：

```powershell
npm.cmd run package:win
```

先完成依赖安装再执行此命令。打包脚本使用已下载到本地的官方 Electron 运行包，不需要另行安装打包工具。

普通 Windows x64 电脑的首次输出目录为：

```text
release\TodoDesktop-win32-x64\
├── TodoDesktop.exe
├── create-desktop-shortcut.cmd
├── resources\
│   └── app\
├── locales\
├── LICENSE
└── 其它 Electron 运行文件
```

双击 **`TodoDesktop.exe`** 直接打开小窗。建议把整个输出文件夹放在长期保留的位置，再运行里面的 `create-desktop-shortcut.cmd` 创建桌面快捷方式。

**不要只复制 EXE，也不要删除旁边的 DLL、resources、locales 等运行文件。** 这是免安装的目录包，不是单文件 EXE，也不是安装向导。待办数据仍保存在用户目录，不会随程序目录自动迁移到另一台电脑。

脚本会识别下载运行包的 Windows 架构；ARM64 等输出目录后缀会不同。重复打包若目标目录已存在，会生成带时间戳的新目录，不覆盖上一次的构建。

本项目没有进行应用级代码签名或安装包签名，EXE 的内部部分元信息仍来自 Electron。系统是否弹出安全提示取决于本机策略；请核对来源，不要关闭安全软件或绕过组织的安全策略。

## 3. 小窗的操作

| 操作 | 行为 |
| --- | --- |
| 启动客户端 | 默认紧凑小窗，首次约 440 × 660；默认显示「今天」 |
| 拖动顶部「待办小窗」标题区域 | 移动窗口；拖动边缘调整大小 |
| 「已置顶 / 置顶」 | 切换是否浮在其他普通窗口上方，保存此偏好 |
| 右上角 ↗ / ↙ | 在同一个窗口切换完整界面与紧凑小窗，不打开浏览器 |
| 右上角 − | 最小化到任务栏 |
| 右上角 × | 托盘可用时收起到托盘，程序继续运行；托盘不可用时关闭退出 |
| 系统托盘图标 | 单击重新显示；右键可显示窗口、切换置顶、导入导出或退出 |
| 再次运行客户端 | 只唤出已有窗口，不同时启动两份数据写入进程 |
| 标题输入框 Enter | 紧凑模式下快速添加；中文输入法选字期间不提交 |
| 「正文与日期」 | 展开多行正文、计划日期和事项类型 |
| 正文内 Enter | 换行，不提交 |
| Ctrl + Enter | 添加任务或保存编辑 |
| 「编辑」 | 修改标题、正文、日期、事项类型；关闭未保存编辑会询问 |
| 右上角 ⋯ 或「数据与设置」 | 导入 JSON、粘贴旧版数据、导出备份、打开数据目录、退出 |

添加、编辑保存、打勾、恢复、删除后立即写入本地文件。**尚未点击添加或保存的输入，不等于已保存任务。** 从菜单退出时，检测到未保存输入会询问；直接关闭到托盘会保留当前窗口与输入。

「今天」仅显示计划日期为当天且未完成的任务，不会把所有逾期任务自动改到今天。完整界面与小窗共用同一份客户端数据。

## 4. 数据保存与备份

本版固定使用以下 Windows 目录，与程序解压位置无关：

```text
%APPDATA%\TodoDesktop\data\
├── tasks.json                  当前待办数据
├── tasks.json.bak              上一次成功保存前的版本
├── settings.json               窗口位置与置顶偏好
└── backups\                    合并导入前的快照
```

在客户端点击「数据与设置 → 打开数据文件夹」即可找到。首次启动后该目录才会创建。

数据以本地 **JSON 明文** 存储，不上传、不加密；请勿把它当作密码保管工具。该文件包含标题、正文、计划日期、紧急状态、完成状态等。操作系统当前账户及具有足够文件权限的程序可以读取它。

保存采用临时文件写入、刷盘、备份和重命名。写入失败会保留现有任务与输入；无法读取主文件时会尝试上一份备份，保留异常原文件并提示核对；主文件与备份均异常时会停止启动，不用空列表覆盖。

`.bak` 只有上一版，**不能替代长期备份**。请定期使用「导出备份」保存到另一处。导入前快照保存在 `backups`；当前版本不会自动清理这些快照。

## 5. 从旧网页迁移待办

**网页版和 Electron 客户端是两份独立存储，不自动同步。** 旧网页内容不会直接出现在客户端里，也不会因为启动客户端而被删除。

### 已经有待办 JSON 备份

在客户端点击 **「⋯ → 导入 JSON 备份」**，选择文件并确认「合并导入」。支持旧版待办数组，以及包含 `items` 数组的备份。V1 / V1.1 的 `text` 字段会转换为标题；V1.2 / V1.3 的 `title`、`body` 和多行正文会保留。

已有记录不会被清空；重复内容会跳过；相同编号但内容不同的记录会另存一条，不覆盖现有任务。格式错误时整次导入不写入。

### 没有导出入口：使用附带的网页导出版本

`migration/index.html` 是在原 V1.3 网页上添加了一个只读导出按钮，不是客户端入口。

1. 将原 Docker 项目内的 `index.html` 另外备份一份，再用 `migration/index.html` 覆盖它。
2. 在原 Docker 项目目录执行：

```powershell
 docker compose up -d --build
```

3. 用**原来的浏览器、用户配置及完整访问地址**打开网页，按 `Ctrl + F5`。不要在 `localhost` 与 `127.0.0.1` 之间切换。
4. 在完整网页右上角点击 **「导出到桌面版 ↓」**，得到 `todo-web-backup.json`。
5. 回到 Electron，选择「导入 JSON 备份」，导入并核对「全部」和「完成」分类。
6. 核对成功后，就不需要再运行 Todo 容器或保留浏览器页面了；不必马上删除原项目或清理浏览器数据。

导出按钮只读取 `localStorage` 的 `todo-local-v1`，不清空或修改旧任务。**不要双击 migration/index.html 来迁移**：直接打开本地文件不是原网页的访问地址，读不到原地址的存储。

### 已经复制了旧网页的原始 JSON

在客户端使用「⋯ → 粘贴旧版数据」，粘贴整个 JSON 数组并确认导入即可。

## 6. 后续更新

源码运行：先从菜单彻底退出客户端，再更新本项目文件；依赖变动时重新执行 `npm.cmd install --include=dev`，然后重新启动。

EXE 运行：先导出备份，再退出旧程序，使用新源码重新打包，保留整个新输出目录。继续使用同一 Windows 账户时，本版设置的 `%APPDATA%\TodoDesktop` 数据路径不变。若移动程序目录，重新创建快捷方式。

不要删除 `%APPDATA%\TodoDesktop` 来「升级」。跨电脑或跨 Windows 用户账户迁移，请使用导出 / 导入。

## 7. 文件结构

```text
todo-electron-v1.4/
├── package.json                 运行入口及固定 Electron 版本
├── start.cmd                    Windows 首次安装并启动
├── build-client.cmd             Windows 安装依赖并打包
├── src/
│   ├── main.cjs                 原生窗口、托盘、受限 IPC、本地文件
│   ├── preload.cjs              仅暴露指定能力的隔离桥接
│   ├── store.cjs                数据校验、原子写入、备份、合并导入
│   ├── index.html               Electron 页面结构（不是网页部署文件）
│   ├── styles.css               沿用米灰色 + 灰蓝色样式
│   └── renderer.js              前端任务交互
├── assets/                      应用图标，无外部字体文件
├── scripts/                     打包及桌面快捷方式脚本
├── migration/index.html         旧网页导出工具
├── tests/                       Node 数据层与模拟主进程测试
└── QA.md                        已完成测试与尚未验证的边界
```

运行时没有第三方 JavaScript 业务依赖；开发依赖仅固定 `electron@44.7.0`。仓库不含 Electron 二进制文件与 node_modules；已提交 `package-lock.json`，可使用 `npm.cmd ci --include=dev --no-audit --no-fund` 复现依赖安装。Release 的 Windows ZIP 包包含完整运行依赖。

## 8. 排错与边界

- `node` 找不到：在 Windows 安装 Node.js LTS 后重新打开终端，不是只在 WSL 中安装。
- 下载超时、连接重置：首次 Electron 运行包尚未下载完整；保留 `npm.cmd install` 的完整报错进行排查，不需要修改 Nginx。
- 双击 `src/index.html` 出现提示：这是正常保护提示，应通过 `start.cmd`、`npm.cmd start` 或打包后的 EXE 启动。
- 小窗消失但进程仍在：先查看 Windows 通知区域的隐藏托盘图标；或再次运行客户端唤出。
- `×` 并非退出：这是收起到托盘的设计；「⋯ → 退出客户端」或托盘右键「退出待办」才是彻底退出。
- 没看见已导入任务：切换「全部」与「完成」，检查原计划日期。
- 首版不含开机自启、定时提醒、桌面穿透、云同步、自动更新或安装器。置顶是普通桌面窗口的置顶，不保证覆盖 UAC 安全桌面、独占全屏或其他受系统限制的界面。

## 9. 测试与实现依据

v1.4.0 发布前已通过全部 11 项 Node 测试，并生成 Windows x64 目录包。当前环境中的 Electron 原生启动检查异常退出，尚未完成原生交互验收。已进行的源码、数据层和浏览器界面测试，以及本次发布验证的范围，详见 `QA.md`。

数据层及模拟主进程测试不需要 Electron 运行时即可执行：

```powershell
npm.cmd test
```

实现参考官方文档：

- Electron 窗口与置顶：https://www.electronjs.org/docs/latest/api/browser-window/
- 自定义拖动区域：https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions
- 系统托盘：https://www.electronjs.org/docs/latest/api/tray
- 数据目录：https://www.electronjs.org/docs/latest/api/app
- 手工分发目录结构：https://www.electronjs.org/docs/latest/tutorial/application-distribution
- 安全隔离：https://www.electronjs.org/docs/latest/tutorial/security
- Electron 44.7.0：https://releases.electronjs.org/release/v44.7.0
- Node.js 官方下载：https://nodejs.org/en/download

主进程仅提供受信页面所需的任务与窗口 IPC；渲染进程关闭 Node 集成，开启 contextIsolation、sandbox、webSecurity；通过本地私有协议的白名单加载资源，禁止任意新窗口、外部导航与网络请求。用户正文始终按纯文本显示。
