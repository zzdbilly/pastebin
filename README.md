# Pastebin — 轻量文本分享工具

> 纯前端 + Cloudflare Workers 的轻量文本粘贴分享工具。

🌐 **https://pastebin.billycust716.workers.dev**

---

## 功能

- 📝 创建粘贴（文本分享）
- 🔗 唯一短码链接
- 📄 查看页面（highlight.js 代码高亮）
- 📦 Raw 模式（`/<code>/raw`）
- 🗑️ 自动过期清理

## 技术栈

| 层面 | 技术 |
|------|------|
| 运行时 | Cloudflare Workers |
| 存储 | Workers KV |
| 前端 | 纯 HTML + CSS + JavaScript（零框架） |
| 高亮 | highlight.js |

## 开发

```bash
pnpm install
pnpm dev        # wrangler dev
pnpm deploy     # wrangler deploy
```

## 环境变量

| 变量 | 说明 |
|------|------|
| `KV` | KV namespace 绑定（wrangler.toml 配置） |

## 部署

```bash
pnpm deploy
```

首次部署需创建 KV namespace：

```bash
wrangler kv:namespace create PASTEBIN
# 将返回的 id 填入 wrangler.toml 的 kv_namespaces[].id
```

## 项目结构

```
pastebin/
├── src/worker.js        # Workers 主逻辑
├── docs/superpowers/    # 方案设计文档
├── wrangler.toml        # CF Workers 配置
└── package.json
```

## 许可证

MIT © [zzdbilly](https://github.com/zzdbilly)
