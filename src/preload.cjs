'use strict';
const { contextBridge, ipcRenderer } = require('electron');
async function invoke(channel, ...args) {
  const result = await ipcRenderer.invoke(channel, ...args);
  if (!result?.ok) throw new Error(result?.error || '操作失败。');
  return result.value;
}
function subscribe(channel, callback) {
  if (typeof callback !== 'function') throw new TypeError('Expected a callback.');
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}
// Expose specific capabilities only; never expose arbitrary IPC or filesystem calls.
contextBridge.exposeInMainWorld('todoDesktop', Object.freeze({
  get: () => invoke('todo:get'),
  add: payload => invoke('todo:add', payload),
  update: (id, payload, version) => invoke('todo:update', id, payload, version),
  toggle: (id, done) => invoke('todo:toggle', id, done),
  remove: id => invoke('todo:remove', id),
  pin: () => invoke('todo:pin'), mode: () => invoke('todo:mode'),
  minimize: () => invoke('todo:minimize'), hide: () => invoke('todo:hide'), quit: () => invoke('todo:quit'),
  importFile: () => invoke('todo:import-file'), importText: text => invoke('todo:import-text', text),
  exportFile: () => invoke('todo:export'), openFolder: () => invoke('todo:folder'),
  setDirty: value => invoke('todo:dirty', value),
  onState: callback => subscribe('todo:state', callback),
  onNotice: callback => subscribe('todo:notice', callback)
}));
