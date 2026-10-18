# HackBar-360 2.5.0 验证记录

验证日期：2026-10-18。平台：Windows。浏览器：Chromium 130.0.6723.31，Playwright 1.48.2；使用隔离的临时测试配置。为载入 MV2 使用了启用旧清单的浏览器启动参数，因此这些结果不能证明已禁用 MV2 的浏览器能够安装本包。

## 已通过

- 所有 JavaScript（包括原始 Encrypt.js）的 `node --check` 语法检查。
- ESLint 9.39.5 检查所有新写的运行时代码：未定义变量、未使用变量、重复对象键、不可达代码、恒定条件和非严格比较；零错误。上游 Encrypt.js 仅做语法及功能向量检查。
- 6 组核心自动测试：请求参数与错误校验、JSON / URL / form / 头部 / 笔记脱敏、HTML / Markdown 报告注入防护、差异范围、2 MiB 连续长文本脱敏性能、旧工具的 UTF-8 往返及 MD5 / SHA-1 / SHA-256 标准向量。
- 实际加载 Manifest V2 扩展；在独立面板操作 UI，将 Unicode JSON 和自定义头发送到本地 HTTP 回显服务，并核对服务端收到的内容。
- 实测 GET / POST / PUT / PATCH / DELETE / HEAD / OPTIONS；验证重复表单字段、空值、加号和编码文本按原样发送，raw 正文和 Content-Type 正确；422 错误响应可查看正文。
- 实测阻止重定向、请求超时、流式响应读入期间的超时、用户取消、2 MiB 响应截断、受限请求头拒绝。
- 验证含脚本的 HTML 响应只显示为文本，不执行；可以设置基线并比较正文和响应头。
- 验证历史 / 草稿 / 笔记持久化并脱敏、历史搜索与回填；实际下载并检查 HTML / Markdown / JSON 三种报告。
- 验证非面板扩展页面无法调用敏感后台操作；6 个同时完成的请求都能保存到历史，未丢失记录。
- 验证选中文字后通过菜单转换、默认浅色 / 深色主题及 700px 窄布局无横向溢出；测试期间没有未捕获浏览器错误。
- 在真实 DevTools 环境确认 HackBar 标签注册、面板 iframe 加载、LOAD 读取被检查页面，以及 Network HAR 列表选择回填。
- 发布打包检查：ZIP 根目录直接含 manifest.json；所有 manifest / HTML 本地引用存在，ZIP CRC 正确；重新解压后的文件逐个与源码一致。

## 未验证或不支持

- 本机没有 360 品牌浏览器，未执行 360 安装、F12 或企业策略实测；未测试 IE 兼容模式，不支持该模式。未验证旧会话中无法访问的 /mnt/data 草稿。
- 未验证真实生产 API、客户端证书 / 代理认证 / 企业网络、所有 Cookie / SameSite / 第三方 Cookie 策略组合，也未绕过浏览器证书或权限限制。
- 受限请求头不能伪造。Fetch 可见的响应头有限；不会显示 Set-Cookie。3xx 不自动跟随且无法展示完整重定向响应。
- 正文 UTF-8 文本显示，非二进制查看器；上传文件和 multipart 边界不能重建。HTTP 原始报文、WebSocket、流式 UI 和自动扫描不在功能范围内。
- 脱敏为启发式规则，未知字段或编码内容可能遗漏。分享报告前必须人工复核。历史、响应和对比各有文档所列上限。

## 实现依据

- Chrome DevTools panels：<https://developer.chrome.com/docs/extensions/mv2/reference/devtools/panels>
- 扩展跨域请求：<https://developer.chrome.com/docs/extensions/develop/concepts/network-requests>
- 浏览器禁止手工设置的请求头：<https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_request_header>
- webRequest 约束及浏览器版本差异：<https://developer.chrome.com/docs/extensions/mv2/reference/webRequest>

详细使用方法、安装路径示例及全部限制见 README-360.md 和内置帮助页。
