(() => {
  'use strict';
  const api = window.todoDesktop;
  const $ = id => document.getElementById(id);
  let items = [], revision = -1, ready = false, view = 'today', ui = { compact: true, pinned: true, canHide: true };
  let composing = false, editingId = null, editOriginal = null, editVersion = null, saving = false;
  let toastTimer, resolveConfirm, lastDay, lastNotice = '';
  const expandedIds = new Set();
  const labels = { today: '今日待办', all: '全部待办', urgent: '紧急事项', done: '已完成' };
  function localDate(date = new Date()) { return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-'); }
  function make(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function notify(message, error = false) {
    clearTimeout(toastTimer);
    $('toast').textContent = message;
    $('toast').className = 'toast' + (error ? ' error' : '');
    $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, error ? 6500 : 2500);
  }
  function failure(error) {
    const message = error.message || String(error);
    notify(message, true);
    if ($('editDialog').open) { $('editError').textContent = message; $('editError').hidden = false; }
    if ($('pasteDialog').open) { $('pasteError').textContent = message; $('pasteError').hidden = false; }
  }
  function editChanged() {
    return editOriginal && ['title', 'body', 'due', 'priority'].some(key => ({ title: $('editTitle').value, body: $('editBody').value, due: $('editDue').value, priority: $('editPriority').value })[key] !== editOriginal[key]);
  }
  function updateDirty() {
    api?.setDirty(Boolean($('taskInput').value || $('bodyInput').value || editChanged())).catch(() => {});
  }
  function applyState(state) {
    if (!state || !Array.isArray(state.items)) throw new Error('读取的数据格式不正确。');
    if (state.revision >= revision) { items = state.items; revision = state.revision; }
    if (state.window) ui = state.window;
    ready = true; $('form').inert = false;
    if (state.notice && state.notice !== lastNotice) {
      lastNotice = state.notice;
      $('storageWarning').textContent = state.notice; $('storageWarning').hidden = false;
    }
    render();
  }
  function count(key) {
    return items.filter(item => key === 'done' ? item.done : !item.done && (key === 'all' || (key === 'today' && item.due === localDate()) || (key === 'urgent' && item.priority === 'urgent'))).length;
  }
  function setComposerExpanded(value) {
    $('form').classList.toggle('expanded', value);
    $('toggleComposer').setAttribute('aria-expanded', String(value));
    $('toggleComposer').textContent = value ? '收起正文与日期 ⌃' : '正文与日期 ⌄';
  }
  function renderNav() {
    for (const [id, order] of [['widgetNav', ['today', 'all', 'urgent', 'done']], ['desktopNav', ['all', 'today', 'urgent', 'done']]]) {
      $(id).replaceChildren();
      for (const key of order) {
        const text = id === 'widgetNav' ? { today: '今天', all: '全部', urgent: '紧急', done: '完成' }[key] : labels[key];
        const button = make('button', 'nav' + (view === key ? ' active' : ''), text);
        button.type = 'button';
        button.setAttribute('aria-label', `${text}，${count(key)} 项`);
        if (view === key) button.setAttribute('aria-current', 'page');
        if (id === 'widgetNav') button.append(make('span', 'nav-count', String(count(key))));
        button.addEventListener('click', () => {
          view = key;
          if (!$('taskInput').value && !$('bodyInput').value) $('priority').value = key === 'urgent' ? 'urgent' : 'normal';
          render();
        });
        $(id).append(button);
      }
    }
  }
  function syncBodyToggles() {
    for (const card of $('tasks').querySelectorAll('.task')) {
      const body = card.querySelector('.body-text');
      const toggle = card.querySelector('.body-toggle');
      if (body && toggle) toggle.hidden = !expandedIds.has(card.dataset.taskId) && body.scrollHeight <= body.clientHeight + 1;
    }
  }
  function renderTask(item, index) {
    const row = make('article', 'task' + (item.done ? ' done' : ''));
    row.dataset.taskId = item.id;
    row.setAttribute('aria-labelledby', `task-title-${index}`);
    const check = make('input'); check.type = 'checkbox'; check.checked = item.done;
    check.setAttribute('aria-label', (item.done ? '标记为未完成：' : '标记为已完成：') + item.title);
    check.addEventListener('change', async () => {
      check.disabled = true;
      try {
        const done = check.checked;
        applyState(await api.toggle(item.id, done));
        notify(done ? '已完成，做得很好。' : '已恢复为待办');
      } catch (error) { check.checked = item.done; check.disabled = false; failure(error); }
    });
    const content = make('div', 'content');
    const name = make('div', 'name', item.title); name.id = `task-title-${index}`;
    content.append(name);
    if (item.body.trim()) {
      const expanded = expandedIds.has(item.id);
      const body = make('div', 'body-text' + (expanded ? '' : ' collapsed'), item.body);
      body.id = `task-body-${index}`;
      const toggle = make('button', 'body-toggle', expanded ? '收起正文 ↑' : '展开正文 ↓');
      toggle.type = 'button'; toggle.hidden = !expanded;
      toggle.setAttribute('aria-controls', body.id); toggle.setAttribute('aria-expanded', String(expanded));
      toggle.addEventListener('click', () => {
        const value = !expandedIds.has(item.id);
        if (value) expandedIds.add(item.id); else expandedIds.delete(item.id);
        body.classList.toggle('collapsed', !value);
        toggle.textContent = value ? '收起正文 ↑' : '展开正文 ↓';
        toggle.setAttribute('aria-expanded', String(value)); syncBodyToggles();
      });
      content.append(body, toggle);
    }
    row.append(check, content);
    const actions = make('div', 'actions');
    const edit = make('button', '', '编辑'); edit.type = 'button'; edit.addEventListener('click', () => openEditor(item.id));
    const remove = make('button', '', '删除'); remove.type = 'button';
    remove.addEventListener('click', async () => {
      if (!await confirmAction(`确定删除“${item.title}”？\n标题和正文将一起删除。`, '删除待办')) return;
      try { applyState(await api.remove(item.id)); expandedIds.delete(item.id); notify('已删除待办'); }
      catch (error) { failure(error); }
    });
    actions.append(edit, remove);
    if (ui.compact) {
      const foot = make('div', 'widget-task-footer');
      foot.append(make('span', 'meta', item.due === localDate() ? '今天' : item.due || '未设日期'));
      if (item.priority === 'urgent') foot.append(make('span', 'pill', '紧急'));
      foot.append(actions); content.append(foot);
    } else {
      content.append(make('div', 'meta', item.due ? `计划日期 · ${item.due}` : '未设置日期'));
      if (item.priority === 'urgent') row.append(make('span', 'pill', '紧急'));
      row.append(actions);
    }
    return row;
  }
  function render() {
    document.body.classList.toggle('widget-mode', ui.compact);
    $('widgetNav').hidden = !ui.compact;
    $('toggleComposer').hidden = !ui.compact;
    document.querySelector('.quick-submit').hidden = !ui.compact;
    $('taskInput').placeholder = ui.compact ? '记一件需要完成的事…' : '这件事叫什么？';
    $('pinButton').textContent = ui.pinned ? '已置顶' : '置顶';
    $('pinButton').classList.toggle('active', ui.pinned);
    $('pinButton').setAttribute('aria-pressed', String(ui.pinned));
    $('pinButton').title = ui.pinned ? '取消置顶' : '保持置顶';
    $('pinButton').setAttribute('aria-label', $('pinButton').title);
    $('modeButton').textContent = ui.compact ? '↗' : '↙';
    $('modeButton').title = ui.compact ? '切换为完整界面' : '切换为紧凑小窗';
    $('modeButton').setAttribute('aria-label', $('modeButton').title);
    $('hideButton').title = ui.canHide ? '收起到托盘，不退出' : '退出客户端';
    $('hideButton').setAttribute('aria-label', ui.canHide ? '收起到托盘' : '退出客户端');
    $('versionLabel').textContent = 'Todo Desktop · V' + (ui.version || '1.4.0');
    $('dateLabel').textContent = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
    lastDay = localDate();
    $('heading').textContent = labels[view];
    $('total').textContent = count('all'); $('today').textContent = count('today'); $('urgent').textContent = count('urgent');
    $('listTitle').textContent = ui.compact ? { today: '今天要做的事', all: '全部待办', urgent: '优先处理', done: '已完成' }[view] : (view === 'done' ? '已完成的事项' : '任务清单');
    renderNav();
    const visible = items.filter(item => view === 'done' ? item.done : !item.done && (view === 'all' || (view === 'today' && item.due === localDate()) || (view === 'urgent' && item.priority === 'urgent')))
      .sort((a, b) => Number(b.priority === 'urgent') - Number(a.priority === 'urgent') || a.created - b.created);
    const scrollTop = $('tasks').scrollTop;
    const fragment = document.createDocumentFragment();
    if (!visible.length) fragment.append(make('div', 'empty', view === 'today' ? '今天的清单是空的。\n记一件事，或切换「全部」查看。' : '这里暂时没有事项。'));
    else visible.forEach((item, index) => fragment.append(renderTask(item, index)));
    $('tasks').replaceChildren(fragment);
    $('tasks').scrollTop = scrollTop;
    if (ui.compact) $('listTitle').append(make('span', 'list-count', visible.length + ' 项'));
    requestAnimationFrame(syncBodyToggles);
  }
  function confirmAction(message, heading) {
    if (resolveConfirm) return Promise.resolve(false);
    $('confirmHeading').textContent = heading || '请确认';
    $('confirmMessage').textContent = message;
    $('confirmDialog').returnValue = '';
    $('confirmDialog').showModal(); $('confirmNo').focus();
    return new Promise(resolve => { resolveConfirm = resolve; });
  }
  $('confirmNo').addEventListener('click', () => $('confirmDialog').close('no'));
  $('confirmYes').addEventListener('click', () => $('confirmDialog').close('yes'));
  $('confirmDialog').addEventListener('close', () => {
    if (resolveConfirm) { const resolve = resolveConfirm; resolveConfirm = null; resolve($('confirmDialog').returnValue === 'yes'); }
  });
  function openEditor(id) {
    const item = items.find(task => task.id === id); if (!item) return;
    editingId = id; editVersion = item.version;
    editOriginal = { title: item.title, body: item.body, due: item.due, priority: item.priority };
    $('editTitle').value = item.title; $('editTitle').maxLength = Math.max(250, item.title.length);
    $('editBody').value = item.body; $('editDue').value = item.due; $('editPriority').value = item.priority;
    $('editTitle').setCustomValidity(''); $('editError').hidden = true;
    $('editDialog').showModal(); $('editTitle').focus();
    $('editTitle').setSelectionRange(item.title.length, item.title.length);
  }
  async function closeEditor() {
    if (saving) return;
    if (!editChanged() || await confirmAction('修改尚未保存，确定放弃本次修改？', '放弃修改')) $('editDialog').close();
  }
  $('closeEdit').addEventListener('click', closeEditor);
  $('cancelEdit').addEventListener('click', closeEditor);
  $('editDialog').addEventListener('cancel', event => { event.preventDefault(); void closeEditor(); });
  $('editDialog').addEventListener('close', () => { editingId = null; editOriginal = null; editVersion = null; updateDirty(); });
  function titleValue(input) {
    const value = input.value.trim();
    input.setCustomValidity(value ? '' : '请填写待办标题，不能只输入空格。');
    if (!value) input.reportValidity();
    return value;
  }
  function busy(value) {
    saving = value;
    for (const button of document.querySelectorAll('#form button[type=submit], #editForm button[type=submit]')) button.disabled = value;
  }
  $('form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!ready || saving || composing) return;
    const title = titleValue($('taskInput')); if (!title) return;
    const payload = { title, body: $('bodyInput').value, due: $('due').value, priority: $('priority').value };
    busy(true);
    try {
      const state = await api.add(payload);
      if (view === 'done' || (view === 'today' && payload.due !== localDate()) || (view === 'urgent' && payload.priority !== 'urgent')) view = 'all';
      $('taskInput').value = ''; $('bodyInput').value = '';
      if (ui.compact) setComposerExpanded(false);
      applyState(state); updateDirty(); $('taskInput').focus(); notify('已添加待办');
    } catch (error) { failure(error); }
    finally { busy(false); }
  });
  $('editForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!ready || saving || composing || !editingId) return;
    const title = titleValue($('editTitle')); if (!title) return;
    busy(true);
    try {
      const state = await api.update(editingId, { title, body: $('editBody').value, due: $('editDue').value, priority: $('editPriority').value }, editVersion);
      $('editDialog').close(); applyState(state); updateDirty(); notify('已保存修改');
    } catch (error) { failure(error); }
    finally { busy(false); }
  });
  for (const [formId, titleId, bodyId] of [['form', 'taskInput', 'bodyInput'], ['editForm', 'editTitle', 'editBody']]) {
    $(titleId).addEventListener('input', () => $(titleId).setCustomValidity(''));
    $(formId).addEventListener('input', updateDirty);
    $(formId).addEventListener('change', updateDirty);
    $(formId).addEventListener('compositionstart', () => { composing = true; });
    $(formId).addEventListener('compositionend', () => { setTimeout(() => { composing = false; }, 0); });
    $(formId).addEventListener('keydown', event => {
      if (event.isComposing || composing || event.keyCode === 229) return;
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); $(formId).requestSubmit(); }
      else if (event.key === 'Enter' && event.target === $(titleId)) {
        event.preventDefault();
        if (ui.compact && formId === 'form') $(formId).requestSubmit(); else $(bodyId).focus();
      }
    });
  }
  $('toggleComposer').addEventListener('click', () => setComposerExpanded(!$('form').classList.contains('expanded')));
  function connect(id, callback) {
    $(id).addEventListener('click', async () => { try { await callback(); } catch (error) { failure(error); } });
  }
  connect('pinButton', async () => applyState(await api.pin()));
  connect('modeButton', async () => applyState(await api.mode()));
  connect('minimizeButton', () => api.minimize());
  connect('hideButton', () => api.hide());
  for (const id of ['moreButton', 'footerMore']) connect(id, () => { if (!$('settingsDialog').open) $('settingsDialog').showModal(); });
  connect('closeSettings', () => $('settingsDialog').close());
  connect('quitButton', () => { $('settingsDialog').close(); return api.quit(); });
  connect('folderButton', () => api.openFolder());
  connect('exportButton', async () => {
    const result = await api.exportFile();
    if (!result.canceled) { $('settingsDialog').close(); notify('备份已导出'); }
  });
  connect('importFileButton', async () => {
    const result = await api.importFile();
    if (!result.canceled) {
      view = 'all'; applyState(result.state); $('settingsDialog').close();
      notify(`已导入 ${result.added} 条，跳过 ${result.skipped} 条重复记录。`);
    }
  });
  connect('pasteButton', () => { $('settingsDialog').close(); $('pasteError').hidden = true; $('pasteDialog').showModal(); $('pasteInput').focus(); });
  for (const id of ['closePaste', 'cancelPaste']) connect(id, () => $('pasteDialog').close());
  connect('confirmPaste', async () => {
    if (!$('pasteInput').value.trim()) throw new Error('请先粘贴 JSON 待办数据。');
    $('confirmPaste').disabled = true; $('pasteError').hidden = true;
    try {
      const result = await api.importText($('pasteInput').value);
      if (!result.canceled) {
        view = 'all'; applyState(result.state); $('pasteDialog').close(); $('pasteInput').value = '';
        notify(`已导入 ${result.added} 条，跳过 ${result.skipped} 条重复记录。`);
      }
    } finally { $('confirmPaste').disabled = false; }
  });
  $('due').value = localDate();
  window.addEventListener('resize', () => requestAnimationFrame(syncBodyToggles));
  function checkDay() {
    if (lastDay && localDate() !== lastDay) {
      if (!$('taskInput').value && !$('bodyInput').value && $('due').value === lastDay) $('due').value = localDate();
      render();
    }
  }
  setInterval(checkDay, 60000);
  window.addEventListener('focus', checkDay);
  if (!api) {
    $('storageWarning').textContent = '请通过 Electron 客户端启动。这个页面不能通过浏览器双击 HTML 使用。';
    $('storageWarning').hidden = false;
    return;
  }
  api.onState(state => { try { applyState(state); } catch (error) { failure(error); } });
  api.onNotice(message => notify(message));
  api.get().then(applyState).catch(error => {
    $('storageWarning').textContent = `读取本地待办失败：${error.message}。已暂停添加，请保留数据文件后排查。`;
    $('storageWarning').hidden = false;
  });
})();
