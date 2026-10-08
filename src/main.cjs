'use strict';
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog, shell, screen, protocol, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { TaskStore, atomicWrite, readJSON, normalizeList, MAX_BYTES } = require('./store.cjs');

// Stable path across source runs, packaged builds and future upgrades.
app.setName('TodoDesktop');
const USER_DATA = path.join(app.getPath('appData'), 'TodoDesktop');
try {
  fs.mkdirSync(USER_DATA, { recursive: true });
  app.setPath('userData', USER_DATA);
} catch (error) {
  dialog.showErrorBox('无法创建待办数据目录', `${USER_DATA}\n${error.message}`);
  app.exit(1);
}
if (process.platform === 'win32') app.setAppUserModelId('local.todo.desktop');
protocol.registerSchemesAsPrivileged([{ scheme: 'todoapp', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
const APP_URL = 'todoapp://ui/index.html';
const DATA_DIR = path.join(app.getPath('userData'), 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const ICON_FILE = path.join(__dirname, '..', 'assets', 'icon.png');
let win, tray, store;
let settings = { pinned: true, compactBounds: null, fullBounds: null };
let compact = true, quitting = false, dirty = false, quitPending = false, importPending = false;
let boundsTimer;

function readSettings() {
  try {
    const saved = readJSON(SETTINGS_FILE);
    settings.pinned = typeof saved.pinned === 'boolean' ? saved.pinned : true;
    for (const key of ['compactBounds', 'fullBounds']) {
      const b = saved[key];
      if (b && ['x', 'y', 'width', 'height'].every(k => Number.isFinite(b[k]))) settings[key] = b;
    }
  } catch (error) {
    if (fs.existsSync(SETTINGS_FILE)) console.warn('Window settings could not be loaded; task data is unaffected.', error.message);
  }
}
function saveSettings() {
  try { atomicWrite(SETTINGS_FILE, settings); }
  catch (error) { console.warn('Window settings could not be saved:', error.message); }
}
function bounded(desired, small = true) {
  const area = desired ? screen.getDisplayMatching(desired).workArea : screen.getPrimaryDisplay().workArea;
  const width = Math.round(Math.min(Math.max(desired?.width || (small ? 440 : 1050), small ? 360 : 780), area.width));
  const height = Math.round(Math.min(Math.max(desired?.height || (small ? 660 : 790), 430), area.height));
  const x = Math.round(Math.max(area.x, Math.min(desired?.x ?? area.x + area.width - width - 24, area.x + area.width - width)));
  const y = Math.round(Math.max(area.y, Math.min(desired?.y ?? area.y + area.height - height - 24, area.y + area.height - height)));
  return { x, y, width, height };
}
function rememberBounds() {
  if (!win || win.isDestroyed() || win.isMinimized() || win.isMaximized()) return;
  settings[compact ? 'compactBounds' : 'fullBounds'] = win.getBounds();
  saveSettings();
}
function viewState() {
  return { ...store.snapshot(), window: { compact, pinned: settings.pinned, canHide: Boolean(tray), version: app.getVersion() }, notice: store.notice };
}
function emitState() {
  if (win && !win.isDestroyed()) win.webContents.send('todo:state', viewState());
  refreshTray();
}
function showWindow() {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
}
function setPinned(value) {
  settings.pinned = Boolean(value);
  win.setAlwaysOnTop(settings.pinned);
  saveSettings(); emitState();
}
function setMode(small) {
  rememberBounds();
  compact = Boolean(small);
  if (win.isMaximized()) win.unmaximize();
  win.setMinimumSize(compact ? 360 : 780, 430);
  win.setBounds(bounded(settings[compact ? 'compactBounds' : 'fullBounds'], compact));
  emitState(); showWindow();
}
async function requestQuit() {
  if (quitPending || quitting) return;
  quitPending = true;
  try {
    if (dirty && win && !win.isDestroyed()) {
      showWindow();
      const { response } = await dialog.showMessageBox(win, {
        type: 'question', title: '退出待办', message: '有尚未添加或保存的输入，确定退出？',
        detail: '已保存的待办不会丢失。未保存的输入将在退出后丢弃。', buttons: ['继续编辑', '退出'], defaultId: 0, cancelId: 0
      });
      if (response !== 1) return;
    }
    quitting = true; rememberBounds(); app.quit();
  } finally { quitPending = false; }
}
async function reportError(title, error) {
  console.error(title, error);
  if (win && !win.isDestroyed()) {
    showWindow();
    await dialog.showMessageBox(win, { type: 'error', title, message: error.message || String(error) });
  } else dialog.showErrorBox(title, error.message || String(error));
}
async function importPayload(payload) {
  const incoming = normalizeList(payload);
  if (!incoming.length) return { added: 0, skipped: 0, state: viewState() };
  showWindow();
  const { response } = await dialog.showMessageBox(win, {
    type: 'question', title: '合并导入待办', message: `文件包含 ${incoming.length} 条待办，是否合并导入？`,
    detail: '不会清空或覆盖现有任务。内容一致的重复记录会跳过；同一编号但内容不同的记录会另存一条。导入前会自动备份。',
    buttons: ['取消', '合并导入'], defaultId: 1, cancelId: 0
  });
  if (response !== 1) return { canceled: true };
  const result = store.importItems(incoming);
  emitState();
  return { added: result.added, skipped: result.skipped, state: viewState() };
}
async function importFile() {
  if (importPending) return { canceled: true };
  importPending = true;
  try {
    showWindow();
    const result = await dialog.showOpenDialog(win, { title: '选择待办 JSON 备份', properties: ['openFile'], filters: [{ name: 'JSON 待办数据', extensions: ['json'] }] });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    return await importPayload(readJSON(result.filePaths[0]));
  } finally { importPending = false; }
}
async function importText(text) {
  if (importPending) return { canceled: true };
  importPending = true;
  try {
    if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_BYTES) throw new Error('粘贴内容必须为 JSON 文字，且不得超过 20 MB。');
    let parsed;
    try { parsed = JSON.parse(text.replace(/^\uFEFF/, '')); } catch (_) { throw new Error('JSON 格式不正确，本次没有导入或修改任务。'); }
    return await importPayload(parsed);
  } finally { importPending = false; }
}
async function exportFile() {
  showWindow();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const result = await dialog.showSaveDialog(win, {
    title: '导出待办备份', defaultPath: path.join(app.getPath('documents'), `todo-backup-${stamp}.json`),
    filters: [{ name: 'JSON 待办数据', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  if (path.resolve(result.filePath) === path.resolve(store.file) || path.resolve(result.filePath) === path.resolve(SETTINGS_FILE)) throw new Error('请选择数据目录以外的位置保存导出文件。');
  atomicWrite(result.filePath, { ...store.snapshot(), exportedAt: new Date().toISOString(), app: 'TodoDesktop' }, false);
  return { saved: true };
}
async function openFolder() {
  const error = await shell.openPath(DATA_DIR);
  if (error) throw new Error(error);
  return true;
}
function refreshTray() {
  if (!tray || tray.isDestroyed()) return;
  const count = store.state.items.filter(item => !item.done).length;
  tray.setToolTip(`待办小窗 · ${count} 项未完成`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示待办小窗', click: showWindow },
    { label: '保持置顶', type: 'checkbox', checked: settings.pinned, click: item => setPinned(item.checked) },
    { label: compact ? '切换为完整界面' : '切换为紧凑小窗', click: () => setMode(!compact) },
    { type: 'separator' },
    { label: '导入 JSON 备份…', click: () => importFile().then(result => { if (!result.canceled) win.webContents.send('todo:notice', `已导入 ${result.added} 条，跳过 ${result.skipped} 条重复记录。`); }).catch(error => reportError('导入失败', error)) },
    { label: '导出 JSON 备份…', click: () => exportFile().catch(error => reportError('导出失败', error)) },
    { label: '打开数据文件夹', click: () => openFolder().catch(error => reportError('无法打开文件夹', error)) },
    { type: 'separator' },
    { label: '退出待办', click: requestQuit }
  ]));
}
function secureIPC() {
  function trusted(event) {
    return win && !win.isDestroyed() && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame && event.senderFrame.url === APP_URL;
  }
  function handle(channel, handler) {
    ipcMain.handle(channel, async (event, ...args) => {
      if (!trusted(event)) return { ok: false, error: '来源验证失败。' };
      try { return { ok: true, value: await handler(...args) }; }
      catch (error) { console.error(channel, error); return { ok: false, error: error.message || '操作失败，本次未保存。' }; }
    });
  }
  handle('todo:get', () => viewState());
  handle('todo:add', payload => { store.add(payload); emitState(); return viewState(); });
  handle('todo:update', (id, payload, version) => { store.update(id, payload, version); emitState(); return viewState(); });
  handle('todo:toggle', (id, done) => { store.toggle(id, done); emitState(); return viewState(); });
  handle('todo:remove', id => { store.remove(id); emitState(); return viewState(); });
  handle('todo:pin', () => { setPinned(!settings.pinned); return viewState(); });
  handle('todo:mode', () => { setMode(!compact); return viewState(); });
  handle('todo:minimize', () => { win.minimize(); return true; });
  handle('todo:hide', () => { win.close(); return true; });
  handle('todo:quit', () => { void requestQuit(); return true; });
  handle('todo:import-file', importFile);
  handle('todo:import-text', importText);
  handle('todo:export', exportFile);
  handle('todo:folder', openFolder);
  handle('todo:dirty', value => { dirty = value === true; return true; });
}
function registerAssets() {
  const allowed = new Map([
    ['/index.html', ['index.html', 'text/html; charset=utf-8']],
    ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
    ['/renderer.js', ['renderer.js', 'text/javascript; charset=utf-8']]
  ]);
  protocol.handle('todoapp', request => {
    const url = new URL(request.url);
    const asset = url.host === 'ui' ? allowed.get(url.pathname) : null;
    if (!asset || request.method !== 'GET') return new Response('Not found', { status: 404 });
    return new Response(fs.readFileSync(path.join(__dirname, asset[0])), { headers: { 'Content-Type': asset[1], 'X-Content-Type-Options': 'nosniff' } });
  });
}
function createWindow() {
  const bounds = bounded(settings.compactBounds, true);
  win = new BrowserWindow({
    ...bounds, minWidth: 360, minHeight: 430, title: '待办小窗 · Todo', frame: false,
    backgroundColor: '#EDEBE7', show: false, resizable: true, maximizable: false,
    alwaysOnTop: settings.pinned, hasShadow: true, autoHideMenuBar: true, icon: ICON_FILE,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false, spellcheck: false }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  win.webContents.on('render-process-gone', (_event, details) => {
    if (!quitting) reportError('界面进程已停止', new Error(`已保存的数据仍在本地。请退出后重新启动客户端。\n原因：${details.reason}`));
  });
  win.once('ready-to-show', showWindow);
  win.on('close', event => {
    if (!quitting && tray) { event.preventDefault(); rememberBounds(); win.hide(); }
    else if (!quitting && dirty) { event.preventDefault(); void requestQuit(); }
  });
  win.on('closed', () => { win = null; if (!tray) app.quit(); });
  for (const eventName of ['resize', 'move']) win.on(eventName, () => { clearTimeout(boundsTimer); boundsTimer = setTimeout(rememberBounds, 350); });
  win.loadURL(APP_URL).catch(error => reportError('无法打开待办界面', error));
  try {
    const image = nativeImage.createFromPath(ICON_FILE).resize({ width: 24, height: 24 });
    tray = new Tray(image);
    tray.on('click', showWindow);
    tray.on('double-click', showWindow);
    refreshTray();
  } catch (error) { console.warn('System tray unavailable; closing the window will exit.', error.message); }
}

const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
else {
  app.on('second-instance', showWindow);
  app.on('activate', showWindow);
  app.on('before-quit', () => { quitting = true; clearTimeout(boundsTimer); rememberBounds(); });
  app.on('will-quit', () => { if (tray && !tray.isDestroyed()) tray.destroy(); });
  app.on('window-all-closed', () => { if (!tray) app.quit(); });
  app.whenReady().then(() => {
    store = new TaskStore(DATA_DIR);
    readSettings();
    Menu.setApplicationMenu(null);
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    // The app has no remote content, telemetry or network API. Deny outgoing web requests.
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, callback) => callback({ cancel: true }));
    registerAssets(); secureIPC(); createWindow();
    screen.on('display-removed', () => { if (win) win.setBounds(bounded(win.getBounds(), compact)); });
  }).catch(error => { dialog.showErrorBox('待办启动失败', error.message); app.quit(); });
}
