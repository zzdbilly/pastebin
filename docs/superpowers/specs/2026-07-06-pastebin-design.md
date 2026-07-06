# PasteBin 设计文档

> 基于 Cloudflare Workers 的轻量文本粘贴分享工具

## 概述

一个极简风格的 PasteBin 服务，用户粘贴纯文本后生成短链接分享给别人。前端是静态 HTML/CSS/JS，通过 CF Workers API 与 Workers KV 交互。

## 技术栈

| 层面 | 技术 |
|------|------|
| 前端 | 纯 HTML + CSS + JavaScript（极简风） |
| 存储 | Cloudflare Workers KV（键值对存储） |
| API | Cloudflare Workers（JavaScript） |
| 部署 | CF Workers.dev + GitHub Pages |
| 语法高亮 | highlight.js（自动检测语言） |

## 核心功能（MVP）

### 粘贴
- 文本输入框（支持多行）
- 点击 "Create Paste" 或 Ctrl+Enter 提交
- 生成 6 位随机短代码作为 URL
- 有效期选项：1小时 / 24小时 / 7天
- 阅后即焚开关（burn after reading）
- 语法高亮（自动检测 + 手动选择语言）

### 展示
- 访问 `https://pb.xxx.workers.dev/abc123` 直接显示纯文本内容
- 代码语法高亮（自动检测语言，但只做纯文本展示，不做富文本编辑器）
- 页面显示：内容 + 创建时间 + 有效期 + 剩余时间

### 永久链接
- 永不失效的 paste 需要额外操作（目前不加）

## 架构

```
用户浏览器 → CF Workers API (api.xxx) → Workers KV
                    ↓
             静态前端 (pastebin.xxx 或 GitHub Pages)
```

### 数据流

**粘贴流程：**
1. 用户在页面输入文本，选择有效期、是否阅后即焚
2. 点击提交 → POST 到 Worker API
3. Worker 生成 6 位随机代码，写入 KV（含创建时间、有效期、内容）
4. 返回短链接给前端，前端显示链接

**查看流程：**
1. 用户访问 `/<code>`
2. Worker 从 KV 读取数据
3. 检查是否过期（过期返回 404）
4. 检查是否已焚（焚了返回 404）
5. 返回纯 HTML 展示内容
6. 如果是阅后即焚，显示后删除 KV 记录

### KV 数据结构

```json
{
  "content": "粘贴的文本内容",
  "created_at": 1712345678000,
  "expires_in": 3600,
  "burn_after_reading": false,
  "language": "auto"
}
```

- **Key**: 6 位随机短代码（a-zA-Z0-9）
- **TTL**: 根据有效期设置 KV 过期时间

## API 设计

### POST `/api/new`
创建新的 paste

**请求体：**
```json
{
  "content": "文本内容",
  "expires_in": 3600,
  "burn_after_reading": false
}
```

`expires_in` 取值：3600（1小时） / 86400（24小时） / 604800（7天）

**响应：**
```json
{
  "id": "abc123",
  "url": "https://pb.xxx.workers.dev/abc123",
  "expires_at": 1712355678000
}
```

### GET `/<code>`
查看 paste 内容

**响应：** 渲染好的 HTML 页面（非 API）

### GET `/<code>/raw`
获取原始文本

**响应：** `Content-Type: text/plain` 的原始文本

## 前端页面

### 首页 `/`
- 极简设计：居中布局
- 一个大文本框（textarea）
- 有效期选择（下拉：1小时 / 24小时 / 7天）
- 阅后即焚开关（checkbox）
- "Create Paste" 按钮
- 提交后显示短链接 + 复制按钮
- 暗色主题（跟随系统 prefers-color-scheme）

### 查看页 `/<code>`
- 纯文本展示区域
- 语法高亮（highlight.js）
- 创建时间、有效期、剩余时间
- 如果是已过期或已焚，显示 404 页面

## 文件结构

```
nook/pastebin/
├── src/
│   ├── worker.js            # CF Workers 核心（API + 路由 + 渲染）
│   ├── index.html           # 首页 HTML（内联到 worker 或单独部署）
│   └── view-template.html   # 查看页 HTML 模板（内联到 worker）
├── wrangler.toml            # CF Workers 配置
├── package.json
└── docs/
    └── superpowers/
        └── specs/
            └── 2026-07-06-pastebin-design.md
```

## 非功能需求

- 文本大小限制：100KB
- 过期策略：KV TTL 自动清理 + Worker 前置检查
- 禁止包含敏感内容（暂时不做内容审核）
- 响应式设计，移动端友好
- 页面加载轻量，JS/CSS 内联

## 后续规划（非 MVP）

- CLI 工具（Python/Shell）
- 自定义 URL slug
- 编辑/删除 paste（需密码）
- 客户端加密
- 访问统计
- API 文档页
