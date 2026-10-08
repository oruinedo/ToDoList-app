'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Arch, Platform, build } = require('electron-builder');

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const destination = path.join(root, 'release', 'portable');

async function main() {
  if (process.platform !== 'win32') {
    throw new Error('请在 Windows 上构建便携 EXE，确保发布文件为原生 Windows 应用。');
  }
  if (!fs.existsSync(require.resolve('electron/package.json', { paths: [root] }))) {
    throw new Error('没有安装锁定版本的 Electron，请先执行 npm.cmd ci --include=dev。');
  }

  const artifacts = await build({
    targets: Platform.WINDOWS.createTarget('portable', Arch.x64),
    config: {
      appId: 'local.todo.desktop',
      productName: pkg.productName,
      directories: { output: destination, buildResources: path.join(root, 'assets') },
      files: ['src/**/*', 'assets/**/*', 'package.json'],
      asar: true,
      win: {
        target: [{ target: 'portable', arch: ['x64'] }],
        icon: path.join(root, 'assets', 'icon.ico')
      },
      portable: {
        requestExecutionLevel: 'user',
        artifactName: 'TodoDesktop-${version}-win32-${arch}.${ext}'
      },
      publish: 'never'
    }
  });

  const executable = path.join(destination, `TodoDesktop-${pkg.version}-win32-x64.exe`);
  if (!fs.existsSync(executable)) {
    const produced = Array.isArray(artifacts) ? artifacts.join('\n') : String(artifacts ?? '(none)');
    throw new Error(`Portable build finished without the expected EXE. Build output:\n${produced}`);
  }
  const file = fs.readFileSync(executable);
  const peOffset = file.readUInt32LE(0x3c);
  const peSignature = file.toString('ascii', peOffset, peOffset + 4);
  const machine = file.readUInt16LE(peOffset + 4);
  if (peSignature !== 'PE\u0000\u0000' || machine !== 0x8664) {
    throw new Error('Output is not a valid Windows x64 executable.');
  }
  console.log(`\n便携 EXE 已生成：\n${executable}\n\n双击该单个文件即可运行；无需安装、额外运行文件或 Node.js。`);
  console.log('这是未签名的 Windows 程序，操作系统可能显示 SmartScreen 提示。');
}

main().catch(error => {
  console.error('\n便携打包失败：' + error.message);
  process.exitCode = 1;
});
