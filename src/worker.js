// Pastebin Cloudflare Worker
// KV binding: KV (global)

// --- 工具函数 ---

// Generate random 6-char alphanumeric code
function generateId() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// Validate expires_in value (1h, 24h, 7d)
function parseExpiresIn(val) {
  const allowed = { '3600': 3600, '86400': 86400, '604800': 604800 };
  return allowed[val] || 3600;
}

// --- API: POST /api/new ---

async function createPaste(request) {
  // Validate method
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  // Validate Content-Type
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) {
    return jsonResponse({ error: 'Content-Type must be application/json' }, 400);
  }

  // Parse JSON body
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  // Validate content
  const content = body.content;
  if (!content || typeof content !== 'string') {
    return jsonResponse({ error: 'content is required and must be a string' }, 400);
  }

  const MAX_SIZE = 100 * 1024; // 100KB
  if (content.length > MAX_SIZE) {
    return jsonResponse({ error: 'content must be 100KB or less' }, 400);
  }

  // Parse optional fields
  const expiresInSeconds = parseExpiresIn(String(body.expires_in || '3600'));
  const burnAfterReading = !!body.burn_after_reading;

  // Generate unique ID (retry if collision)
  let id;
  for (let i = 0; i < 5; i++) {
    id = generateId();
    const existing = await KV.get(id);
    if (!existing) break;
    if (i === 4) {
      return jsonResponse({ error: 'Failed to generate unique ID' }, 500);
    }
  }

  // Build paste object
  const paste = {
    content,
    burn_after_reading: burnAfterReading,
    created_at: Date.now(),
    expires_at: Date.now() + expiresInSeconds * 1000,
  };

  // Write to KV with TTL
  await KV.put(id, JSON.stringify(paste), { expirationTtl: expiresInSeconds });

  // Build response
  const url = new URL(request.url);
  const pasteUrl = `${url.protocol}//${url.host}/${id}`;

  return jsonResponse({
    id,
    url: pasteUrl,
    expires_at: new Date(paste.expires_at).toISOString(),
  });
}

// --- 占位函数 ---

