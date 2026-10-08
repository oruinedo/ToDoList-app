'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_ITEMS = 20000;
const MAX_BODY = 100000;

function atomicWrite(file, data, backup = true) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const text = JSON.stringify(data, null, 2) + '\n';
  if (Buffer.byteLength(text) > MAX_BYTES) throw new Error('数据超过 20 MB，本次未保存。请先导出备份。');
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(fd, text, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = undefined;
    if (backup && fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
    fs.renameSync(temporary, file);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function readJSON(file) {
  if (fs.statSync(file).size > MAX_BYTES) throw new Error('文件超过 20 MB。');
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}
function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function validDate(value) {
  if (value === '') return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function fields(value, maxTitle = 250) {
  if (!record(value)) throw new Error('任务格式不正确。');
  const title = (typeof value.title === 'string' ? value.title : typeof value.text === 'string' ? value.text : '').trim();
  if (!title || title.length > maxTitle) throw new Error(`标题不能为空，且最多 ${maxTitle} 个字符。`);
  const body = value.body ?? '';
  if (typeof body !== 'string' || body.length > MAX_BODY) throw new Error('正文需为文字，且最多 100000 个字符。');
  const due = value.due ?? '';
  if (typeof due !== 'string' || !validDate(due)) throw new Error('计划日期不正确。请使用年-月-日或留空。');
  const priority = value.priority ?? 'normal';
  if (!['normal', 'urgent'].includes(priority)) throw new Error('事项类型不正确。');
  return { title, text: title, body, due, priority };
}
function normalizeList(payload) {
  if (record(payload) && payload.schema !== undefined && payload.schema !== 1) throw new Error('不支持这个数据版本，请勿覆盖原文件。');
  const list = Array.isArray(payload) ? payload : payload?.items ?? payload?.tasks;
  if (!Array.isArray(list) || list.length > MAX_ITEMS) throw new Error('需要待办数组或包含 items 数组的 JSON，最多 20000 条。');
  const ids = new Set();
  return list.map((item, i) => {
    if (!record(item)) throw new Error(`第 ${i + 1} 条任务格式不正确。`);
    let id = typeof item.id === 'string' || typeof item.id === 'number' ? String(item.id) : randomUUID();
    if (!id || id.length > 200 || ids.has(id)) id = randomUUID();
    ids.add(id);
    if (item.done !== undefined && ![true, false, 0, 1].includes(item.done)) throw new Error(`第 ${i + 1} 条的完成状态不正确。`);
    return {
      id, ...fields(item, 10000), done: Boolean(item.done),
      created: Number.isFinite(item.created) && item.created >= 0 ? item.created : 0,
      updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : 0,
      version: Number.isSafeInteger(item.version) && item.version >= 0 ? item.version : 0
    };
  });
}
function stateFrom(payload) {
  return {
    schema: 1,
    revision: Number.isSafeInteger(payload?.revision) && payload.revision >= 0 ? payload.revision : 0,
    modifiedAt: typeof payload?.modifiedAt === 'string' ? payload.modifiedAt : '',
    items: normalizeList(payload)
  };
}
class TaskStore {
  constructor(directory) {
    this.directory = directory;
    this.file = path.join(directory, 'tasks.json');
    this.notice = '';
    fs.mkdirSync(directory, { recursive: true });
    if (!fs.existsSync(this.file) && !fs.existsSync(`${this.file}.bak`)) {
      this.state = { schema: 1, revision: 0, modifiedAt: '', items: [] };
      atomicWrite(this.file, this.state, false);
      return;
    }
    try {
      this.state = stateFrom(readJSON(this.file));
    } catch (primaryError) {
      try {
        const recovered = stateFrom(readJSON(`${this.file}.bak`));
        if (fs.existsSync(this.file)) fs.copyFileSync(this.file, `${this.file}.corrupt-${Date.now()}`);
        atomicWrite(this.file, recovered, false);
        this.state = recovered;
        this.notice = '原数据文件无法读取，已从上一份自动备份恢复；异常原文件已保留。请核对最近一次修改。';
      } catch (backupError) {
        throw new Error(`无法读取待办文件，已停止写入，未清空原数据。\n${this.file}\n${primaryError.message}`);
      }
    }
  }
  snapshot() { return structuredClone(this.state); }
  commit(items) {
    if (items.length > MAX_ITEMS) throw new Error('待办总数超过 20000 条，本次未保存。');
    const next = { schema: 1, revision: this.state.revision + 1, modifiedAt: new Date().toISOString(), items };
    atomicWrite(this.file, next);
    this.state = next;
    return this.snapshot();
  }
  add(payload) {
    const now = Date.now();
    return this.commit([{ id: randomUUID(), ...fields(payload), done: false, created: now, updatedAt: now, version: 1 }, ...this.state.items]);
  }
  update(id, payload, expectedVersion) {
    const current = this.state.items.find(item => item.id === id);
    if (!current) throw new Error('这条待办已被删除，请重新打开清单。');
    if (expectedVersion !== current.version) throw new Error('这条待办已发生变化，本次未覆盖。请复制保留输入，取消后重新编辑。');
    const nextFields = fields(payload, Math.max(250, current.title.length));
    return this.commit(this.state.items.map(item => item.id === id ? { ...item, ...nextFields, updatedAt: Date.now(), version: item.version + 1 } : item));
  }
  toggle(id, done) {
    if (typeof done !== 'boolean') throw new Error('完成状态不正确。');
    if (!this.state.items.some(item => item.id === id)) throw new Error('这条待办已经不存在。');
    return this.commit(this.state.items.map(item => item.id === id ? { ...item, done, updatedAt: Date.now(), version: item.version + 1 } : item));
  }
  remove(id) {
    if (!this.state.items.some(item => item.id === id)) throw new Error('这条待办已经不存在。');
    return this.commit(this.state.items.filter(item => item.id !== id));
  }
  importItems(payload) {
    const incoming = normalizeList(payload); // Validate the entire file before changing any records.
    const signature = item => JSON.stringify([item.title, item.body, item.due, item.priority, item.done, item.created]);
    const known = new Set(this.state.items.map(signature));
    const ids = new Set(this.state.items.map(item => item.id));
    const additions = [];
    let skipped = 0;
    for (const item of incoming) {
      const sig = signature(item);
      if (known.has(sig)) { skipped++; continue; }
      const next = { ...item, id: ids.has(item.id) ? randomUUID() : item.id };
      ids.add(next.id); known.add(sig); additions.push(next);
    }
    if (this.state.items.length + additions.length > MAX_ITEMS) throw new Error('合并后超过 20000 条，本次没有导入。');
    if (additions.length) {
      const backupDir = path.join(this.directory, 'backups');
      atomicWrite(path.join(backupDir, `before-import-${Date.now()}-${randomUUID().slice(0, 8)}.json`), this.state, false);
      this.commit([...additions, ...this.state.items]);
    }
    return { added: additions.length, skipped, state: this.snapshot() };
  }
}
module.exports = { TaskStore, atomicWrite, readJSON, normalizeList, validDate, MAX_BYTES };
