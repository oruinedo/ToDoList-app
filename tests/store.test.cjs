'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { TaskStore, validDate, normalizeList } = require('../src/store.cjs');
function setup(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-desktop-test-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return { dir, store: new TaskStore(dir) }; }
const input = { title: '联系客户', body: '确认需求\n补充材料与时间安排', due: '2026-10-08', priority: 'normal' };
test('new installs start empty; title, multiline body and status persist across restarts', t => {
  const { dir, store } = setup(t);
  assert.deepEqual(store.snapshot().items, []);
  const item = store.add(input).items[0];
  assert.equal(item.text, input.title);
  store.toggle(item.id, true);
  const again = new TaskStore(dir).snapshot();
  assert.equal(again.items[0].done, true); assert.equal(again.items[0].body, input.body);
});
test('edits update all fields, reject stale versions and retain prior state on validation failure', t => {
  const { store } = setup(t); const item = store.add(input).items[0];
  store.update(item.id, { ...input, title: '确认日程', priority: 'urgent', due: '' }, item.version);
  const before = store.snapshot();
  assert.equal(before.items[0].title, '确认日程');
  assert.throws(() => store.update(item.id, input, item.version), /已发生变化/);
  assert.throws(() => store.add({ ...input, title: '  ' }), /不能为空/);
  assert.throws(() => store.toggle(item.id, 'yes'), /不正确/);
  assert.deepEqual(store.snapshot(), before);
});
test('delete, restore completion, unknown IDs and invalid dates', t => {
  const { store } = setup(t); const item = store.add(input).items[0];
  store.toggle(item.id, true); store.toggle(item.id, false);
  assert.equal(store.snapshot().items[0].done, false);
  store.remove(item.id); assert.equal(store.snapshot().items.length, 0);
  assert.throws(() => store.remove(item.id), /不存在/);
  assert.equal(validDate('2024-02-29'), true); assert.equal(validDate('2026-02-29'), false);
  assert.equal(validDate('2026-13-02'), false); assert.equal(validDate(''), true);
  assert.throws(() => store.add({ ...input, due: '2026-02-30' }), /日期不正确/);
});
test('legacy text migration, merge, duplicate import and conflicting IDs are non-destructive', t => {
  const { dir, store } = setup(t); const original = store.add(input).items[0];
  const legacy = [{ id: 1, text: '旧任务', body: '旧正文\n第二行', due: '', done: true, created: 42 }];
  let result = store.importItems(legacy);
  assert.equal(result.added, 1); assert.equal(result.state.items.length, 2);
  assert.equal(result.state.items[0].title, '旧任务'); assert.equal(result.state.items[0].done, true);
  result = store.importItems(legacy); assert.equal(result.added, 0); assert.equal(result.skipped, 1);
  result = store.importItems([{ ...original, body: '另一个版本' }]);
  assert.equal(result.added, 1); assert.notEqual(result.state.items[0].id, original.id);
  assert.equal(result.state.items.find(x => x.id === original.id).body, input.body);
  result = store.importItems([{ ...original, body: '另一个版本' }]); assert.equal(result.skipped, 1);
  assert.equal(fs.readdirSync(path.join(dir, 'backups')).length, 2);
});
test('bad imports fail as a whole without partial writes', t => {
  const { store } = setup(t); store.add(input);
  const before = fs.readFileSync(store.file, 'utf8');
  assert.throws(() => store.importItems([input, { body: '无标题' }]), /标题/);
  assert.equal(fs.readFileSync(store.file, 'utf8'), before);
  assert.throws(() => store.importItems({ schema: 99, items: [] }), /不支持/);
  assert.throws(() => normalizeList({ unrelated: [] }), /需要待办数组/);
});
test('corrupted main file recovers the previous save, preserving corrupt bytes', t => {
  const { dir, store } = setup(t);
  const item = store.add(input).items[0]; store.toggle(item.id, true);
  fs.writeFileSync(store.file, '{broken');
  const recovered = new TaskStore(dir);
  assert.equal(recovered.state.items[0].done, false); assert.match(recovered.notice, /备份/);
  const preserved = fs.readdirSync(dir).find(x => x.includes('.corrupt-'));
  assert.equal(fs.readFileSync(path.join(dir, preserved), 'utf8'), '{broken');
});
test('missing primary file recovers backup rather than silently starting empty', t => {
  const { dir, store } = setup(t); store.add(input); store.add({ ...input, title: '第二件事' });
  fs.unlinkSync(store.file);
  assert.equal(new TaskStore(dir).state.items.length, 1);
});
test('unrecoverable data never gets overwritten with an empty list', t => {
  const { dir, store } = setup(t);
  fs.writeFileSync(store.file, '{broken'); fs.writeFileSync(store.file + '.bak', '{also broken');
  assert.throws(() => new TaskStore(dir), /未清空原数据/);
  assert.equal(fs.readFileSync(store.file, 'utf8'), '{broken');
});
test('write failure leaves current state and file intact and cleans temporary files', t => {
  const { dir, store } = setup(t); store.add(input);
  const before = store.snapshot(); const bytes = fs.readFileSync(store.file, 'utf8');
  const rename = fs.renameSync;
  try { fs.renameSync = () => { throw new Error('simulated disk error'); }; assert.throws(() => store.add(input), /disk error/); }
  finally { fs.renameSync = rename; }
  assert.deepEqual(store.snapshot(), before); assert.equal(fs.readFileSync(store.file, 'utf8'), bytes);
  assert.equal(fs.readdirSync(dir).filter(x => x.endsWith('.tmp')).length, 0);
});
test('snapshot mutations cannot mutate saved state, and task text remains plain data', t => {
  const { store } = setup(t);
  const item = store.add({ ...input, title: '<img src=x onerror=alert(1)>', body: '<script>evil()</script>' }).items[0];
  const snapshot = store.snapshot(); snapshot.items[0].title = 'changed';
  assert.equal(store.snapshot().items[0].title, item.title);
});
