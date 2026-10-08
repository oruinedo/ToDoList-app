'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '..');
function main() {
  if (process.platform !== 'win32') throw new Error('请在 Windows 的 PowerShell / CMD 中打包，不要在 WSL 或 Linux 中运行此脚本。');
  const pkg = require(path.join(root, 'package.json'));
  const electronPkg = require.resolve('electron/package.json', { paths: [root] });
  const runtime = path.join(path.dirname(electronPkg), 'dist');
  if (!fs.existsSync(path.join(runtime, 'electron.exe'))) throw new Error('Electron 运行包未下载完整。请先重新执行 npm.cmd install，解决下载报错后再打包。');
  const exe = fs.readFileSync(path.join(runtime, 'electron.exe'));
  const peOffset = exe.readUInt32LE(0x3c);
  const machine = exe.readUInt16LE(peOffset + 4);
  const arch = { 0x8664: 'x64', 0xaa64: 'arm64', 0x14c: 'ia32' }[machine];
  if (!arch || exe.toString('ascii', peOffset, peOffset + 4) !== 'PE\u0000\u0000') throw new Error('下载的运行文件不是有效的 Windows Electron 程序。');
  const release = path.join(root, 'release');
  fs.mkdirSync(release, { recursive: true });
  const baseName = `TodoDesktop-win32-${arch}`;
  let target = path.join(release, baseName);
  if (fs.existsSync(target)) target += '-' + Date.now(); // Never overwrite an earlier build.
  const staging = path.join(release, '.building-' + randomUUID());
  try {
    fs.cpSync(runtime, staging, { recursive: true });
    const appDirectory = path.join(staging, 'resources', 'app');
    fs.mkdirSync(appDirectory, { recursive: true });
    for (const name of ['src', 'assets']) fs.cpSync(path.join(root, name), path.join(appDirectory, name), { recursive: true });
    const appPkg = { name: pkg.name, productName: pkg.productName, version: pkg.version, private: true, main: pkg.main };
    fs.writeFileSync(path.join(appDirectory, 'package.json'), JSON.stringify(appPkg, null, 2) + '\n');
    const defaultApp = path.join(staging, 'resources', 'default_app.asar');
    if (fs.existsSync(defaultApp)) fs.unlinkSync(defaultApp);
    fs.renameSync(path.join(staging, 'electron.exe'), path.join(staging, 'TodoDesktop.exe'));
    fs.copyFileSync(path.join(root, 'scripts', 'create-desktop-shortcut.cmd'), path.join(staging, 'create-desktop-shortcut.cmd'));
    fs.copyFileSync(path.join(root, 'README.md'), path.join(staging, 'README.md'));
    fs.writeFileSync(path.join(staging, 'START-HERE.txt'), 'Todo Desktop ' + pkg.version + '\r\n\r\nDouble-click TodoDesktop.exe to open the desktop window.\r\nKeep this entire folder together. Do not copy only the EXE.\r\nRun create-desktop-shortcut.cmd to create a desktop shortcut.\r\nData: %APPDATA%\\TodoDesktop\\data\\tasks.json\r\nClosing the window hides it to the system tray; use the tray menu to quit.\r\nThis personal build is not code-signed. Verify your files; do not disable security software.\r\n');
    fs.renameSync(staging, target);
    console.log('\n打包完成：\n' + path.join(target, 'TodoDesktop.exe'));
    console.log('\n双击 EXE 即可打开小窗，无需 Docker、浏览器或另外安装 Node.js。');
    console.log('请保留整个输出目录，不要只复制 EXE。数据位于固定的用户目录，不在程序目录中。');
    console.log('当前为个人使用的未签名目录包，不是安装程序。');
  } catch (error) {
    console.error('未完成的临时构建目录（可检查后删除）：', staging);
    throw error;
  }
}
try { main(); } catch (error) { console.error('\n打包失败：' + error.message); process.exitCode = 1; }
