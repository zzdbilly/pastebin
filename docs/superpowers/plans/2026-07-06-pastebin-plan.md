# PasteBin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight pastebin service — users paste text, get a short URL, share it.

**Architecture:** CF Workers handle all routing and KV storage. Frontend HTML is inlined into worker response for single-deployment simplicity.

**Tech Stack:** Cloudflare Workers, Workers KV, JavaScript, HTML/CSS/JS

## Global Constraints

- All JS/CSS must be inlined into worker.js (single file deployment via `wrangler deploy`)
- Text size limit: 100 KB
- KV key: 6-char alphanumeric (a-zA-Z0-9)
- KV TTL for expiry: 3600 / 86400 / 604800 seconds
- No external dependencies for worker runtime
- highlight.js loaded from CDN (view page only)
- wrangler.toml targets `pb.zzdbilly.workers.dev`

---

### Quick Start (one-time)

```bash
cd nook/pastebin
pnpm init
pnpm add -g wrangler  # if not installed
pnpm wrangler login    # CF OAuth
pnpm wrangler kv namespace create pastebin-kv
```

Take the KV namespace ID from the output and put it into `wrangler.toml`.

---

## File Structure

```
nook/pastebin/
├── wrangler.toml         # CF Workers config
├── package.json          # pnpm project
├── src/
│   └── worker.js         # ★ Everything — routing, API, HTML, rendering
└── docs/superpowers/
    ├── specs/2026-07-06-pastebin-design.md
    └── plans/2026-07-06-pastebin-plan.md
```

---

## Tasks

### Task 1: Scaffold project — wrangler.toml + package.json

**Files:**
- Create: `nook/pastebin/wrangler.toml`
- Create: `nook/pastebin/package.json`
- Create: `nook/pastebin/.gitignore`

**Interfaces:**
- Consumes: nothing
- Produces: deployable Workers project skeleton

- [ ] **Step 1: Create wrangler.toml**

```toml
name = "pastebin"
main = "src/worker.js"
compatibility_date = "2026-07-06"

# KV namespace for storing pastes
# Created via: wrangler kv namespace create pastebin-kv
kv_namespaces = [
  { binding = "KV", id = "YOUR_KV_NAMESPACE_ID" }
]

# Routes
routes = [
  { pattern = "pb.zzdbilly.workers.dev", zone_id = "" }
]
```

- [ ] **Step 2: Create package.json**

```json
{
  "name": "pastebin",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "login": "wrangler login"
  },
  "devDependencies": {
    "wrangler": "^4.0.0"
  }
}
```

- [ ] **Step 3: Create .gitignore**

```
node_modules/
.wrangler/
dist/
```

- [ ] **Step 4: Init git repo and commit**

```bash
cd nook/pastebin
git init
git add wrangler.toml package.json .gitignore
git commit -m "chore: scaffold pastebin project"
```

---

### Task 2: Worker core — routing + API (POST /api/new)

**Files:**
- Create: `nook/pastebin/src/worker.js`

**Interfaces:**
- Consumes: KV binding (global `KV`), request from fetch event
- Produces: `handleRequest(request)` — routes requests, `createPaste(data)` — writes to KV

- [ ] **Step 1: Write worker.js with routing + createPaste API**

```javascript
// PasteBin — Cloudflare Worker
// Inline all HTML/CSS/JS for single-file deployment

// Generate random 6-char alphanumeric code
function generateId() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// Validate expires_in value
function parseExpiresIn(val) {
  const allowed = { '3600': 3600, '86400': 86400, '604800': 604800 };
  return allowed[val] || 3600; // default 1h
}

// Create a new paste
async function createPaste(request) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return new Response('Content-Type must be application/json', { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const content = body.content;
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return new Response('content is required', { status: 400 });
  }
  if (content.length > 102400) {
    return new Response('content exceeds 100KB limit', { status: 413 });
  }

  const expiresIn = parseExpiresIn(body.expires_in);
  const burnAfterReading = body.burn_after_reading === true;
  const id = generateId();
  const createdAt = Date.now();

  const pasteData = {
    content: content,
    created_at: createdAt,
    expires_in: expiresIn,
    burn_after_reading: burnAfterReading
  };

  await KV.put(id, JSON.stringify(pasteData), { expirationTtl: expiresIn });

  const url = `https://pb.zzdbilly.workers.dev/${id}`;

  return new Response(JSON.stringify({
    id: id,
    url: url,
    expires_at: createdAt + expiresIn * 1000
  }), {
    headers: { 'content-type': 'application/json' },
    status: 201
  });
}