async function getPasteRaw(request, id) {
  const data = await KV.get(id);
  if (!data) {
    return jsonResponse({ error: 'Not found' }, 404);
  }

  let paste;
  try {
    paste = JSON.parse(data);
  } catch {
    return jsonResponse({ error: 'Invalid data' }, 500);
  }

  // Check expiry
  if (Date.now() > paste.expires_at) {
    await KV.delete(id);
    return jsonResponse({ error: 'Expired' }, 404);
  }

  // Burn after reading
  if (paste.burn_after_reading) {
    await KV.delete(id);
  }

  return new Response(paste.content, {
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatTimeLeft(ms) {
  if (ms <= 0) return 'Expired';
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m remaining`;
  if (m > 0) return `${m}m remaining`;
  return '<1m remaining';
}

function render404Page(message) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PasteBin - Not Found</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  body{
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    background:#0d1117;color:#c9d1d9;min-height:100vh;
    display:flex;align-items:center;justify-content:center;
  }
  .error{text-align:center;}
  .error h1{font-size:48px;color:#f85149;margin-bottom:16px;}
  .error p{color:#8b949e;margin-bottom:24px;}
  .error a{color:#58a6ff;text-decoration:none;}
  .error a:hover{text-decoration:underline;}
</style>
</head>
<body>
<div class="error">
  <h1>404</h1>
  <p>${escapeHtml(message)}</p>
  <a href="/">Create a new paste</a>
</div>
</body>
</html>`;
}

async function getPasteView(request, id) {
  const data = await KV.get(id);
  if (!data) {
    return new Response(render404Page('This paste does not exist or has expired.'), {
      headers: { 'Content-Type': 'text/html;charset=utf-8', 'Access-Control-Allow-Origin': '*' },
      status: 404
    });
  }

  let paste;
  try {
    paste = JSON.parse(data);
  } catch {
    return new Response(render404Page('Invalid paste data.'), {
      headers: { 'Content-Type': 'text/html;charset=utf-8', 'Access-Control-Allow-Origin': '*' },
      status: 500
    });
  }

  // Check expiry
  const now = Date.now();
  if (now > paste.expires_at) {
    await KV.delete(id);
    return new Response(render404Page('This paste has expired.'), {
      headers: { 'Content-Type': 'text/html;charset=utf-8', 'Access-Control-Allow-Origin': '*' },
      status: 404
    });
  }

  const burnt = paste.burn_after_reading;
  if (burnt) {
    await KV.delete(id);
  }

  const escapedContent = escapeHtml(paste.content);
  const createdAt = new Date(paste.created_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const expiresAt = new Date(paste.expires_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const timeLeft = formatTimeLeft(paste.expires_at - now);

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PasteBin - ${id}</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.0/styles/github-dark.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.0/highlight.min.js"></script>
<script>hljs.highlightAll();</script>
<style>
  *,*::before,*::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0d1117; color: #c9d1d9; min-height: 100vh;
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
    display: flex; gap: 16px; flex-wrap: wrap; align-items: center;
  }
  .badge-burnt {
    display: inline-block; padding: 2px 8px; border-radius: 4px;
    font-size: 12px; font-weight: 500;
    background: #21262d; color: #f85149; border: 1px solid #f85149;
  }
  pre {
    background: #161b22; border: 1px solid #30363d; border-radius: 8px;
    padding: 20px; overflow-x: auto; font-size: 14px; line-height: 1.5;
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  }
  pre code.hljs { background: none; padding: 0; }
  .toolbar { margin-bottom: 12px; display: flex; gap: 8px; }
  .toolbar button {
    background: #21262d; color: #c9d1d9; border: 1px solid #30363d;
    padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px;
  }
  .toolbar button:hover { background: #30363d; }
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
    <a href="/">+ New Paste</a>
  </div>
  <div class="meta">
    <span>Created: ${createdAt}</span>
    <span>Expires: ${expiresAt}</span>
    <span>${timeLeft}</span>
    ${burnt ? '<span class="badge-burnt">☠ Burn after reading</span>' : ''}
    ${burnt ? '' : '<a href="/' + id + '/raw" style="color:#8b949e;text-decoration:none;">Raw</a>'}
  </div>
  <div class="toolbar">
    <button onclick="copyContent()">📋 Copy</button>
  </div>
  <pre><code class="language-plaintext hljs">${escapedContent}</code></pre>
  <div class="footer">
    <a href="https://github.com/zzdbilly/pastebin">PasteBin</a> &mdash; simple text sharing
  </div>
</div>
<script>
function copyContent() {
  const text = document.querySelector('pre code').textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.querySelector('.toolbar button');
    const orig = btn.textContent;
    btn.textContent = '✅ Copied!';
    setTimeout(() => btn.textContent = orig, 2000);
  }).catch(() => {});
}
</script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html;charset=utf-8', 'Access-Control-Allow-Origin': '*' }
  });
}

function serveHomepage() {
  return new Response('Not implemented', { status: 501 });
}

// --- 主路由 ---

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  // POST /api/new → createPaste
  if (path === '/api/new') {
    return createPaste(request);
  }

  // GET /<code>/raw → getPasteRaw
  const rawMatch = path.match(/^\/([a-zA-Z0-9]{6})\/raw$/);
  if (rawMatch) {
    return getPasteRaw(request, rawMatch[1]);
  }

  // GET /<code> → getPasteView
  const viewMatch = path.match(/^\/([a-zA-Z0-9]{6})$/);
  if (viewMatch) {
    return getPasteView(request, viewMatch[1]);
  }

  // GET / → serveHomepage
  if (path === '/' || path === '') {
    return serveHomepage();
  }

  // Everything else → 404
  return new Response('Not Found', { status: 404 });
}

// --- 辅助函数 ---

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

// --- Fetch 事件监听 ---

addEventListener('fetch', event => {
  // Handle CORS preflight
  if (event.request.method === 'OPTIONS') {
    event.respondWith(new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    }));
    return;
  }
  event.respondWith(handleRequest(event.request));
});
