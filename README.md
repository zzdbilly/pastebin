# Pastebin — 轻量文本分享工具

> 纯前端 + Cloudflare Workers 的轻量文本粘贴分享工具。

🌐 **https://pastebin.billycust716.workers.dev**

---

## 功能

### 核心

- 📝 **创建粘贴** — 标题 + 内容，支持 Markdown
- 🔗 **唯一短码链接** — 自动生成短码（可自定义 slug）
- 📄 **查看页面** — 自动语法高亮（22 种语言），支持行号
- 📦 **Raw 模式** — `/<code>/raw` 获取纯文本
- 🗑️ **阅后即焚** — 查看一次后自动删除
- ⏰ **过期时间** — 30 分钟 / 1 小时 / 12 小时 / 1 天 / 7 天 / 30 天
- 🔐 **密码保护** — SHA-256 加密，临时验证 token
- 📝 **Markdown 渲染** — 查看页可切换 Markdown/源码预览

### 体验

- 🌗 **暗色主题** — GitHub Dark 风格
- 🖼️ **内联 SVG Logo + Favicon**
- 📱 **响应式布局** — 移动端友好
- ⌨️ **快捷键** — `Ctrl+Enter` 提交
- 🔗 **复制链接** — 创建成功后和查看页一键复制
- 🎯 **行高亮** — `?lines=3-7` 高亮指定行，可分享高亮链接
- 🧹 **删除确认** — 全屏模态弹窗，Esc 关闭
- 📋 **最近创建记录** — localStorage 保存

## 技术栈

| 层面 | 技术 |
|------|------|
| 运行时 | Cloudflare Workers |
| 存储 | Workers KV |
| 前端 | 纯 HTML + CSS + JavaScript（零框架） |
| 高亮 | highlight.js |
| Markdown | marked CDN |
| 密码 | Web Crypto API (SHA-256) |

## 项目结构

```
pastebin/
├── src/
│   ├── index.js              # Worker 入口（绑定 KV + CORS + 路由分发）
│   ├── router.js             # 主路由分发
│   ├── handlers.js           # 请求处理（raw/view 等）
│   ├── pages.js              # HTML 渲染（首页/查看/管理/404）
│   ├── store.js              # KV 数据操作
│   ├── language.js           # 语法检测（22 种语言）
│   └── lib/
│       └── utils.js          # 工具函数（id/token/sha256/escapeHtml 等）
├── docs/superpowers/         # 方案设计文档
├── wrangler.toml             # CF Workers 配置（main: src/index.js）
├── package.json
└── README.md
```

## 开发

```bash
# 安装依赖
pnpm install

# 本地开发
pnpm dev                     # wrangler dev

# 部署
pnpm deploy                  # wrangler deploy
```

### 首次部署

需创建 KV namespace：

```bash
wrangler kv:namespace create PASTEBIN
```

将返回的 `id` 填入 `wrangler.toml` 的 `kv_namespaces[].id`。

## 行高亮功能

查看粘贴时支持 URL 参数高亮特定行：

| 参数 | 示例 | 说明 |
|------|------|------|
| `lines` | `?lines=3-7` | 第 3 到第 7 行高亮 |
| `lines` | `?lines=1,3,5` | 第 1、3、5 行高亮 |
| `lines` | `?lines=1-3,7,10-12` | 多段混合高亮 |
| `highlight` | `?highlight=3-7` | `lines` 的别名 |

高亮链接可复制分享。用户打开链接后会自动滚动到第一个高亮行。

## 环境变量

| 变量 | 说明 |
|------|------|
| `KV` | KV namespace 绑定（`wrangler.toml` 配置） |

## 许可证

MIT © [zzdbilly](https://github.com/zzdbilly)
