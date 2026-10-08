'use strict';
// Native calls are stubbed here. This verifies wiring and IPC boundaries, not the OS window manager.
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

test('main process: first launch, local assets, protected IPC, window controls, tray and persistence', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-native-stub-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const app = new EventEmitter();
  const paths = { appData: dir, documents: dir };
  Object.assign(app, { setName() {}, getPath: name => paths[name], setPath: (name, value) => { assert.equal(fs.existsSync(value), true); paths[name] = value; }, setAppUserModelId() {}, requestSingleInstanceLock: () => true, whenReady: () => Promise.resolve(), getVersion: () => '1.4.0', quit: () => { app.emit('before-quit'); app.didQuit = true; }, exit: () => { throw new Error('Unexpected exit'); } });
  const windows = [], trays = [], handlers = new Map();
  class FakeWindow extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.bounds = { x: options.x, y: options.y, width: options.width, height: options.height };
      this.webContents = new EventEmitter(); this.webContents.mainFrame = { url: '' };
      Object.assign(this.webContents, { setWindowOpenHandler: callback => { this.openHandler = callback; }, send() {} });
      windows.push(this);
    }
    isDestroyed() { return false; } isMinimized() { return false; } isMaximized() { return false; }
    getBounds() { return this.bounds; } setBounds(value) { this.bounds = value; }
    setMinimumSize(w, h) { this.minimum = [w, h]; } setAlwaysOnTop(value) { this.pinned = value; }
    show() { this.visible = true; } hide() { this.visible = false; } focus() {} minimize() { this.minimized = true; }
    unmaximize() {} restore() {}
    close() { this.emit('close', { preventDefault: () => { this.preventedClose = true; } }); }
    loadURL(url) { this.webContents.mainFrame.url = url; return Promise.resolve(); }
  }
  class FakeTray extends EventEmitter {
    constructor() { super(); trays.push(this); } isDestroyed() { return false; }
    setToolTip(value) { this.tooltip = value; } setContextMenu(value) { this.menu = value; } destroy() {}
  }
  const screen = new EventEmitter();
  const display = { workArea: { x: 0, y: 0, width: 1440, height: 900 } };
  Object.assign(screen, { getDisplayMatching: () => display, getPrimaryDisplay: () => display });
  let assetHandler;
  const electron = {
    app, BrowserWindow: FakeWindow, Tray: FakeTray,
    Menu: { setApplicationMenu() {}, buildFromTemplate: value => value },
    nativeImage: { createFromPath: () => ({ resize: () => ({}) }) },
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    dialog: { showErrorBox: (title, msg) => { throw new Error(title + ': ' + msg); }, showMessageBox: async () => ({ response: 0 }), showOpenDialog: async () => ({ canceled: true }), showSaveDialog: async () => ({ canceled: true }) },
    shell: { openPath: async () => '' }, screen,
    protocol: { registerSchemesAsPrivileged() {}, handle: (_name, handler) => { assetHandler = handler; } },
    session: { defaultSession: { setPermissionRequestHandler() {}, setPermissionCheckHandler() {}, webRequest: { onBeforeRequest() {} } } }
  };
  const sourceDir = path.resolve(__dirname, '..', 'src');
  vm.runInNewContext(fs.readFileSync(path.join(sourceDir, 'main.cjs'), 'utf8'), {
    require: name => name === 'electron' ? electron : name === './store.cjs' ? require('../src/store.cjs') : require(name),
    __dirname: sourceDir, console, process: { platform: 'win32' }, Response, URL, setTimeout, clearTimeout
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(windows.length, 1); const win = windows[0];
  assert.equal(win.options.alwaysOnTop, true); assert.equal(win.options.frame, false);
  assert.equal(win.options.webPreferences.sandbox, true); assert.equal(win.options.webPreferences.nodeIntegration, false);
  assert.equal(win.options.webPreferences.contextIsolation, true);
  win.emit('ready-to-show'); assert.equal(win.visible, true);
  assert.equal(win.openHandler({ url: 'https://example.com' }).action, 'deny');
  const sender = { sender: win.webContents, senderFrame: win.webContents.mainFrame };
  const call = (name, ...args) => handlers.get(name)(sender, ...args);
  const blocked = await handlers.get('todo:get')({ sender: {}, senderFrame: {} });
  assert.equal(blocked.ok, false);
  const initial = await call('todo:get'); assert.equal(initial.value.items.length, 0);
  const added = await call('todo:add', { title: '原生 IPC 测试', body: '正文' });
  assert.equal(added.ok, true); assert.equal(added.value.items.length, 1);
  assert.equal(trays[0].tooltip.includes('1 项未完成'), true);
  const togglePin = await call('todo:pin'); assert.equal(togglePin.value.window.pinned, false); assert.equal(win.pinned, false);
  const mode = await call('todo:mode'); assert.equal(mode.value.window.compact, false); assert.equal(win.bounds.width, 1050);
  await call('todo:hide'); assert.equal(win.visible, false); assert.equal(win.preventedClose, true); assert.equal(app.didQuit, undefined);
  trays[0].emit('click'); assert.equal(win.visible, true);
  app.emit('second-instance'); assert.equal(windows.length, 1);
  const index = await assetHandler({ url: 'todoapp://ui/index.html', method: 'GET' });
  assert.equal(index.status, 200); assert.match(await index.text(), /Content-Security-Policy/);
  const forbidden = await assetHandler({ url: 'todoapp://ui/../main.cjs', method: 'GET' }); assert.equal(forbidden.status, 404);
  const external = await assetHandler({ url: 'todoapp://elsewhere/index.html', method: 'GET' }); assert.equal(external.status, 404);
  await call('todo:quit'); assert.equal(app.didQuit, true);
  const saved = JSON.parse(fs.readFileSync(path.join(paths.userData, 'data', 'tasks.json')));
  assert.equal(saved.items[0].title, '原生 IPC 测试');
});