// Main request handler
async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  // API: create paste
  if (path === '/api/new') {
    return createPaste(request);
  }

  // API: raw content
  if (path.match(/^\/([a-zA-Z0-9]{6})\/raw$/)) {
    return getPasteRaw(request, path.match(/\/([a-zA-Z0-9]{6})\/raw/)[1]);
  }

  // View paste
  const viewMatch = path.match(/^\/([a-zA-Z0-9]{6})$/);
  if (viewMatch) {
    return getPasteView(request, viewMatch[1]);
  }

  // Homepage
  return serveHomepage();
}

// Fetch event handler
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});
```

- [ ] **Step 2: Add placeholder for view/raw handlers (stubs)**

Add after `createPaste` function, before `handleRequest`:

```javascript
// Get raw paste content
async function getPasteRaw(request, id) {
  // TODO: Task 4
  return new Response('Not implemented', { status: 501 });
}

// Get paste view page
async function getPasteView(request, id) {
  // TODO: Task 3
  return new Response('Not implemented', { status: 501 });
}
```

- [ ] **Step 3: Add placeholder for homepage**

Add after `getPasteView`:

```javascript
// Serve homepage
function serveHomepage() {
  // TODO: Task 5
  return new Response('Not implemented', { status: 501 });
}
```

- [ ] **Step 4: Install deps and verify wrangler can parse**

```bash
cd nook/pastebin
pnpm install
pnpm wrangler deploy --dry-run
# Expected: dry run succeeds, shows deployment plan
```

- [ ] **Step 5: Commit**

```bash
git add src/worker.js package.json pnpm-lock.yaml
git commit -m "feat: worker routing + POST /api/new API"
```

---

### Task 3: View paste page — GET /<code> with syntax highlighting

**Files:**
- Modify: `nook/pastebin/src/worker.js`

**Interfaces:**
- Consumes: `getPasteView(request, id)` from Task 2
- Produces: rendered HTML page with content + highlight.js

- [ ] **Step 1: Implement getPasteView**

Replace the `getPasteView` placeholder:

```javascript
// Get paste view page with syntax highlighting
async function getPasteView(request, id) {
  const data = await KV.get(id);
  if (!data) {
    return new Response(renderErrorPage('Not found — this paste does not exist or has expired.'), {
      headers: { 'content-type': 'text/html;charset=utf-8' },
      status: 404
    });
  }

  let paste;
  try {
    paste = JSON.parse(data);
  } catch {
    return new Response(renderErrorPage('Invalid paste data.'), {
      headers: { 'content-type': 'text/html;charset=utf-8' },
      status: 500
    });
  }

  // Check expiry server-side (KV TTL is best-effort)
  const elapsed = Date.now() - paste.created_at;
  if (elapsed > paste.expires_in * 1000) {
    await KV.delete(id);
    return new Response(renderErrorPage('This paste has expired.'), {
      headers: { 'content-type': 'text/html;charset=utf-8' },
      status: 404
    });
  }

  // Burn after reading
  if (paste.burn_after_reading) {
    await KV.delete(id);
  }

  const escapedContent = escapeHtml(paste.content);
  const createdAt = new Date(paste.created_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const expiresAt = new Date(paste.created_at + paste.expires_in * 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const timeLeft = formatTimeLeft(paste.expires_in - Math.floor(elapsed / 1000));
  const burnt = paste.burn_after_reading;

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PasteBin - ${id}</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.0/styles/github-dark.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.0/highlight.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.0/languages/plaintext.min.js"></script>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0d1117;
    color: #c9d1d9;
    min-height: 100vh;
  }
  .container { max-width: 900px; margin: 0 auto; padding: 20px; }
  .header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 12px 0; border-bottom: 1px solid #30363d; margin-bottom: 20px;
  }
  .header a { color: #58a6ff; text-decoration: none; font-size: 14px; }
  .header a:hover { text-decoration: underline; }
  .meta {
    font-size: 13px; color: #8b949e; margin-bottom: 16px;
    display: flex; gap: 16px; flex-wrap: wrap;
  }
  .meta .badge {
    display: inline-block; padding: 2px 8px; border-radius: 4px;
    font-size: 12px; font-weight: 500;
  }
  .badge-burnt { background: #21262d; color: #f85149; border: 1px solid #f85149; }
  .badge-normal { background: #21262d; color: #58a6ff; border: 1px solid #58a6ff; }
  pre {
    background: #161b22; border: 1px solid #30363d; border-radius: 8px;
    padding: 20px; overflow-x: auto; font-size: 14px; line-height: 1.5;
    font-family: 'SF Mono', 'Fira Code', 'Fira Mono', monospace;
  }
  pre code.hljs { background: none; padding: 0; }
  .copy-btn {
    position: sticky; top: 20px; float: right; z-index: 10;
    background: #21262d; color: #c9d1d9; border: 1px solid #30363d;
    padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px;
  }
  .copy-btn:hover { background: #30363d; }
  .footer { text-align: center; padding: 40px 0; font-size: 13px; color: #484f58; }
  .footer a { color: #58a6ff; text-decoration: none; }
  @media (max-width: 600px) {
    .container { padding: 12px; }
    pre { font-size: 13px; padding: 12px; }
  }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <span style="font-weight:600;">PasteBin</span>
    <a href="/">New Paste</a>
  </div>
  <div class="meta">
    <span>Created: ${createdAt}</span>
    <span>Expires: ${expiresAt}</span>
    <span>${timeLeft}</span>
    ${burnt ? '<span class="badge badge-burnt">Burn after reading</span>' : '<span class="badge badge-normal">/raw</span>'}
    ${burnt ? '' : '<span><a href="/' + id + '/raw" style="color:#58a6ff;">Raw</a></span>'}
  </div>
  <button class="copy-btn" onclick="copyContent()">Copy</button>
  <pre><code class="language-plaintext hljs">${escapedContent}</code></pre>
  <div class="footer">
    <a href="https://github.com/zzdbilly/pastebin">PasteBin</a> &mdash; simple text sharing
  </div>
</div>
<script>
hljs.highlightAll();
function copyContent() {
  const text = document.querySelector('pre code').textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.querySelector('.copy-btn');
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy', 2000);
  }).catch(() => {});
}
</script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'content-type': 'text/html;charset=utf-8' },
    status: burnt ? 200 : 200
  });
}

// HTML escape
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Format time left
function formatTimeLeft(seconds) {
  if (seconds <= 0) return 'Expired';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return h + 'h ' + m + 'm remaining';
  return m + 'm remaining';
}

// Render error page
function renderErrorPage(message) {
  return \`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PasteBin - Not Found</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0d1117; color: #c9d1d9; min-height: 100vh;
    display: flex; align-items: center; justify-content: center;
  }
  .error { text-align: center; }
  .error h1 { font-size: 48px; color: #f85149; margin-bottom: 16px; }
  .error p { color: #8b949e; margin-bottom: 24px; }
  .error a { color: #58a6ff; text-decoration: none; }
  .error a:hover { text-decoration: underline; }
</style>
</head>
<body>
<div class="error">
  <h1>404</h1>
  <p>\${escapeHtml(message)}</p>
  <a href="/">Create a new paste</a>
</div>
</body>
</html>\`;
}
```

- [ ] **Step 2: Verify with dry-run**

```bash
cd nook/pastebin
pnpm wrangler deploy --dry-run
```

- [ ] **Step 3: Commit**

```bash
git add src/worker.js
git commit -m "feat: view paste page with highlight.js + error pages"
```

---

### Task 4: Raw paste endpoint — GET /<code>/raw

**Files:**
- Modify: `nook/pastebin/src/worker.js`

**Interfaces:**
- Consumes: `getPasteRaw(request, id)` placeholder from Task 2
- Produces: plain text response with correct Content-Type

- [ ] **Step 1: Implement getPasteRaw**

Replace the `getPasteRaw` placeholder:

```javascript
// Get raw paste content as plain text
async function getPasteRaw(request, id) {
  const data = await KV.get(id);
  if (!data) {
    return new Response('Not found', { status: 404 });
  }

  let paste;
  try {
    paste = JSON.parse(data);
  } catch {
    return new Response('Invalid paste data', { status: 500 });
  }

  // Check expiry
  const elapsed = Date.now() - paste.created_at;
  if (elapsed > paste.expires_in * 1000) {
    await KV.delete(id);
    return new Response('Expired', { status: 404 });
  }

  // Burn after reading also counts for raw access
  if (paste.burn_after_reading) {
    await KV.delete(id);
  }

  return new Response(paste.content, {
    headers: {
      'content-type': 'text/plain;charset=utf-8',
      'cache-control': 'no-store'
    },
    status: 200
  });
}
```

- [ ] **Step 2: Verify with dry-run**

```bash
cd nook/pastebin
pnpm wrangler deploy --dry-run
```

- [ ] **Step 3: Commit**

```bash
git add src/worker.js
git commit -m "feat: raw paste endpoint GET /<code>/raw"
```

---

### Task 5: Homepage — text input + submit form

**Files:**
- Modify: `nook/pastebin/src/worker.js`

**Interfaces:**
- Consumes: `serveHomepage()` placeholder from Task 2
- Produces: rendered homepage HTML with form + JS submit logic

- [ ] **Step 1: Implement serveHomepage**

Replace the `serveHomepage` placeholder:

```javascript
// Serve homepage with paste form
function serveHomepage() {
const html = \`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PasteBin — share text simply</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0d1117; color: #c9d1d9; min-height: 100vh;
  }
  .container {
    max-width: 800px; margin: 0 auto; padding: 40px 20px;
    display: flex; flex-direction: column; min-height: 100vh;
  }
  .main { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; }
  .subtitle { color: #8b949e; font-size: 14px; margin-bottom: 24px; }
  textarea {
    width: 100%; max-width: 700px; height: 240px;
    background: #161b22; color: #c9d1d9; border: 1px solid #30363d;
    border-radius: 8px; padding: 16px; font-size: 15px; line-height: 1.5;
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    resize: vertical; outline: none; transition: border-color 0.15s;
  }
  textarea:focus { border-color: #58a6ff; }
  textarea::placeholder { color: #484f58; }
  .options {
    width: 100%; max-width: 700px; display: flex; gap: 16px;
    align-items: center; margin-top: 12px; flex-wrap: wrap;
  }
  .options label { font-size: 14px; color: #8b949e; cursor: pointer; display: flex; align-items: center; gap: 6px; }
  select {
    background: #21262d; color: #c9d1d9; border: 1px solid #30363d;
    border-radius: 6px; padding: 6px 10px; font-size: 14px; cursor: pointer; outline: none;
  }
  select:focus { border-color: #58a6ff; }
  input[type="checkbox"] { accent-color: #58a6ff; width: 16px; height: 16px; cursor: pointer; }
  .actions { width: 100%; max-width: 700px; margin-top: 16px; }
  button {
    background: #238636; color: #fff; border: none; border-radius: 6px;
    padding: 10px 24px; font-size: 15px; font-weight: 500; cursor: pointer;
    transition: background 0.15s;
  }
  button:hover { background: #2ea043; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .result {
    width: 100%; max-width: 700px; margin-top: 20px; display: none;
  }
  .result.show { display: block; }
  .result input {
    width: 100%; background: #161b22; color: #58a6ff; border: 1px solid #30363d;
    border-radius: 6px; padding: 12px 16px; font-size: 15px; font-family: 'SF Mono', monospace;
    outline: none; cursor: text;
  }
  .result input:focus { border-color: #58a6ff; }
  .result .hint { margin-top: 8px; font-size: 13px; color: #8b949e; }
  .error-msg { color: #f85149; font-size: 14px; margin-top: 12px; display: none; }
  .error-msg.show { display: block; }
  .spinner { display: none; border: 2px solid #30363d; border-top: 2px solid #58a6ff; border-radius: 50%; width: 18px; height: 18px; animation: spin 0.8s linear infinite; vertical-align: middle; margin-left: 8px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .footer { text-align: center; padding: 32px 0; font-size: 13px; color: #484f58; }
  .footer a { color: #58a6ff; text-decoration: none; }
  @media (max-width: 600px) {
    .container { padding: 20px 12px; }
    h1 { font-size: 24px; }
    textarea { height: 180px; font-size: 14px; }
    .options { gap: 10px; }
  }
</style>
</head>
<body>
<div class="container">
  <div class="main">
    <h1>PasteBin</h1>
    <p class="subtitle">Paste text, share instantly</p>
    <textarea id="content" placeholder="Paste your text here..." spellcheck="false"></textarea>
    <div class="options">
      <label>
        Expires:
        <select id="expires-in">
          <option value="3600">1 hour</option>
          <option value="86400" selected>24 hours</option>
          <option value="604800">7 days</option>
        </select>
      </label>
      <label>
        <input type="checkbox" id="burn-after"> Burn after reading
      </label>
    </div>
    <div class="error-msg" id="error-msg"></div>
    <div class="actions">
      <button id="submit-btn" onclick="createPaste()">
        Create Paste
        <span class="spinner" id="spinner"></span>
      </button>
    </div>
    <div class="result" id="result">
      <input type="text" id="result-url" readonly onclick="this.select()">
      <p class="hint">Click to select, Ctrl+C to copy</p>
    </div>
  </div>
  <div class="footer">
    <a href="https://github.com/zzdbilly/pastebin">PasteBin</a> &mdash; simple text sharing
  </div>
</div>
<script>
async function createPaste() {
  const content = document.getElementById('content').value.trim();
  if (!content) {
    showError('Please paste some text first.');
    return;
  }

  const btn = document.getElementById('submit-btn');
  const spinner = document.getElementById('spinner');
  const errorMsg = document.getElementById('error-msg');
  const result = document.getElementById('result');

  btn.disabled = true;
  spinner.style.display = 'inline-block';
  errorMsg.classList.remove('show');
  result.classList.remove('show');

  try {
    const res = await fetch('/api/new', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: content,
        expires_in: parseInt(document.getElementById('expires-in').value),
        burn_after_reading: document.getElementById('burn-after').checked
      })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(err || 'Failed to create paste');
    }

    const data = await res.json();
    document.getElementById('result-url').value = data.url;
    result.classList.add('show');
    document.getElementById('content').value = '';
  } catch (e) {
    showError(e.message);
  } finally {
    btn.disabled = false;
    spinner.style.display = 'none';
  }
}

function showError(msg) {
  const el = document.getElementById('error-msg');
  el.textContent = msg;
  el.classList.add('show');
}

// Ctrl+Enter to submit
document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    createPaste();
  }
});
</script>
</body>
</html>\`;
  return new Response(html, {
    headers: { 'content-type': 'text/html;charset=utf-8' }
  });
}
```

- [ ] **Step 2: Register homepage route in handleRequest**

The homepage route `/` is already handled by the final `return serveHomepage()` in `handleRequest`.

- [ ] **Step 3: Verify with dry-run**

```bash
cd nook/pastebin
pnpm wrangler deploy --dry-run
```

- [ ] **Step 4: Commit**

```bash
git add src/worker.js
git commit -m "feat: homepage with form + submit to /api/new"
```

---

### Task 6: Deploy to Cloudflare Workers

**Files:** none (deployment only)

- [ ] **Step 1: Update wrangler.toml with correct KV namespace ID**

Before deploying, run:
```bash
cd nook/pastebin
pnpm wrangler kv namespace create pastebin-kv
```

Copy the output `id` into `wrangler.toml`:
```toml
kv_namespaces = [
  { binding = "KV", id = "PASTE_YOUR_ID_HERE" }
]
```

- [ ] **Step 2: Deploy**

```bash
cd nook/pastebin
pnpm wrangler deploy
```

Expected: Worker deployed to `https://pb.zzdbilly.workers.dev`

- [ ] **Step 3: Smoke test**

```bash
# Create a paste
curl -X POST https://pb.zzdbilly.workers.dev/api/new \
  -H "Content-Type: application/json" \
  -d '{"content":"Hello from CLI!","expires_in":86400}'
# Expected: {"id":"abc123","url":"https://pb.zzdbilly.workers.dev/abc123","expires_at":...}

# View paste
curl https://pb.zzdbilly.workers.dev/abc123
# Expected: HTML page with highlighted content

# Raw paste
curl https://pb.zzdbilly.workers.dev/abc123/raw
# Expected: "Hello from CLI!"

# Test homepage
curl https://pb.zzdbilly.workers.dev/
# Expected: HTML form
```

- [ ] **Step 4: Commit**

```bash
git add wrangler.toml src/worker.js
git commit -m "chore: initial deploy to Cloudflare Workers"
```

---

### Task 7: Add CORS headers for browser direct access

**Files:**
- Modify: `nook/pastebin/src/worker.js`

**Interfaces:**
- Consumes: `handleRequest` — adds CORS to all responses

- [ ] **Step 1: Add CORS helper and wrap responses**

Add before `handleRequest`:

```javascript
// Add CORS headers to response
function corsResponse(body, init) {
  init = init || {};
  init.headers = init.headers || {};
  init.headers['access-control-allow-origin'] = '*';
  init.headers['access-control-allow-methods'] = 'GET, POST, OPTIONS';
  init.headers['access-control-allow-headers'] = 'Content-Type';
  return new Response(body, init);
}
```

Update `handleRequest` to handle OPTIONS preflight:

```javascript
async function handleRequest(request) {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return corsResponse(null, { status: 204 });
  }

  const url = new URL(request.url);
  const path = url.pathname;

  // API: create paste
  if (path === '/api/new') {
    return createPaste(request);
  }
  // ... rest unchanged
}
```

Wrap the return values in `corsResponse`:

- `createPaste` success: `return corsResponse(JSON.stringify(...), { headers: {...}, status: 201 });`
- `createPaste` errors: `return corsResponse('...', { status: 4xx });`
- `getPasteView`: `return corsResponse(html, { headers: {...} });`
- `getPasteRaw`: `return corsResponse(content, { headers: {...} });`
- `serveHomepage`: `return corsResponse(html, { headers: {...} });`

- [ ] **Step 2: Verify with dry-run**

```bash
cd nook/pastebin
pnpm wrangler deploy --dry-run
```

- [ ] **Step 3: Commit**

```bash
git add src/worker.js
git commit -m "chore: add CORS headers for all responses"
```

---

### Task 8: Final review and commit all

**Files:**
- Verify: `nook/pastebin/src/worker.js` — complete file review

- [ ] **Step 1: Review worker.js for completeness**

Check:
- All routes: `/` (homepage), `/api/new` (create), `/<code>` (view), `/<code>/raw` (raw)
- Error states: 404 for missing/expired, 413 for too large, 400 for bad input, 405 for wrong method
- Burn after reading: deletes KV entry on view and raw access
- Expiry: server-side check (KV TTL is best-effort)
- Syntax highlighting: highlight.js from CDN
- Copy button works
- CORS headers on all responses
- Mobile responsive
- Dark theme only (no light toggle needed for MVP)

- [ ] **Step 2: Push to GitHub**

```bash
cd nook/pastebin
git remote add origin git@github.com:zzdbilly/pastebin.git
git push -u origin main
```

- [ ] **Step 3: Update PROJECTS.yaml**

Add pastebin entry to `~/.openclaw/workspace-xiaoma/nook/PROJECTS.yaml`.
