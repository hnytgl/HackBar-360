'use strict';
const $ = id => document.getElementById(id);
const state = {history: [], current: null, baseline: null, comparison: null, pending: '', focus: $('url'), draftTimer: null, notes: '', loading: false};
const tabParam = new URLSearchParams(location.search).get('tab');
const inspectedId = chrome.devtools && chrome.devtools.inspectedWindow ? chrome.devtools.inspectedWindow.tabId : (tabParam && Number(tabParam));
function message(action, extra) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(Object.assign({action}, extra), reply => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!reply || !reply.ok) return reject(new Error(reply && reply.error || '后台未响应，请重新加载扩展'));
      resolve(reply.value);
    });
  });
}
function status(text, error) { $('status').textContent = text; document.querySelector('.statusbar').classList.toggle('error', Boolean(error)); }
function handle(fn) { return (...args) => Promise.resolve().then(() => fn(...args)).catch(e => status(e.message, true)); }
function element(tag, text, cls) { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (cls) el.className = cls; return el; }
function button(text, fn) { const b = element('button', text); b.type = 'button'; b.addEventListener('click', handle(fn)); return b; }
function switchTab(name) {
  document.querySelectorAll('.pane').forEach(p => { p.hidden = p.id !== 'pane-' + name; });
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
}
function headerRow(h) {
  const row = element('div', undefined, 'header-row');
  const check = element('input'); check.type = 'checkbox'; check.checked = h.enabled !== false; check.setAttribute('aria-label', '启用此请求头');
  const nameLabel = element('label', 'Name'), valueLabel = element('label', 'Value');
  const name = element('input'), value = element('input');
  name.type = value.type = 'text'; name.value = h.name || ''; value.value = h.value || ''; name.spellcheck = value.spellcheck = false;
  nameLabel.append(name); valueLabel.append(value);
  row.append(check, nameLabel, valueLabel, button('×', () => { row.remove(); saveDraftSoon(); }));
  $('headers').append(row);
}
function readHeaders() {
  return Array.from($('headers').children, row => ({enabled: row.children[0].checked, name: row.children[1].querySelector('input').value, value: row.children[2].querySelector('input').value}));
}
function readRequest() {
  return {url: $('url').value, method: $('method').value, bodyType: $('body-type').value, body: $('body').value, headers: readHeaders(), credentials: $('credentials').checked ? 'include' : 'omit', timeout: Number($('timeout').value) * 1000, contentType: $('content-type').value};
}
function fillRequest(r) {
  $('url').value = r.url || ''; $('method').value = r.method || 'GET'; $('body-type').value = r.bodyType || 'form'; $('body').value = r.body || '';
  $('credentials').checked = r.credentials === 'include'; $('timeout').value = (r.timeout || 30000) / 1000; $('content-type').value = r.contentType || 'text/plain;charset=UTF-8';
  $('headers').replaceChildren(); (r.headers || []).forEach(headerRow);
  if (!$('headers').children.length) headerRow({name: 'Accept', value: '*/*'});
  updateBody();
}
function updateBody() {
  const method = $('method').value;
  $('post').checked = method === 'POST';
  $('body').disabled = method === 'GET' || method === 'HEAD';
  $('body-hint').textContent = $('body').disabled ? 'GET / HEAD 不发送请求体' : '按所选类型原样发送';
  $('raw-type-label').hidden = $('body-type').value !== 'raw';
  $('body').placeholder = $('body-type').value === 'json' ? '{"message": "hello"}' : $('body-type').value === 'form' ? 'key=value&key=another+value' : 'Raw request body';
}
function saveDraftSoon() {
  if (state.loading) return;
  clearTimeout(state.draftTimer);
  state.draftTimer = setTimeout(handle(() => message('draft.save', {draft: readRequest()})), 600);
}
async function refreshHistory() {
  const data = await message('state.get');
  state.history = data.history || []; $('history-count').textContent = state.history.length; renderHistory();
}
async function execute() {
  if (state.pending) return status('已有请求正在运行', true);
  const request = readRequest(); HB.normalize(request);
  const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  state.pending = id; $('execute').disabled = true; $('cancel').disabled = false;
  $('response-meta').textContent = ''; status('正在发送 ' + request.method + ' 请求…');
  try {
    const result = await message('request.run', {id, request});
    state.current = result.entry; state.comparison = null;
    showResponse(); switchTab('response');
    const r = result.entry.response;
    status(result.storageWarning || r.error || '请求完成', Boolean(r.error || result.storageWarning));
    await refreshHistory();
  } finally { state.pending = ''; $('execute').disabled = false; $('cancel').disabled = true; }
}
function viewedResponse() {
  if (!state.current) return '发送请求后在这里查看响应。响应中的 HTML / JavaScript 仅作为文本显示。';
  const r = $('mask-view').checked ? HB.redact(state.current.response) : state.current.response;
  if ($('response-view').value === 'headers') return (r.headers || []).map(h => h.name + ': ' + h.value).join('\n') || '没有可见响应头';
  if (r.error) return r.error;
  if ($('response-view').value === 'pretty') { try { return JSON.stringify(JSON.parse(r.body), null, 2); } catch (_) { /* text */ } }
  return r.body || (state.current.request.method === 'HEAD' ? '(HEAD 响应无正文)' : '(空响应正文)');
}
function showResponse() {
  $('response-output').textContent = viewedResponse();
  if (!state.current) return;
  const r = state.current.response;
  $('response-meta').textContent = (r.status ? r.status + ' ' + (r.statusText || '') : 'NETWORK ERROR') + ' · ' + r.duration + ' ms · ' + (r.bytes || 0).toLocaleString() + ' B';
  $('response-warning').textContent = r.truncated ? '正文达到 2 MiB，已截断' : r.historyTruncated ? '此历史正文已截断' : '';
}
function renderHistory() {
  const q = $('history-search').value.trim().toLowerCase(); $('history-list').replaceChildren();
  const rows = state.history.filter(e => (e.request.method + ' ' + e.request.url + ' ' + e.response.status).toLowerCase().includes(q));
  if (!rows.length) $('history-list').append(element('p', '暂无匹配的历史记录。', 'hint'));
  rows.forEach(entry => {
    const row = element('div', undefined, 'history-row'), info = element('div'), actions = element('div', undefined, 'history-actions');
    info.append(element('strong', entry.request.method + ' ' + entry.request.url), element('small', new Date(entry.time).toLocaleString() + ' · ' + (entry.response.error || entry.response.status) + ' · ' + entry.response.duration + ' ms · 已脱敏'));
    actions.append(button('回填', () => { if (state.pending) throw new Error('请先等待请求结束'); fillRequest(entry.request); saveDraftSoon(); status('已回填；发送前请替换脱敏占位符'); }), button('查看', () => { state.current = entry; state.comparison = null; showResponse(); switchTab('response'); }), button('基线 A', () => setBaseline(entry)), button('删除', async () => { await message('history.delete', {id: entry.id}); await refreshHistory(); }));
    row.append(info, actions); $('history-list').append(row);
  });
}
function responseString(entry) {
  if (!entry) return '';
  const r = HB.redact(entry.response);
  let body = r.body || '';
  try { body = JSON.stringify(JSON.parse(body), null, 2); } catch (_) { /* text */ }
  return body;
}
function setBaseline(entry) {
  if (!entry) throw new Error('还没有响应可设为基线');
  state.baseline = HB.redact(entry); state.comparison = null;
  $('compare-output').replaceChildren(); $('compare-meta').textContent = '基线 A：' + entry.request.method + ' ' + HB.redactURL(entry.request.url) + '\n时间：' + entry.time;
  status('已设置基线 A；选择另一条响应后点击对比');
}
function compareNow() {
  if (!state.baseline || !state.current) throw new Error('需要基线 A 和当前响应 B');
  const a = state.baseline.response, b = HB.redact(state.current.response);
  const summary = '状态：' + (a.error || a.status) + ' → ' + (b.error || b.status) + '\n耗时：' + a.duration + ' → ' + b.duration + ' ms\n正文长度：' + (a.body || '').length + ' → ' + (b.body || '').length + ' 字符';
  const bodyDiff = HB.compare(responseString(state.baseline), responseString(state.current));
  const sortHeaders = r => (r.headers || []).map(h => h.name.toLowerCase() + ': ' + h.value).sort().join('\n');
  const headersDiff = HB.compare(sortHeaders(a), sortHeaders(b));
  state.comparison = {baselineId: state.baseline.id, currentId: state.current.id, summary, bodyDiff, headersDiff, partial: Boolean(a.truncated || b.truncated || a.historyTruncated || b.historyTruncated)};
  $('compare-meta').textContent = summary + (state.comparison.partial ? '\n注意：正文已截断，只比较已保留部分。' : '');
  $('compare-output').replaceChildren();
  [['响应头', headersDiff], ['正文', bodyDiff]].forEach(([title, diff]) => {
    $('compare-output').append(element('h2', title + (diff.rows.length ? ' · ' + diff.rows.length + ' 处行差异' : ' · 相同')));
    diff.rows.forEach(d => { const row = element('div', undefined, 'diff-row'); row.append(element('small', '行 ' + d.line), element('pre', '− ' + (d.before === null ? '(无此行)' : d.before), 'before'), element('pre', '＋ ' + (d.after === null ? '(无此行)' : d.after), 'after')); $('compare-output').append(row); });
    if (diff.limited) $('compare-output').append(element('p', '差异展示达到上限；最多检查前 2000 行，展示 200 处差异。', 'hint'));
  });
  switchTab('compare');
}
async function loadURL() {
  if (!inspectedId) throw new Error('此窗口没有关联的被检查页面；请在页面 F12 → HackBar 中使用 LOAD');
  const tab = await message('tab.get', {tabId: inspectedId}); $('url').value = tab.url || ''; saveDraftSoon(); status('已读取当前页面 URL；TEST 菜单可读取 Network 请求');
}
function openDialog(id) { const d = $(id); if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }
function closeDialog(id) { const d = $(id); if (d.close) d.close(); else d.removeAttribute('open'); }
function captureNetwork() {
  if (!chrome.devtools || !chrome.devtools.network) throw new Error('读取 Network 需要在 F12 的 HackBar 面板中操作');
  chrome.devtools.network.getHAR(handle(har => {
    $('network-list').replaceChildren();
    const entries = (har.entries || []).filter(e => /^https?:\/\//.test(e.request.url)).slice(-100).reverse();
    if (!entries.length) $('network-list').append(element('p', '暂无请求。请保持 DevTools 打开并刷新目标页面。'));
    entries.forEach(e => $('network-list').append(button(e.request.method + ' ' + HB.redactURL(e.request.url), () => {
      if (state.pending) throw new Error('请先等待请求结束');
      const r = e.request, p = r.postData || {}, mime = p.mimeType || '';
      const body = p.text !== undefined ? p.text : (p.params || []).map(v => encodeURIComponent(v.name) + '=' + encodeURIComponent(v.value || '')).join('&');
      fillRequest({url: r.url, method: r.method, bodyType: /json/i.test(mime) ? 'json' : /x-www-form-urlencoded/.test(mime) ? 'form' : 'raw', contentType: mime || 'text/plain;charset=UTF-8', body, headers: (r.headers || []).filter(h => !h.name.startsWith(':')).map(h => ({name: h.name, value: h.value, enabled: !HB.forbidden.test(h.name)}))});
      saveDraftSoon(); closeDialog('network-dialog'); status('已读取请求；浏览器控制的头未启用。上传文件和 multipart 边界不能自动重建。');
    })));
    openDialog('network-dialog');
  }));
}
async function applyTool(action, literal) {
  const target = state.focus && document.contains(state.focus) ? state.focus : $('url');
  if (target.disabled) throw new Error('当前输入框不可编辑，请选择要处理的文字');
  const before = target.value;
  let start = target.selectionStart || 0, end = target.selectionEnd || 0;
  if (literal === undefined && start === end) { start = 0; end = before.length; }
  const result = literal === undefined ? await HBTools.transform(action, before.slice(start, end)) : literal;
  if (target.value !== before) throw new Error('文字已变化，请重新执行工具');
  target.value = before.slice(0, start) + result + before.slice(end); target.focus(); target.setSelectionRange(start, start + result.length);
  saveDraftSoon(); if (target.id === 'notes') $('notes-status').textContent = '有未保存修改'; status('已应用文本工具');
}
async function saveNotes() {
  const result = await message('notes.save', {notes: $('notes').value}); state.notes = result.notes; $('notes').value = result.notes; $('notes-status').textContent = '已保存（脱敏）'; return result;
}
async function exportReport(format) {
  await saveNotes();
  await refreshHistory();
  const data = {tool: 'HackBar-360 2.5.0', exportedAt: new Date().toISOString(), redaction: '自动脱敏，分享前需人工复核', current: state.current, history: state.history, notes: state.notes, comparison: state.comparison};
  const content = HB.report(data, format);
  const blob = new Blob([content], {type: format === 'html' ? 'text/html;charset=utf-8' : format === 'json' ? 'application/json;charset=utf-8' : 'text/markdown;charset=utf-8'});
  const href = URL.createObjectURL(blob), a = element('a'); a.href = href; a.download = 'HackBar-report-' + new Date().toISOString().replace(/[:.]/g, '-') + '.' + format; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(href), 30000); status('报告已导出（自动脱敏），请在分享前复核');
}
async function copyResponse() {
  const text = viewedResponse();
  try { await navigator.clipboard.writeText(text); status('已复制当前视图'); }
  catch (_) { $('copy-text').value = text; openDialog('copy-dialog'); $('copy-text').focus(); $('copy-text').select(); }
}
document.addEventListener('focusin', e => { if ((e.target.tagName === 'TEXTAREA' || e.target.matches('input[type=text]')) && e.target.id !== 'history-search') state.focus = e.target; });
document.addEventListener('input', e => { if (e.target.closest('.request-editor')) saveDraftSoon(); if (e.target.id === 'notes') $('notes-status').textContent = '有未保存修改'; });
document.addEventListener('change', e => { if (e.target.closest('.request-editor')) saveDraftSoon(); });
document.addEventListener('click', e => {
  if (!e.target.closest('details')) document.querySelectorAll('details[open]').forEach(d => { d.open = false; });
  if (e.target.closest('.dropdown button')) document.querySelectorAll('details[open]').forEach(d => { d.open = false; });
});
document.querySelectorAll('details').forEach(detail => detail.addEventListener('toggle', () => { if (detail.open) document.querySelectorAll('details').forEach(d => { if (d !== detail) d.open = false; }); }));
$('load').addEventListener('click', handle(loadURL)); $('execute').addEventListener('click', handle(execute));
$('cancel').addEventListener('click', handle(() => message('request.cancel', {id: state.pending})));
$('split').addEventListener('click', handle(() => { const t = state.focus || $('url'); t.value = t.value.replace(/\r?\n(?=[?&])/g, '').replace(/([?&])/g, '\n$1'); saveDraftSoon(); }));
$('method').addEventListener('change', updateBody); $('body-type').addEventListener('change', updateBody);
$('post').addEventListener('change', () => { $('method').value = $('post').checked ? 'POST' : 'GET'; updateBody(); saveDraftSoon(); });
$('add-header').addEventListener('click', () => { headerRow({}); saveDraftSoon(); });
$('response-view').addEventListener('change', showResponse); $('mask-view').addEventListener('change', showResponse);
$('baseline').addEventListener('click', handle(() => setBaseline(state.current))); $('compare-now').addEventListener('click', handle(compareNow));
$('clear-baseline').addEventListener('click', () => { state.baseline = state.comparison = null; $('compare-output').replaceChildren(); $('compare-meta').textContent = '先从响应或历史中设置基线 A。'; });
$('copy-response').addEventListener('click', handle(copyResponse)); $('refresh-history').addEventListener('click', handle(refreshHistory));
$('history-search').addEventListener('input', renderHistory);
$('clear-history').addEventListener('click', handle(async () => { if (confirm('清空本地全部请求历史？此操作不可恢复。')) { await message('history.clear'); await refreshHistory(); status('历史已清空'); } }));
$('save-notes').addEventListener('click', handle(saveNotes));
$('clear').addEventListener('click', () => { fillRequest({}); saveDraftSoon(); status('已清空编辑区'); });
$('capture').addEventListener('click', handle(captureNetwork)); $('close-network').addEventListener('click', () => closeDialog('network-dialog')); $('close-copy').addEventListener('click', () => closeDialog('copy-dialog'));
$('open-help').addEventListener('click', () => chrome.tabs.create({url: chrome.runtime.getURL('help/help.html')}));
$('open-tab').addEventListener('click', () => chrome.tabs.create({url: chrome.runtime.getURL('theme/hackbar-panel.html') + (inspectedId ? '?tab=' + inspectedId : '')}));
document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
document.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', handle(() => applyTool(b.dataset.tool))));
document.querySelectorAll('[data-insert]').forEach(b => b.addEventListener('click', handle(() => applyTool('', b.dataset.insert))));
document.querySelectorAll('[data-export]').forEach(b => b.addEventListener('click', handle(() => exportReport(b.dataset.export))));
document.querySelectorAll('[data-theme]').forEach(b => b.addEventListener('click', handle(async () => { document.body.classList.toggle('dark', b.dataset.theme === 'dark'); await message('settings.save', {settings: {theme: b.dataset.theme}}); })));
document.querySelectorAll('[data-test]').forEach(b => b.addEventListener('click', () => {
  const type = b.dataset.test;
  if (type === 'headers') {
    const headers = readHeaders();
    const accept = headers.find(h => h.name.toLowerCase() === 'accept');
    if (accept) { accept.value = 'application/json'; accept.enabled = true; } else headers.push({name: 'Accept', value: 'application/json'});
    if (!headers.some(h => h.name.toLowerCase() === 'authorization')) headers.push({name: 'Authorization', value: '', enabled: false});
    $('headers').replaceChildren(); headers.forEach(headerRow);
  }
  else { $('method').value = 'POST'; $('body-type').value = type; $('body').value = type === 'json' ? '{\n  "message": "hello"\n}' : 'message=hello&tag=one&tag=two'; updateBody(); }
  saveDraftSoon(); status('已填入示例，编辑目标后发送');
}));
document.addEventListener('keydown', handle(e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); return execute(); } if (e.key === 'Escape') document.querySelectorAll('details[open]').forEach(d => { d.open = false; }); }));
handle(async () => {
  state.loading = true;
  try {
    const data = await message('state.get');
    fillRequest(data.draft || {}); state.history = data.history || []; state.notes = data.notes || ''; $('notes').value = state.notes;
    document.body.classList.toggle('dark', Boolean(data.settings && data.settings.theme === 'dark'));
    $('history-count').textContent = state.history.length; renderHistory();
    $('context').textContent = inspectedId ? '已关联页面 · Tab ' + inspectedId : '独立调试窗口';
    if (!$('url').value && inspectedId) await loadURL();
    status(data.draft ? '已恢复脱敏草稿；发送前请检查占位符' : '就绪');
  } finally { state.loading = false; }
})();
