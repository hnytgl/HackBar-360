/* Original HackBar text utilities, with UTF-8 encoding and strict decoder errors. */
(function (root) {
  'use strict';
  function binary(text) { return Array.from(new TextEncoder().encode(text), c => String.fromCharCode(c)).join(''); }
  function utf8(binaryText) { return new TextDecoder('utf-8', {fatal: true}).decode(Uint8Array.from(binaryText, c => c.charCodeAt(0))); }
  async function transform(action, text) {
    const codes = Array.from({length: text.length}, (_, i) => text.charCodeAt(i));
    switch (action) {
      case 'urlencode': return encodeURIComponent(text);
      case 'urldecode': return decodeURIComponent(text);
      case 'base64encode': return btoa(binary(text));
      case 'base64decode': return utf8(atob(text.replace(/\s/g, '')));
      case 'hexencode': return Array.from(new TextEncoder().encode(text), c => c.toString(16).padStart(2, '0')).join('');
      case 'hexdecode': {
        const hex = text.replace(/\s|0x/gi, '');
        if (hex.length % 2 || /[^a-f0-9]/i.test(hex)) throw new Error('Hex 需要成对的十六进制字符');
        return new TextDecoder('utf-8', {fatal: true}).decode(Uint8Array.from(hex.match(/../g) || [], c => parseInt(c, 16)));
      }
      case 'rot13': return text.replace(/[a-z]/gi, c => String.fromCharCode(c.charCodeAt(0) + (c.toLowerCase() <= 'm' ? 13 : -13)));
      case 'md5': return root.Encrypt.md5(binary(text));
      case 'sha1': case 'sha256': {
        const digest = await crypto.subtle.digest(action === 'sha1' ? 'SHA-1' : 'SHA-256', new TextEncoder().encode(text));
        return Array.from(new Uint8Array(digest), c => c.toString(16).padStart(2, '0')).join('');
      }
      case 'json': return JSON.stringify(JSON.parse(text), null, 2);
      case 'upper': return text.toUpperCase();
      case 'lower': return text.toLowerCase();
      case 'strip': return text.replace(/\s+/g, '');
      case 'slashes': return text.replace(/[\\'"\0]/g, c => c === '\0' ? '\\0' : '\\' + c);
      case 'unslashes': return text.replace(/\\([\\'"0])/g, (_, c) => c === '0' ? '\0' : c);
      case 'shellquote': return "'" + text.replace(/'/g, "'\\''") + "'";
      case 'psquote': return "'" + text.replace(/'/g, "''") + "'";
      case 'mysql': return 'CHAR(' + codes.join(', ') + ')';
      case 'mssql': return codes.map(c => 'CHAR(' + c + ')').join(' + ');
      case 'oracle': return codes.map(c => 'CHR(' + c + ')').join(' || ');
      case 'sqlinfo': return 'CONCAT_WS(CHAR(32,58,32),user(),database(),version())';
      case 'utf8': return 'CONVERT(' + text + ' USING utf8)';
      case 'latin1': return 'CONVERT(' + text + ' USING latin1)';
      case 'union': {
        const count = Number(text.trim());
        if (!Number.isInteger(count) || count < 1 || count > 1000) throw new Error('请输入 1–1000 的整数列数');
        return 'UNION SELECT ' + Array.from({length: count}, (_, i) => i + 1).join(',');
      }
      case 'comments': return text.replace(/ /g, '/**/');
      case 'charcode': return 'String.fromCharCode(' + codes.join(', ') + ')';
      case 'htmlentities': return Array.from(text, c => '&#' + c.codePointAt(0) + ';').join('');
      case 'escapehtml': return root.HB.escapeHTML ? root.HB.escapeHTML(text) : text.replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
      case 'alert': return '<script>alert(1)</script>';
      default: throw new Error('未知工具');
    }
  }
  root.HBTools = {transform};
})(typeof globalThis !== 'undefined' ? globalThis : this);
