# 来源说明

此版本基于用户上传的 HackBar-360.zip 和用户提供的截图制作。原包 manifest 作者信息为 Khoiasd (360 port by QwenWork)，原始版本为 2.3.1.360。先前会话引用的 /mnt/data/hackbar_v250 与 /mnt/data/hackbar_work 未能在此环境访问；不包含或声称保留其中未找回的更改。

保留原包 icons/icon.png 与 theme/js/Encrypt.js。Encrypt.js 顶部保留原始算法和作者来源注释，本版使用其中的 MD5 实现；SHA 系列采用浏览器 Web Crypto，编码工具补充 UTF-8 处理。

新版本重构了请求后台、界面、文本工具调度、历史、对比、脱敏和报告。移除了旧的全局请求头改写和页面注入提交方式，不进行许可证校验或遥测。权限中的 HTTP(S) 访问用于用户主动发送的调试请求，tabs 用于读取被检查页面 URL 和打开本地扩展面板。
