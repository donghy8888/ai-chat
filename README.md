# AI 聊天（浏览器版 / iPad 友好）

一个轻量、无构建依赖的网页 AI 聊天应用。在浏览器中打开即可使用，通过你自己的 **OpenAI 兼容 Chat Completions API**（自带 API Key）进行对话。已针对 **iPad Safari** 优化，支持「添加到主屏幕」。

## 在线打开（iPad 推荐）

公网 HTTPS（GitHub Pages）：

**https://donghy8888.github.io/ai-chat/**

用 iPad Safari 打开上述地址后，即可「添加到主屏幕」。API Key 仍只保存在你自己的浏览器里。

仓库：https://github.com/donghy8888/ai-chat

## 快速开始（本地）

在本目录启动任意静态文件服务器，例如：

```bash
cd /workspace/ai-chat
python3 -m http.server 8765 --bind 0.0.0.0
```

- 本机：`http://127.0.0.1:8765/`
- 同一 Wi‑Fi 下的 iPad：`http://<电脑局域网IP>:8765/`（远程或不在同一网络时不可用）
- 若已通过临时公网隧道暴露，请使用隧道给出的 **HTTPS** 地址（见部署说明或运行时输出）

也可直接用其他工具（如 `npx serve`）托管本目录。亦可解压 `ai-chat.tar.gz` 后上传到任意静态托管（GitHub Pages、Cloudflare Pages、对象存储静态站等）。

## 在 iPad 上添加到主屏幕

1. 用 **Safari** 打开本应用的网址（建议 HTTPS）。
2. 点底部（或顶部）**分享** 按钮（方框加向上箭头）。
3. 下滑找到并点 **「添加到主屏幕」**。
4. 名称可保持「AI 聊天」，点 **添加**。
5. 从主屏幕图标打开后，会以接近全屏的方式运行；首次仍需在应用内 **设置** 中填写你的 API Key。

> 说明：Chrome / 其他浏览器在 iPad 上「添加到主屏幕」能力有限，请优先用 Safari。

## 配置 API

点击右上角 **「设置」**，填写：

| 项 | 说明 | 默认值 |
|---|---|---|
| **API Base URL** | OpenAI 兼容接口根路径（会请求 `{Base URL}/chat/completions`） | `https://api.openai.com/v1` |
| **API Key** | 你的密钥，例如 `sk-…` | （空，需自行填写） |
| **模型名称** | 如 `gpt-4o-mini`、`gpt-4o` 或兼容服务商的模型名 | `gpt-4o-mini` |
| **系统提示词** | 可选，约束助手人设与回答风格 | （空） |
| **启用流式输出** | 支持 `stream: true` 时逐字显示；失败会自动回退为非流式 | 开启 |

保存后即可在输入框发消息。桌面端 Enter 发送、Shift+Enter 换行；触屏可直接点发送按钮。

## 数据与安全

- **API Key 与设置、聊天记录** 均保存在当前浏览器的 `localStorage` 中，不会上传到本应用以外的服务器。
- 对话请求由 **浏览器直接** 发往你配置的 Base URL。
- 「添加到主屏幕」后仍是同一站点来源；换域名/隧道地址会得到另一份独立存储。
- 请勿把含真实密钥的截图或导出文件发给他人；清理可用浏览器「清除网站数据」，或在本应用中新建/清空对话并在设置里删掉 Key。
- 若遇到跨域（CORS）错误，需要 API 服务端允许浏览器访问，或改用支持 CORS 的兼容网关。

## 文件说明

- `index.html` — 页面结构与 iOS / PWA meta
- `styles.css` — 样式（深色优先、安全区、触控目标、平板自适应）
- `app.js` — 聊天逻辑、流式 SSE、本地持久化、键盘视口适配
- `manifest.webmanifest` — Web App Manifest（名称「AI 聊天」）
- `favicon.svg` / `icons/` — 图标（含 apple-touch-icon）
- `README.md` — 本说明

## 功能一览

- 用户 / 助手气泡对话界面
- 流式回复（SSE），失败时回退
- 设置面板：Base URL / Key / 模型 / 系统提示词
- 本地持久化设置与历史；新建对话、清空对话
- iPad Safari 可用、可添加到主屏幕；安全区与触控优化
- 加载状态与清晰错误提示（缺 Key、401、网络等）

祝使用愉快。
