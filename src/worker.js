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

async function getPasteView(request, id) {
  return new Response('Not implemented', { status: 501 });
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
