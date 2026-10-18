/* Shared validation, report sanitization and bounded comparison. No network or DOM. */
(function (root) {
  'use strict';
  const MASK = '[REDACTED]';
  const secretKey = /(?:pass(?:word|wd)?|pwd|secret|token|authorization|cookie|api[-_]?key|session(?:id)?|credential|private[-_]?key|access[-_]?key)/i;
  const forbidden = /^(?:accept-charset|accept-encoding|access-control-request-.*|connection|content-length|cookie2?|date|dnt|expect|host|keep-alive|origin|permissions-policy|referer|te|trailer|transfer-encoding|upgrade|user-agent|via|proxy-.*|sec-.*)$/i;
  const bytes = value => new TextEncoder().encode(value).length;
  function normalize(input) {
    if (!input || typeof input !== 'object') throw new Error('请求无效');
    const text = String(input.url || '').replace(/[\r\n]/g, '').trim();
    if (!text) throw new Error('请输入 URL');
    let url;
    try { url = new URL(/^https?:\/\//i.test(text) ? text : 'http://' + text); }
    catch (_) { throw new Error('URL 格式无效'); }
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error('仅支持 HTTP(S)，请将认证信息放入请求头');
    url.hash = '';
    const method = String(input.method || 'GET').toUpperCase();
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(method)) throw new Error('不支持的 HTTP 方法');
    const bodyType = ['json', 'form', 'raw'].includes(input.bodyType) ? input.bodyType : 'raw';
    const body = ['GET', 'HEAD'].includes(method) ? '' : String(input.body || '');
    if (bytes(body) > 1024 * 1024) throw new Error('请求体超过 1 MiB');
    if (bodyType === 'json' && body) {
      try { JSON.parse(body); } catch (_) { throw new Error('JSON 请求体格式错误'); }
    }
    const headers = [];
    const seen = new Set();
    for (const h of input.headers || []) {
      if (h.enabled === false) continue;
      const name = String(h.name || '').trim();
      const value = String(h.value || '');
      if (!name && !value) continue;
      if (!/^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(name) || /[\r\n\0]/.test(value)) throw new Error('请求头名称或值无效');
      if (forbidden.test(name)) throw new Error(name + ' 由浏览器控制；请取消勾选。Cookie 请使用“携带浏览器凭据”。');
      if (seen.has(name.toLowerCase())) throw new Error('重复请求头：' + name);
      seen.add(name.toLowerCase());
      headers.push({name, value, enabled: true});
    }
    if (body && !seen.has('content-type')) {
      headers.push({name: 'Content-Type', value: bodyType === 'json' ? 'application/json' : bodyType === 'form' ? 'application/x-www-form-urlencoded' : String(input.contentType || 'text/plain;charset=UTF-8'), enabled: true});
    }
    if (headers.length > 100 || bytes(JSON.stringify(headers)) > 65536) throw new Error('请求头过多或过大');
    if ([url.href, body, ...headers.map(h => h.value)].some(v => v.includes(MASK))) throw new Error('包含脱敏占位符，请先替换为实际值');
    return {url: url.href, method, bodyType, body, headers, credentials: input.credentials === 'include' ? 'include' : 'omit', timeout: Math.min(120000, Math.max(100, Number(input.timeout) || 30000))};
  }
  function redactText(value) {
    return String(value)
      .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/_=.-]+/gi, '$1 ' + MASK)
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, MASK)
      .replace(/(\b[\w.-]{0,64}(?:password|passwd|pwd|secret|token|authorization|cookie|api[-_]?key|sessionid|credential|private[-_]?key|access[-_]?key)[\w.-]{0,64}["']?\s*[:=]\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s&,;<>]+)/gi, '$1"' + MASK + '"')
      .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, MASK)
      .replace(/\b[A-Z0-9._%+-]{1,64}@[A-Z0-9.-]{1,253}\.[A-Z]{2,63}\b/gi, MASK)
      .replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g, MASK);
  }
  function redactURL(value) {
    try {
      const u = new URL(value);
      if (!/^https?:$/.test(u.protocol)) return redactText(value);
      if (u.username) u.username = MASK;
      if (u.password) u.password = MASK;
      for (const key of Array.from(u.searchParams.keys())) {
        const all = u.searchParams.getAll(key);
        u.searchParams.delete(key);
        all.forEach(v => u.searchParams.append(key, secretKey.test(key) ? MASK : redactText(v)));
      }
      u.hash = '';
      u.pathname = redactText(u.pathname);
      return decodeMask(u.href);
    } catch (_) { return redactText(value); }
  }
  function decodeMask(s) { return s.replace(/%5BREDACTED%5D/gi, MASK); }
  function redact(value, key, depth) {
    if ((depth || 0) > 30) return '[DEPTH LIMIT]';
    if (key && secretKey.test(key) && value !== null) {
      if (!(key === 'credentials' && ['omit', 'include'].includes(value))) return MASK;
    }
    if (Array.isArray(value)) return value.map(v => redact(v, '', (depth || 0) + 1));
    if (value && typeof value === 'object') {
      if (typeof value.name === 'string' && 'value' in value && secretKey.test(value.name)) return Object.assign({}, value, {value: MASK});
      const result = {};
      Object.keys(value).forEach(k => {
        // Define properties safely, including JSON keys such as __proto__.
        Object.defineProperty(result, k, {value: redact(value[k], k, (depth || 0) + 1), enumerable: true, writable: true});
      });
      return result;
    }
    if (typeof value !== 'string') return value;
    if (/url$/i.test(key || '')) return redactURL(value);
    if (/^\s*[\[{]/.test(value)) {
      try { return JSON.stringify(redact(JSON.parse(value), '', (depth || 0) + 1), null, 2); } catch (_) { /* free text */ }
    }
    if (value.includes('=') && !/[\r\n{}<>]/.test(value)) {
      const pairs = value.split('&');
      const decodedName = p => { try { return decodeURIComponent(p.split('=')[0].replace(/\+/g, ' ')); } catch (_) { return p.split('=')[0]; } };
      if (pairs.some(p => secretKey.test(decodedName(p)))) {
        return pairs.map(p => {
          const i = p.indexOf('=');
          if (i < 0) return redactText(p);
          let name = p.slice(0, i), decoded = name;
          try { decoded = decodeURIComponent(name.replace(/\+/g, ' ')); } catch (_) { /* malformed form */ }
          return name + '=' + (secretKey.test(decoded) ? MASK : redactText(p.slice(i + 1)));
        }).join('&');
      }
    }
    return redactText(value);
  }
  function clipEntry(entry) {
    const e = redact(entry);
    for (const key of ['request', 'response']) {
      if (e[key] && typeof e[key].body === 'string' && e[key].body.length > 12000) {
        e[key].body = e[key].body.slice(0, 12000) + '\n[历史正文已截断]';
        e[key].historyTruncated = true;
      }
    }
    return e;
  }
  function compare(a, b) {
    const left = String(a || '').split('\n'), right = String(b || '').split('\n');
    const rows = [];
    const max = Math.max(left.length, right.length);
    for (let i = 0; i < Math.min(max, 2000); i++) {
      if (left[i] !== right[i]) rows.push({line: i + 1, before: left[i] === undefined ? null : left[i], after: right[i] === undefined ? null : right[i]});
      if (rows.length === 200) break;
    }
    return {rows, limited: max > 2000 || rows.length === 200};
  }
  const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  function report(data, format) {
    const clean = redact(data);
    const json = JSON.stringify(clean, null, 2);
    if (format === 'json') return json;
    if (format === 'html') return '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>HackBar 测试报告</title><style>body{max-width:1100px;margin:40px auto;font:15px system-ui;padding:20px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f5f7;padding:24px}</style><h1>HackBar 测试报告</h1><p>已执行自动脱敏；分享前请人工复核。时间：' + escapeHTML(clean.exportedAt) + '</p><pre>' + escapeHTML(json) + '</pre></html>';
    // Prefix every line as an indented code block: response text cannot close it.
    return '# HackBar 测试报告\n\n已执行自动脱敏；分享前请人工复核。\n\n' + json.split('\n').map(l => '    ' + l).join('\n') + '\n';
  }
  root.HB = {MASK, forbidden, normalize, redact, redactURL, redactText, clipEntry, compare, report, bytes};
  if (typeof module !== 'undefined' && module.exports) module.exports = root.HB;
})(typeof globalThis !== 'undefined' ? globalThis : this);
