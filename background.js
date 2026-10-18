/* Requests run in the extension origin. No page injection or global header rewriting. */
'use strict';
if (typeof HB === 'undefined' && typeof importScripts === 'function') importScripts('theme/js/core.js');
const active = new Map();
let storageQueue = Promise.resolve();
const storageGet = () => new Promise((resolve, reject) => chrome.storage.local.get(['history', 'notes', 'settings', 'draft'], data => chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(data)));
const storageSet = data => new Promise((resolve, reject) => chrome.storage.local.set(data, () => chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve()));
function mutate(fn) {
  const work = storageQueue.then(async () => {
    const data = await storageGet();
    const update = fn(data);
    await storageSet(update);
    return update;
  });
  storageQueue = work.catch(() => {});
  return work;
}
async function readBody(response, limit) {
  if (!response.body || !response.body.getReader) {
    const body = await response.text();
    return {body: body.slice(0, limit), bytes: HB.bytes(body), truncated: body.length > limit};
  }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let body = '', size = 0, truncated = false;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    const remaining = limit - size;
    if (part.value.byteLength > remaining) {
      body += decoder.decode(part.value.slice(0, remaining), {stream: true});
      size += remaining;
      truncated = true;
      await reader.cancel();
      break;
    }
    size += part.value.byteLength;
    body += decoder.decode(part.value, {stream: true});
  }
  body += decoder.decode();
  return {body, bytes: size, truncated};
}
async function runRequest(input, key) {
  const request = HB.normalize(input);
  const controller = new AbortController();
  if (active.has(key)) throw new Error('重复请求编号');
  active.set(key, controller);
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, request.timeout);
  const started = Date.now();
  let response;
  try {
    const result = await fetch(request.url, {method: request.method, headers: request.headers.map(h => [h.name, h.value]), body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body, credentials: request.credentials, signal: controller.signal, cache: 'no-store', redirect: 'error'});
    const content = await readBody(result, 2 * 1024 * 1024);
    response = Object.assign(content, {status: result.status, statusText: result.statusText, url: result.url, headers: Array.from(result.headers, h => ({name: h[0], value: h[1]})), duration: Date.now() - started});
  } catch (error) {
    response = {status: 0, body: '', headers: [], duration: Date.now() - started, error: controller.signal.aborted ? (timedOut ? '请求超时' : '请求已取消') : '网络请求失败：' + error.message + '。请检查网络、证书、站点权限或重定向（本工具不自动跟随）。'};
  } finally {
    clearTimeout(timer);
    active.delete(key);
  }
  const entry = {id: key.split(':').pop(), time: new Date(started).toISOString(), request, response};
  let storageWarning = '';
  try {
    await mutate(data => {
      const history = [HB.clipEntry(entry), ...(data.history || [])].slice(0, 50);
      while (HB.bytes(JSON.stringify(history)) > 3 * 1024 * 1024 && history.length > 1) history.pop();
      return {history};
    });
  } catch (error) { storageWarning = '历史保存失败：' + error.message; }
  return {entry, storageWarning};
}
async function dispatch(message, sender) {
  const prefix = sender.url + ':';
  switch (message.action) {
    case 'request.run': return runRequest(message.request, prefix + message.id);
    case 'request.cancel': {
      const controller = active.get(prefix + message.id);
      if (controller) controller.abort();
      return {cancelled: Boolean(controller)};
    }
    case 'state.get': await storageQueue; return storageGet();
    case 'history.clear': return mutate(() => ({history: []}));
    case 'history.delete': return mutate(d => ({history: (d.history || []).filter(e => e.id !== message.id)}));
    case 'notes.save': return mutate(() => ({notes: HB.redactText(String(message.notes || '').slice(0, 100000))}));
    case 'draft.save': return mutate(() => ({draft: HB.redact(message.draft)}));
    case 'settings.save': return mutate(() => ({settings: {theme: message.settings.theme === 'dark' ? 'dark' : 'light'}}));
    case 'tab.get': return new Promise((resolve, reject) => chrome.tabs.get(message.tabId, tab => chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve({url: tab.url})));
    default: throw new Error('未知操作');
  }
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  // Reject page/content-script callers. Only this extension's panel can send requests.
  if (!sender || sender.id !== chrome.runtime.id || !sender.url || sender.url.split('?')[0] !== chrome.runtime.getURL('theme/hackbar-panel.html')) return false;
  dispatch(message, sender).then(value => reply({ok: true, value}), error => reply({ok: false, error: error.message}));
  return true;
});
