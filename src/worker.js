// Pastebin Cloudflare Worker (Enhanced)
// KV binding: KV (global)
//
// Features:
// - Basic paste creation/viewing/raw/burn-after-reading/expiry
// - Password protection (SHA-256 hash + temporary view token)
// - Title support
// - Syntax highlighting with auto-detection
// - Optimized homepage UI
// - Management link (delete / extend expiry)

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

// Generate random token for password verification
function generateToken() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let token = '';
  for (let i = 0; i < 24; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

// Generate longer random token for management (32 chars)
function generateManageToken() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

// Validate expires_in value (1h, 24h, 7d)
function parseExpiresIn(val) {
  const allowed = { '1800': 1800, '3600': 3600, '43200': 43200, '86400': 86400, '604800': 604800, '2592000': 2592000 };
  return allowed[val] || 3600;
}

// SHA-256 hash using Web Crypto API
async function sha256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- Language auto-detection ---

const LANGUAGE_PATTERNS = [
  { lang: 'javascript', patterns: [/^\s*function\s+/m, /=>\s*[{(]/, /\bconst\s+\w+\s*=/, /\blet\s+\w+\s*=/, /console\.log\(/, /require\(['"]/] },
  { lang: 'typescript', patterns: [/\binterface\s+\w+/, /:\s*(string|number|boolean|void)\b/, /\bas\s+(string|number|any)\b/, /\btype\s+\w+\s*=/] },
  { lang: 'python', patterns: [/^\s*def\s+\w+\s*\(/m, /^\s*import\s+\w+/m, /^\s*from\s+\w+\s+import/m, /print\s*\(/, /\bif\s+__name__\s*==\s*['"]__main__['"]:/, /\belif\b/, /\bself\./] },
  { lang: 'go', patterns: [/^\s*package\s+\w+/m, /^\s*func\s+\w+\s*\(/m, /^\s*import\s*["(]/m, /\bfmt\.(Print|Sprint|Fprint)/, /\bfunc\s+main\s*\(\)/] },
  { lang: 'java', patterns: [/^\s*public\s+(class|static|void)/m, /System\.out\.(print|println)/, /\bimport\s+java\./, /private\s+(static\s+)?\w+\s+\w+\s*;/] },
  { lang: 'c', patterns: [/#include\s*<.*\.h>/, /\bint\s+main\s*\(\s*(void|int\s+argc)/, /\bprintf\s*\(/, /\bscanf\s*\(/, /\bmalloc\s*\(/] },
  { lang: 'cpp', patterns: [/#include\s*<iostream>/, /#include\s*<vector>/, /\bstd::/, /\bcout\s*<</, /\bcin\s*>>/, /\btemplate\s*</] },
  { lang: 'csharp', patterns: [/\busing\s+System/, /\bnamespace\s+\w+/, /\bpublic\s+class\s+\w+/, /Console\.(Write|ReadLine)/, /\bstring\s+\w+\s*=/] },
  { lang: 'php', patterns: [/<\?php/, /^\s*\$\w+/m, /\becho\s+/, /\bfunction\s+\w+\s*\(/, /\barray\s*\(/] },
  { lang: 'ruby', patterns: [/^\s*def\s+\w+/m, /\bputs\s+/, /\brequire\s+['"]/, /\bend\s*$/, /\bmodule\s+\w+/, /\|.*\|/] },
  { lang: 'rust', patterns: [/^\s*fn\s+\w+/m, /^\s*use\s+\w+/m, /\blet\s+mut\s+/, /\bprintln!\s*\(/, /\bpub\s+(fn|struct|enum)/] },
  { lang: 'bash', patterns: [/^#!/, /\becho\s+/, /\bif\s+\[.*\];\s*then/, /\bfor\s+\w+\s+in\s/, /\bdone\s*$/, /\bexport\s+\w+=/] },
  { lang: 'html', patterns: [/<html/i, /<!DOCTYPE\s+html/i, /<\/(div|span|body|head|table)>/i] },
  { lang: 'css', patterns: [/[.#]\w+\s*\{/, /\b(media|keyframes)\s+/, /:\s*(hover|active|focus)\b/, /\bflex|grid\b/] },
  { lang: 'json', patterns: [/^\s*[\[{]/, /"[^"]+"\s*:\s*("(?:[^"\\]|\\.)*"|[\d.+-eEtruefalsenull]+)/] },
  { lang: 'yaml', patterns: [/^\s*\w+:\s+.+/m, /^\s*-\s+\w+/m, /\bindentation/, /^---/m] },
  { lang: 'sql', patterns: [/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\b/im, /\bFROM\s+\w+/i, /\bWHERE\s+\w+/i, /\bJOIN\s+\w+/i] },
  { lang: 'dockerfile', patterns: [/^\s*FROM\s+/im, /^\s*RUN\s+/im, /^\s*COPY\s+/im, /^\s*CMD\s+/im, /^\s*ENTRYPOINT\s+/im] },
  { lang: 'markdown', patterns: [/^#{1,6}\s+/m, /^\s*[-*]\s+/m, /```/, /\[.+?\]\(.+?\)/] },
  { lang: 'xml', patterns: [/<\?xml/, /<\/?\w+[\s>]/, /\sxmlns=/] },
];

function detectLanguage(content) {
  const scores = {};
  for (const { lang, patterns } of LANGUAGE_PATTERNS) {
    let score = 0;
    for (const pattern of patterns) {
      if (pattern.test(content)) score++;
    }
    if (score > 0) scores[lang] = score;
  }
  const entries = Object.entries(scores);
  if (entries.length === 0) return 'plaintext';
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

// Common languages for the dropdown
const LANGUAGE_OPTIONS = [
  'plaintext', 'javascript', 'typescript', 'python', 'go', 'java', 'c', 'cpp',
  'csharp', 'php', 'ruby', 'rust', 'bash', 'sql', 'html', 'css', 'json',
  'yaml', 'markdown', 'xml', 'dockerfile',
];

// --- API: POST /api/new ---

async function createPaste(request) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) {
    return jsonResponse({ error: 'Content-Type must be application/json' }, 400);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const content = body.content;
  if (!content || typeof content !== 'string') {
    return jsonResponse({ error: 'content is required and must be a string' }, 400);
  }

  const MAX_SIZE = 100 * 1024;
  if (content.length > MAX_SIZE) {
    return jsonResponse({ error: 'content must be 100KB or less' }, 400);
  }

  // Parse optional fields (backward compatible)
  const expiresInSeconds = parseExpiresIn(String(body.expires_in || '3600'));
  const burnAfterReading = !!body.burn_after_reading;

  // New optional fields
  const title = (typeof body.title === 'string' && body.title.trim()) ? body.title.trim().slice(0, 200) : '';
  const userLanguage = (typeof body.language === 'string' && body.language.trim()) ? body.language.trim().toLowerCase() : '';
  const password = (typeof body.password === 'string' && body.password.length > 0) ? body.password : '';
  const customSlug = (typeof body.custom_slug === 'string' && body.custom_slug.trim())
    ? body.custom_slug.trim().toLowerCase().slice(0, 32)
    : '';

  // Determine language: user-specified or auto-detect
  let language = userLanguage;
  if (!language || language === 'auto') {
    language = detectLanguage(content);
  }

  // Hash password if provided
  let passwordHash = '';
  if (password) {
    passwordHash = await sha256(password);
  }

  // Generate unique ID (custom slug or random)
  let id;
  if (customSlug) {
    if (!/^[a-z0-9-]+$/.test(customSlug)) {
      return jsonResponse({ error: 'Custom slug can only contain a-z, 0-9, and hyphens' }, 400);
    }
    const existing = await KV.get(customSlug);
    if (existing) {
      return jsonResponse({ error: 'This custom slug is already taken' }, 409);
    }
    id = customSlug;
  } else {
    for (let i = 0; i < 5; i++) {
      id = generateId();
      const existing = await KV.get(id);
      if (!existing) break;
      if (i === 4) {
        return jsonResponse({ error: 'Failed to generate unique ID' }, 500);
      }
    }
  }

  // Generate management token
  const manageToken = generateManageToken();

  // Build paste object
  const paste = {
    content,
    burn_after_reading: burnAfterReading,
    created_at: Date.now(),
    expires_at: Date.now() + expiresInSeconds * 1000,
    title,
    language,
    password_hash: passwordHash,
    manage_token: manageToken,
  };

  await KV.put(id, JSON.stringify(paste), { expirationTtl: expiresInSeconds });

  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  const pasteUrl = `${baseUrl}/${id}`;
  const manageUrl = `${baseUrl}/manage/${id}?token=${manageToken}`;

  return jsonResponse({
    id,
    url: pasteUrl,
    manage_url: manageUrl,
    expires_at: new Date(paste.expires_at).toISOString(),
  });
}

// --- API: POST /api/verify ---

async function verifyPassword(request) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) {
    return jsonResponse({ error: 'Content-Type must be application/json' }, 400);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const id = body.id;
  const password = body.password;
  if (!id || typeof id !== 'string' || !password || typeof password !== 'string') {
    return jsonResponse({ error: 'id and password are required' }, 400);
  }

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

  if (Date.now() > paste.expires_at) {
    await KV.delete(id);
    return jsonResponse({ error: 'Expired' }, 404);
  }

  if (!paste.password_hash) {
    return jsonResponse({ error: 'This paste is not password protected' }, 400);
  }

  const inputHash = await sha256(password);
  if (inputHash !== paste.password_hash) {
    return jsonResponse({ error: 'Wrong password' }, 403);
  }

  // Generate a view token and store in KV (1 hour TTL)
  const token = generateToken();
  const tokenKey = `vtok_${id}_${token}`;
  await KV.put(tokenKey, '1', { expirationTtl: 3600 });

  return jsonResponse({ token });
}

// --- View token validation ---

async function validateViewToken(id, token) {
  if (!token) return false;
  const tokenKey = `vtok_${id}_${token}`;
  const val = await KV.get(tokenKey);
  return val === '1';
}

// --- Raw endpoint ---

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

  if (Date.now() > paste.expires_at) {
    await KV.delete(id);
    return jsonResponse({ error: 'Expired' }, 404);
  }

  // Password protection check for raw endpoint
  if (paste.password_hash) {
    const url = new URL(request.url);
    const token = url.searchParams.get('token') || '';
    const valid = await validateViewToken(id, token);
    if (!valid) {
      return jsonResponse({ error: 'Password required. View the paste in browser to authenticate.' }, 403);
    }
  }

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

// --- HTML helpers ---

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
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Crect x='4' y='8' width='36' height='32' rx='6' stroke='%2358a6ff' stroke-width='2.5' fill='%23161b22'/%3E%3Crect x='9' y='5' width='26' height='6' rx='3' fill='%23238636'/%3E%3Crect x='12' y='5' width='8' height='6' rx='3' fill='%232ea043'/%3E%3Ctext x='24' y='12' text-anchor='middle' fill='%23fff' font-size='8' font-weight='700' font-family='sans-serif'%3EP%3C/text%3E%3C/svg%3E">
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

// --- Password input page ---

function renderPasswordPage(id) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Crect x='4' y='8' width='36' height='32' rx='6' stroke='%2358a6ff' stroke-width='2.5' fill='%23161b22'/%3E%3Crect x='9' y='5' width='26' height='6' rx='3' fill='%23238636'/%3E%3Crect x='12' y='5' width='8' height='6' rx='3' fill='%232ea043'/%3E%3Ctext x='24' y='12' text-anchor='middle' fill='%23fff' font-size='8' font-weight='700' font-family='sans-serif'%3EP%3C/text%3E%3C/svg%3E">
<title>PasteBin - Password Required</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  body{
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    background:#0d1117;color:#c9d1d9;min-height:100vh;
    display:flex;align-items:center;justify-content:center;
  }
  .pw-box{text-align:center;max-width:400px;width:90%;}
  .pw-box h2{font-size:20px;margin-bottom:8px;}
  .pw-box p{color:#8b949e;font-size:14px;margin-bottom:24px;}
  .pw-input{
    width:100%;background:#161b22;color:#c9d1d9;border:1px solid #30363d;
    border-radius:8px;padding:12px 16px;font-size:15px;outline:none;
    margin-bottom:12px;transition:border-color 0.15s;
  }
  .pw-input:focus{border-color:#58a6ff;}
  .pw-btn{
    background:#238636;color:#fff;border:none;border-radius:6px;
    padding:10px 24px;font-size:15px;font-weight:500;cursor:pointer;
    width:100%;transition:background 0.15s;
  }
  .pw-btn:hover{background:#2ea043;}
  .pw-btn:disabled{opacity:0.5;cursor:not-allowed;}
  .pw-error{color:#f85149;font-size:14px;margin-top:12px;display:none;}
  .pw-error.show{display:block;}
  .pw-back{margin-top:20px;}
  .pw-back a{color:#58a6ff;text-decoration:none;font-size:14px;}
  .pw-back a:hover{text-decoration:underline;}
  .spinner{display:none;border:2px solid #30363d;border-top:2px solid #58a6ff;border-radius:50%;width:18px;height:18px;animation:spin 0.8s linear infinite;vertical-align:middle;margin-left:8px;}
  @keyframes spin{to{transform:rotate(360deg);}}
</style>
</head>
<body>
<div class="pw-box">
  <h2>🔒 Password Required</h2>
  <p>This paste is protected. Enter the password to view.</p>
  <input type="password" class="pw-input" id="pw" placeholder="Password" autofocus>
  <button class="pw-btn" id="pw-btn" onclick="submitPassword()">
    Unlock<span class="spinner" id="spinner"></span>
  </button>
  <div class="pw-error" id="pw-error"></div>
  <div class="pw-back"><a href="/">← Back to home</a></div>
</div>
<script>
const pasteId="${id}";
async function submitPassword(){
  const pw=document.getElementById('pw').value;
  if(!pw)return;
  const btn=document.getElementById('pw-btn');
  const spinner=document.getElementById('spinner');
  const errEl=document.getElementById('pw-error');
  btn.disabled=true;spinner.style.display='inline-block';
  errEl.classList.remove('show');
  try{
    const res=await fetch('/api/verify',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({id:pasteId,password:pw})
    });
    if(!res.ok){
      const data=await res.json().catch(()=>({error:'Failed'}));
      throw new Error(data.error||'Failed');
    }
    const data=await res.json();
    window.location.href='/'+pasteId+'?token='+encodeURIComponent(data.token);
  }catch(e){
    errEl.textContent=e.message;errEl.classList.add('show');
  }finally{btn.disabled=false;spinner.style.display='none';}
}
document.addEventListener('keydown',function(e){
  if(e.key==='Enter'){e.preventDefault();submitPassword();}
});
</script>
</body>
</html>`;
}

// --- View paste page ---

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

  const now = Date.now();
  if (now > paste.expires_at) {
    await KV.delete(id);
    return new Response(render404Page('This paste has expired.'), {
      headers: { 'Content-Type': 'text/html;charset=utf-8', 'Access-Control-Allow-Origin': '*' },
      status: 404
    });
  }

  // Password protection: check token
  if (paste.password_hash) {
    const url = new URL(request.url);
    const token = url.searchParams.get('token') || '';
    const valid = await validateViewToken(id, token);
    if (!valid) {
      return new Response(renderPasswordPage(id), {
        headers: { 'Content-Type': 'text/html;charset=utf-8', 'Access-Control-Allow-Origin': '*' }
      });
    }
  }

  const burnt = paste.burn_after_reading;
  if (burnt) {
    await KV.delete(id);
  }

  const escapedContent = escapeHtml(paste.content);
  const displayTitle = paste.title || 'Untitled Paste';
  const language = paste.language || 'plaintext';
  const createdAt = new Date(paste.created_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const expiresAt = new Date(paste.expires_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const timeLeft = formatTimeLeft(paste.expires_at - now);

  // Build raw link with token if password protected
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || '';
  const rawLink = burnt ? '' : `/${id}/raw${token ? '?token=' + encodeURIComponent(token) : ''}`;

  // Check if manage token is present in query string (from creation redirect)
  const manageTokenParam = url.searchParams.get('manage') || '';

  // Generate line numbers
  const lineCount = paste.content.split('\n').length;
  const lineNumbersHtml = Array.from({length: lineCount}, (_, i) => `<span>${i + 1}</span>`).join('');
  const lineNumberWidth = Math.max(3, String(lineCount).length + 1) + 'ch';

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Crect x='4' y='8' width='36' height='32' rx='6' stroke='%2358a6ff' stroke-width='2.5' fill='%23161b22'/%3E%3Crect x='9' y='5' width='26' height='6' rx='3' fill='%23238636'/%3E%3Crect x='12' y='5' width='8' height='6' rx='3' fill='%232ea043'/%3E%3Ctext x='24' y='12' text-anchor='middle' fill='%23fff' font-size='8' font-weight='700' font-family='sans-serif'%3EP%3C/text%3E%3C/svg%3E">
<title>${escapeHtml(displayTitle)} - PasteBin</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.0/styles/github-dark.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.0/highlight.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
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
  .header-logo { display: flex; align-items: center; gap: 8px; font-weight: 600; }
  .header-logo svg { flex-shrink: 0; }
  .header a { color: #58a6ff; text-decoration: none; font-size: 14px; }
  .header a:hover { text-decoration: underline; }
  .paste-title {
    font-size: 22px; font-weight: 600; margin-bottom: 12px;
    word-break: break-all;
  }
  .meta {
    font-size: 13px; color: #8b949e; margin-bottom: 16px;
    display: flex; gap: 16px; flex-wrap: wrap; align-items: center;
  }
  .badge-burnt {
    display: inline-block; padding: 2px 8px; border-radius: 4px;
    font-size: 12px; font-weight: 500;
    background: #21262d; color: #f85149; border: 1px solid #f85149;
  }
  .badge-lang {
    display: inline-block; padding: 2px 8px; border-radius: 4px;
    font-size: 12px; font-weight: 500;
    background: #21262d; color: #79c0ff; border: 1px solid #30363d;
  }
  .badge-locked {
    display: inline-block; padding: 2px 8px; border-radius: 4px;
    font-size: 12px; font-weight: 500;
    background: #21262d; color: #d29922; border: 1px solid #d29922;
  }
  .code-block {
    display: flex; background: #161b22; border: 1px solid #30363d;
    border-radius: 8px; overflow: hidden;
  }
  .line-numbers {
    flex-shrink: 0; padding: 20px 12px 20px 20px;
    text-align: right; color: #484f58; user-select: none; -webkit-user-select: none;
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 14px; line-height: 1.5; border-right: 1px solid #21262d;
    white-space: nowrap; overflow: hidden;
  }
  .line-numbers span { display: block; }
  pre {
    flex: 1; margin: 0; background: none; border: none;
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
  .toolbar button.active { background: #1f6feb; border-color: #1f6feb; color: #fff; }
  .toolbar button.active:hover { background: #388bfd; }
  .md-preview {
    display: none; background: #161b22; border: 1px solid #30363d;
    border-radius: 8px; padding: 24px; font-size: 15px; line-height: 1.7;
    color: #c9d1d9; overflow-x: auto;
  }
  .md-preview.show { display: block; }
  .md-preview h1, .md-preview h2, .md-preview h3, .md-preview h4, .md-preview h5, .md-preview h6 {
    margin: 16px 0 8px; color: #f0f6fc; font-weight: 600; line-height: 1.3;
  }
  .md-preview h1 { font-size: 24px; border-bottom: 1px solid #21262d; padding-bottom: 8px; }
  .md-preview h2 { font-size: 20px; border-bottom: 1px solid #21262d; padding-bottom: 6px; }
  .md-preview h3 { font-size: 17px; }
  .md-preview p { margin: 8px 0; }
  .md-preview a { color: #58a6ff; text-decoration: none; }
  .md-preview a:hover { text-decoration: underline; }
  .md-preview ul, .md-preview ol { padding-left: 24px; margin: 8px 0; }
  .md-preview li { margin: 4px 0; }
  .md-preview code {
    background: #21262d; border-radius: 4px; padding: 2px 6px;
    font-family: 'SF Mono','Fira Code','Consolas',monospace; font-size: 13px;
  }
  .md-preview pre {
    background: #0d1117; border: 1px solid #30363d; border-radius: 6px;
    padding: 16px; overflow-x: auto; margin: 12px 0;
  }
  .md-preview pre code { background: none; padding: 0; font-size: 13px; }
  .md-preview blockquote {
    border-left: 4px solid #30363d; padding: 4px 16px; margin: 12px 0;
    color: #8b949e; background: #161b22;
  }
  .md-preview table {
    border-collapse: collapse; width: 100%; margin: 12px 0;
  }
  .md-preview th, .md-preview td {
    border: 1px solid #30363d; padding: 8px 12px; text-align: left;
  }
  .md-preview th { background: #21262d; font-weight: 600; }
  .md-preview img { max-width: 100%; border-radius: 6px; margin: 12px 0; }
  .md-preview hr { border: none; border-top: 1px solid #30363d; margin: 20px 0; }
  .line-highlight { background: #1f2e3e; border-left: 3px solid #58a6ff; }
  .footer { text-align: center; padding: 40px 0; font-size: 13px; color: #484f58; }
  .footer a { color: #58a6ff; text-decoration: none; }
  @media (max-width: 600px) {
    .container { padding: 12px; }
    .paste-title { font-size: 18px; }
    pre { font-size: 13px; padding: 12px; }
    .line-numbers { font-size: 13px; padding: 12px 8px 12px 12px; }
    .meta { gap: 8px; font-size: 12px; }
  }
  @media (max-width: 400px) {
    .line-numbers { display: none; }
    .code-block { border-radius: 8px; }
    pre { border: 1px solid #30363d; border-radius: 8px; }
  }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <div class="header-logo">
      <svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="8" width="36" height="32" rx="6" stroke="#58a6ff" stroke-width="2.5" fill="#161b22"/>
        <rect x="9" y="5" width="26" height="6" rx="3" fill="#238636"/>
        <rect x="12" y="5" width="8" height="6" rx="3" fill="#2ea043"/>
        <text x="24" y="12" text-anchor="middle" fill="#fff" font-size="8" font-weight="700" font-family="sans-serif">P</text>
      </svg>
      <span>PasteBin</span>
    </div>
    <a href="/">+ New Paste</a>
  </div>
  <div class="paste-title">${escapeHtml(displayTitle)}</div>
  <div class="meta">
    <span>📅 ${createdAt}</span>
    <span>⏰ ${expiresAt}</span>
    <span>${timeLeft}</span>
    <span class="badge-lang">${escapeHtml(language)}</span>
    ${paste.password_hash ? '<span class="badge-locked">🔒 Protected</span>' : ''}
    ${burnt ? '<span class="badge-burnt">☠ Burn after reading</span>' : ''}
    ${rawLink ? '<a href="' + rawLink + '" style="color:#8b949e;text-decoration:none;">📄 Raw</a>' : ''}
  </div>
  <div class="toolbar">
    <button onclick="copyContent()">📋 Copy</button>
    <button id="md-toggle" onclick="toggleMarkdown()">📝 Markdown Preview</button>
  </div>
  <div class="code-block" id="code-block">
    <div class="line-numbers" aria-hidden="true" style="min-width:${lineNumberWidth}">${lineNumbersHtml}</div>
    <pre><code class="language-${escapeHtml(language)} hljs">${escapedContent}</code></pre>
  </div>
  <div class="md-preview" id="md-preview"></div>
  <div class="footer">
    <a href="https://github.com/zzdbilly/pastebin">PasteBin</a> &mdash; simple text sharing
  </div>
</div>
<script>
// Copy content
function copyContent() {
  var text = document.querySelector('pre code').textContent;
  navigator.clipboard.writeText(text).then(function() {
    var btn = document.querySelector('.toolbar button');
    var orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(function() { btn.textContent = orig; }, 2000);
  }).catch(function() {});
}

// Markdown preview toggle (uses marked library from CDN)
function toggleMarkdown() {
  var toggleBtn = document.getElementById('md-toggle');
  var codeBlock = document.getElementById('code-block');
  var preview = document.getElementById('md-preview');
  if (!toggleBtn || !preview) return;
  if (preview.classList.contains('show')) {
    codeBlock.style.display = 'flex';
    preview.classList.remove('show');
    toggleBtn.textContent = '📝 Markdown Preview';
    toggleBtn.classList.remove('active');
    hljs.highlightAll();
  } else {
    if (!preview.dataset.rendered) {
      var rawText = document.querySelector('pre code').textContent;
      if (typeof marked !== 'undefined') {
        marked.setOptions({ breaks: true, gfm: true });
        preview.innerHTML = marked.parse(rawText);
        // Apply syntax highlighting to code blocks in rendered markdown
        var codeBlocks = preview.querySelectorAll('pre code');
        for (var i = 0; i < codeBlocks.length; i++) {
          hljs.highlightElement(codeBlocks[i]);
        }
      } else {
        preview.innerHTML = '<p style="color:#f85149;">Markdown library failed to load. Showing raw text.</p><pre>' + rawText + '</pre>';
      }
      preview.dataset.rendered = '1';
    }
    codeBlock.style.display = 'none';
    preview.classList.add('show');
    toggleBtn.textContent = 'Raw Code';
    toggleBtn.classList.add('active');
  }
}



// Line highlighting from URL param ?lines=...
(function() {
  var params = new URLSearchParams(window.location.search);
  var linesParam = params.get('lines');
  if (!linesParam) return;

  var lineEls = document.querySelectorAll('.line-numbers span');
  if (!lineEls.length) return;

  var linesToHighlight = [];
  var parts = linesParam.split(',');
  for (var p = 0; p < parts.length; p++) {
    var part = parts[p].trim();
    if (/^(\d+)-(\d+)$/.test(part)) {
      var m = part.match(/^(\d+)-(\d+)$/);
      var start = parseInt(m[1]);
      var end = parseInt(m[2]);
      for (var n = start; n <= end; n++) {
        linesToHighlight.push(n);
      }
    } else if (/^\d+$/.test(part)) {
      linesToHighlight.push(parseInt(part));
    }
  }

  if (!linesToHighlight.length) return;

  var firstHighlighted = null;
  for (var i = 0; i < lineEls.length; i++) {
    var lineNum = i + 1;
    if (linesToHighlight.indexOf(lineNum) !== -1) {
      lineEls[i].parentNode.style.background = '#1f2e3e';
      lineEls[i].parentNode.style.borderLeft = '3px solid #58a6ff';
      if (!firstHighlighted) firstHighlighted = lineEls[i].parentNode;
    }
  }

  if (firstHighlighted) {
    setTimeout(function() {
      firstHighlighted.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
  }
})();
</script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html;charset=utf-8', 'Access-Control-Allow-Origin': '*' }
  });
}

// --- Management page ---

async function renderManagePage(request, id) {
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

  // Validate manage token
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || '';
  if (!paste.manage_token || token !== paste.manage_token) {
    return new Response(render404Page('Invalid or missing management token.'), {
      headers: { 'Content-Type': 'text/html;charset=utf-8', 'Access-Control-Allow-Origin': '*' },
      status: 403
    });
  }

  const now = Date.now();
  if (now > paste.expires_at) {
    await KV.delete(id);
    return new Response(render404Page('This paste has expired.'), {
      headers: { 'Content-Type': 'text/html;charset=utf-8', 'Access-Control-Allow-Origin': '*' },
      status: 404
    });
  }

  const displayTitle = paste.title || 'Untitled Paste';
  const createdAt = new Date(paste.created_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const expiresAt = new Date(paste.expires_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const timeLeft = formatTimeLeft(paste.expires_at - now);
  const language = paste.language || 'plaintext';
  const contentPreview = paste.content.length > 200 ? paste.content.slice(0, 200) + '...' : paste.content;

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Crect x='4' y='8' width='36' height='32' rx='6' stroke='%2358a6ff' stroke-width='2.5' fill='%23161b22'/%3E%3Crect x='9' y='5' width='26' height='6' rx='3' fill='%23238636'/%3E%3Crect x='12' y='5' width='8' height='6' rx='3' fill='%232ea043'/%3E%3Ctext x='24' y='12' text-anchor='middle' fill='%23fff' font-size='8' font-weight='700' font-family='sans-serif'%3EP%3C/text%3E%3C/svg%3E">
<title>Manage - ${escapeHtml(displayTitle)} - PasteBin</title>
<style>
  *,*::before,*::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0d1117; color: #c9d1d9; min-height: 100vh;
  }
  .container { max-width: 700px; margin: 0 auto; padding: 20px; }
  .header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 12px 0; border-bottom: 1px solid #30363d; margin-bottom: 24px;
  }
  .header-logo { display: flex; align-items: center; gap: 8px; font-weight: 600; }
  .header-logo svg { flex-shrink: 0; }
  .header a { color: #58a6ff; text-decoration: none; font-size: 14px; }
  .header a:hover { text-decoration: underline; }
  .manage-title {
    font-size: 22px; font-weight: 600; margin-bottom: 8px;
  }
  .manage-subtitle {
    font-size: 14px; color: #8b949e; margin-bottom: 24px;
  }
  .info-card {
    background: #161b22; border: 1px solid #30363d; border-radius: 8px;
    padding: 20px; margin-bottom: 20px;
  }
  .info-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 8px 0; border-bottom: 1px solid #21262d; font-size: 14px;
  }
  .info-row:last-child { border-bottom: none; }
  .info-label { color: #8b949e; }
  .info-value { color: #c9d1d9; }
  .info-value .badge {
    display: inline-block; padding: 2px 8px; border-radius: 4px;
    font-size: 12px; font-weight: 500;
    background: #21262d; color: #79c0ff; border: 1px solid #30363d;
  }
  .content-preview {
    background: #161b22; border: 1px solid #30363d; border-radius: 8px;
    padding: 16px; margin-bottom: 20px; font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 13px; color: #8b949e; white-space: pre-wrap; word-break: break-all;
    max-height: 120px; overflow: hidden;
  }
  .actions-card {
    background: #161b22; border: 1px solid #30363d; border-radius: 8px;
    padding: 20px; margin-bottom: 20px;
  }
  .actions-card h3 {
    font-size: 16px; font-weight: 600; margin-bottom: 16px;
  }
  .action-row {
    display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
    margin-bottom: 16px;
  }
  .action-row:last-child { margin-bottom: 0; }
  select {
    background: #21262d; color: #c9d1d9; border: 1px solid #30363d;
    border-radius: 6px; padding: 8px 12px; font-size: 14px; cursor: pointer; outline: none;
  }
  select:focus { border-color: #58a6ff; }
  .btn {
    border: none; border-radius: 6px; padding: 8px 20px; font-size: 14px;
    font-weight: 500; cursor: pointer; transition: background 0.15s, opacity 0.15s;
  }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-extend {
    background: #1f6feb; color: #fff;
  }
  .btn-extend:hover:not(:disabled) { background: #388bfd; }
  .btn-delete {
    background: #da3633; color: #fff;
  }
  .btn-delete:hover:not(:disabled) { background: #f85149; }
  .btn-view {
    background: #21262d; color: #c9d1d9; border: 1px solid #30363d;
  }
  .btn-view:hover { background: #30363d; }
  .modal-overlay {
    display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.6); backdrop-filter: blur(2px); z-index: 1000;
    align-items: center; justify-content: center;
  }
  .modal-overlay.show { display: flex; }
  .modal {
    background: #161b22; border: 1px solid #da3633; border-radius: 12px;
    padding: 28px 32px; max-width: 420px; width: 90%; text-align: center;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4); animation: modalIn 0.18s ease-out;
  }
  @keyframes modalIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
  .modal-icon { font-size: 40px; margin-bottom: 12px; }
  .modal h3 { font-size: 18px; font-weight: 600; margin-bottom: 8px; color: #f0f6fc; }
  .modal p { font-size: 14px; margin-bottom: 20px; color: #8b949e; line-height: 1.5; }
  .modal-buttons { display: flex; gap: 10px; justify-content: center; }
  .modal .btn { min-width: 110px; }
  .status-msg {
    margin-top: 12px; padding: 10px 16px; border-radius: 6px; font-size: 14px;
    display: none;
  }
  .status-msg.show { display: block; }
  .status-msg.success { background: #0d1f0d; color: #3fb950; border: 1px solid #238636; }
  .status-msg.error { background: #1c0d0d; color: #f85149; border: 1px solid #da3633; }
  .spinner {
    display: none; border: 2px solid #30363d; border-top: 2px solid #58a6ff;
    border-radius: 50%; width: 16px; height: 16px; animation: spin 0.8s linear infinite;
    vertical-align: middle; margin-left: 8px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .footer { text-align: center; padding: 32px 0; font-size: 13px; color: #484f58; }
  .footer a { color: #58a6ff; text-decoration: none; }
  @media (max-width: 600px) {
    .container { padding: 12px; }
    .manage-title { font-size: 18px; }
    .action-row { flex-direction: column; align-items: stretch; }
    .btn { width: 100%; text-align: center; }
  }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <div class="header-logo">
      <svg width="24" height="24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="8" width="36" height="32" rx="6" stroke="#58a6ff" stroke-width="2.5" fill="#161b22"/>
        <rect x="9" y="5" width="26" height="6" rx="3" fill="#238636"/>
        <rect x="12" y="5" width="8" height="6" rx="3" fill="#2ea043"/>
        <text x="24" y="12" text-anchor="middle" fill="#fff" font-size="8" font-weight="700" font-family="sans-serif">P</text>
      </svg>
      <span>PasteBin · Manage</span>
    </div>
    <a href="/">+ New Paste</a>
  </div>
  <div class="manage-title">⚙️ Manage Paste</div>
  <div class="manage-subtitle">Paste ID: <code>${escapeHtml(id)}</code></div>

  <div class="info-card">
    <div class="info-row">
      <span class="info-label">Title</span>
      <span class="info-value">${escapeHtml(displayTitle)}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Language</span>
      <span class="info-value"><span class="badge">${escapeHtml(language)}</span></span>
    </div>
    <div class="info-row">
      <span class="info-label">Created</span>
      <span class="info-value">${createdAt}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Expires</span>
      <span class="info-value">${expiresAt}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Time left</span>
      <span class="info-value">${timeLeft}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Password</span>
      <span class="info-value">${paste.password_hash ? '🔒 Protected' : 'No'}</span>
    </div>
  </div>

  <div class="content-preview">${escapeHtml(contentPreview)}</div>

  <div class="actions-card">
    <h3>Actions</h3>
    <div class="action-row">
      <label style="font-size:14px;color:#8b949e;">Extend expiry by:</label>
      <select id="extend-select">
        <option value="1800">30 minutes</option>
        <option value="3600">1 hour</option>
        <option value="43200">12 hours</option>
        <option value="86400">24 hours</option>
        <option value="604800">7 days</option>
        <option value="2592000">30 days</option>
      </select>
      <button class="btn btn-extend" id="extend-btn" onclick="extendPaste()">
        Extend<span class="spinner" id="extend-spinner"></span>
      </button>
    </div>
    <div class="action-row">
      <button class="btn btn-view" onclick="window.open('/${escapeHtml(id)}${paste.password_hash ? '' : ''}', '_blank')">View Paste</button>
      <button class="btn btn-delete" id="delete-btn" onclick="showDeleteConfirm()">
        🗑 Delete Paste
      </button>
    </div>
    <div class="modal-overlay" id="delete-modal">
      <div class="modal">
        <div class="modal-icon">🗑️</div>
        <h3>Delete Paste</h3>
        <p>Are you sure? This action cannot be undone.<br>The paste will be permanently deleted.</p>
        <div class="modal-buttons">
          <button class="btn btn-delete" id="delete-confirm-btn" onclick="deletePaste()">
            Confirm Delete<span class="spinner" id="delete-spinner"></span>
          </button>
          <button class="btn btn-view" onclick="hideDeleteConfirm()">Cancel</button>
        </div>
      </div>
    </div>
    <div class="status-msg" id="status-msg"></div>
  </div>

  <div class="footer">
    <a href="https://github.com/zzdbilly/pastebin">PasteBin</a> &mdash; simple text sharing
  </div>
</div>
<script>
const pasteId="${escapeHtml(id)}";
const manageToken="${escapeHtml(token)}";

function showStatus(msg, isError) {
  const el = document.getElementById('status-msg');
  el.textContent = msg;
  el.className = 'status-msg show ' + (isError ? 'error' : 'success');
  setTimeout(() => el.classList.remove('show'), 5000);
}

function showDeleteConfirm() {
  document.getElementById('delete-modal').classList.add('show');
  document.getElementById('delete-btn').disabled = true;
}
function hideDeleteConfirm() {
  document.getElementById('delete-modal').classList.remove('show');
  document.getElementById('delete-btn').disabled = false;
}
// Close modal on overlay click
document.addEventListener('click', function(e) {
  if (e.target && e.target.id === 'delete-modal') hideDeleteConfirm();
});
// Close modal on Escape key
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') hideDeleteConfirm();
});

async function extendPaste() {
  const sel = document.getElementById('extend-select');
  const extendSecs = parseInt(sel.value);
  const btn = document.getElementById('extend-btn');
  const spinner = document.getElementById('extend-spinner');
  btn.disabled = true; spinner.style.display = 'inline-block';
  try {
    const res = await fetch('/api/manage/'+pasteId, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: manageToken, action: 'extend', expires_in: extendSecs })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    showStatus('✅ Expiry extended by ' + sel.options[sel.selectedIndex].text + '. Refreshing...', false);
    setTimeout(() => window.location.reload(), 1500);
  } catch(e) {
    showStatus('❌ ' + e.message, true);
  } finally {
    btn.disabled = false; spinner.style.display = 'none';
  }
}

async function deletePaste() {
  const btn = document.getElementById('delete-confirm-btn');
  const spinner = document.getElementById('delete-spinner');
  btn.disabled = true; spinner.style.display = 'inline-block';
  try {
    const res = await fetch('/api/manage/'+pasteId, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: manageToken, action: 'delete' })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    showStatus('✅ Paste deleted permanently. Redirecting...', false);
    setTimeout(() => window.location.href = '/', 2000);
  } catch(e) {
    showStatus('❌ ' + e.message, true);
  } finally {
    btn.disabled = false; spinner.style.display = 'none';
  }
}
</script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html;charset=utf-8', 'Access-Control-Allow-Origin': '*' }
  });
}

// --- API: POST /api/manage/{id} ---

async function handleManageApi(request, id) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) {
    return jsonResponse({ error: 'Content-Type must be application/json' }, 400);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const token = body.token;
  const action = body.action;
  if (!token || typeof token !== 'string') {
    return jsonResponse({ error: 'token is required' }, 400);
  }
  if (!action || !['delete', 'extend'].includes(action)) {
    return jsonResponse({ error: 'action must be "delete" or "extend"' }, 400);
  }

  const data = await KV.get(id);
  if (!data) {
    return jsonResponse({ error: 'Paste not found' }, 404);
  }

  let paste;
  try {
    paste = JSON.parse(data);
  } catch {
    return jsonResponse({ error: 'Invalid paste data' }, 500);
  }

  // Verify management token
  if (!paste.manage_token || token !== paste.manage_token) {
    return jsonResponse({ error: 'Invalid management token' }, 403);
  }

  // Check expiry
  if (Date.now() > paste.expires_at) {
    await KV.delete(id);
    return jsonResponse({ error: 'Paste has expired' }, 404);
  }

  if (action === 'delete') {
    await KV.delete(id);
    return jsonResponse({ success: true, message: 'Paste deleted' });
  }

  if (action === 'extend') {
    const extendSeconds = parseExpiresIn(String(body.expires_in || '3600'));
    const newExpiresAt = paste.expires_at + extendSeconds * 1000;
    // Calculate total TTL from now
    const totalTtl = Math.floor((newExpiresAt - Date.now()) / 1000);
    if (totalTtl <= 0) {
      return jsonResponse({ error: 'Cannot extend an expired paste' }, 400);
    }
    paste.expires_at = newExpiresAt;
    await KV.put(id, JSON.stringify(paste), { expirationTtl: totalTtl });
    return jsonResponse({
      success: true,
      message: 'Expiry extended',
      expires_at: new Date(newExpiresAt).toISOString()
    });
  }
}

// --- Homepage ---

function serveHomepage() {
  const languageOptions = LANGUAGE_OPTIONS.map(lang =>
    `<option value="${lang === 'plaintext' ? 'auto' : lang}">${lang === 'plaintext' ? 'Auto' : lang}</option>`
  ).join('');

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Crect x='4' y='8' width='36' height='32' rx='6' stroke='%2358a6ff' stroke-width='2.5' fill='%23161b22'/%3E%3Crect x='9' y='5' width='26' height='6' rx='3' fill='%23238636'/%3E%3Crect x='12' y='5' width='8' height='6' rx='3' fill='%232ea043'/%3E%3Ctext x='24' y='12' text-anchor='middle' fill='%23fff' font-size='8' font-weight='700' font-family='sans-serif'%3EP%3C/text%3E%3C/svg%3E">
<title>PasteBin — share text simply</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  body {
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    background:#0d1117;color:#c9d1d9;min-height:100vh;
  }
  .container {
    max-width:800px;margin:0 auto;padding:40px 20px;
    display:flex;flex-direction:column;min-height:100vh;
  }
  .main{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;}
  .logo{display:flex;align-items:center;gap:16px;margin-bottom:24px;}
  .logo svg{flex-shrink:0;}
  .logo-text{text-align:left;}
  .logo-text h1{font-size:28px;font-weight:700;margin-bottom:4px;}
  .logo-text .subtitle{color:#8b949e;font-size:14px;margin:0;}
  .title-input {
    width:100%;max-width:700px;
    background:#161b22;color:#c9d1d9;border:1px solid #30363d;
    border-radius:8px;padding:10px 16px;font-size:15px;
    outline:none;transition:border-color 0.15s;
    margin-bottom:12px;
  }
  .title-input:focus{border-color:#58a6ff;}
  .title-input::placeholder{color:#484f58;}
  textarea {
    width:100%;max-width:700px;height:240px;
    background:#161b22;color:#c9d1d9;border:1px solid #30363d;
    border-radius:8px;padding:16px;font-size:15px;line-height:1.5;
    font-family:'SF Mono','Fira Code','Consolas',monospace;
    resize:vertical;outline:none;transition:border-color 0.15s;
  }
  textarea:focus{border-color:#58a6ff;}
  textarea::placeholder{color:#484f58;}
  .stats {
    width:100%;max-width:700px;font-size:12px;color:#6e7681;
    text-align:right;margin-top:6px;margin-bottom:12px;
  }
  .options {
    width:100%;max-width:700px;display:flex;gap:16px;
    align-items:center;margin-top:0;flex-wrap:wrap;
  }
  .options label{font-size:14px;color:#8b949e;cursor:pointer;display:flex;align-items:center;gap:6px;}
  select {
    background:#21262d;color:#c9d1d9;border:1px solid #30363d;
    border-radius:6px;padding:6px 10px;font-size:14px;cursor:pointer;outline:none;
  }
  select:focus{border-color:#58a6ff;}
  input[type="checkbox"]{accent-color:#58a6ff;width:16px;height:16px;cursor:pointer;}
  input[type="password"] {
    background:#21262d;color:#c9d1d9;border:1px solid #30363d;
    border-radius:6px;padding:6px 10px;font-size:14px;outline:none;
    width:120px;flex-shrink:0;transition:border-color 0.15s;
  }
  input[type="password"]:focus{border-color:#58a6ff;}
  input[type="password"]::placeholder{color:#484f58;}
  .hint-row {
    width:100%;max-width:700px;margin-top:8px;
    font-size:12px;color:#6e7681;display:flex;justify-content:space-between;align-items:center;
  }
  .hint-row kbd {
    background:#21262d;border:1px solid #30363d;border-radius:4px;
    padding:1px 6px;font-size:11px;font-family:monospace;
  }
  .actions{width:100%;max-width:700px;margin-top:16px;}
  button {
    background:#238636;color:#fff;border:none;border-radius:6px;
    padding:10px 24px;font-size:15px;font-weight:500;cursor:pointer;
    transition:background 0.15s;
  }
  button:hover{background:#2ea043;}
  button:disabled{opacity:0.5;cursor:not-allowed;}
  .result{width:100%;max-width:700px;margin-top:20px;display:none;}
  .result.show{display:block;}
  .result .link-row{display:flex;gap:8px;align-items:center;margin-bottom:8px;}
  .result .link-label{font-size:13px;color:#8b949e;min-width:90px;}
  .result input {
    flex:1;background:#161b22;color:#58a6ff;border:1px solid #30363d;
    border-radius:6px;padding:10px 14px;font-size:14px;font-family:'SF Mono',monospace;
    outline:none;cursor:text;
  }
  .result input:focus{border-color:#58a6ff;}
  .result input.manage-input{color:#d29922;}
  .result .copy-btn{
    background:#21262d;color:#c9d1d9;border:1px solid #30363d;
    border-radius:6px;padding:8px 14px;font-size:13px;cursor:pointer;
    white-space:nowrap;transition:background 0.15s;
  }
  .result .copy-btn:hover{background:#30363d;}
  .result .copy-btn.copied{background:#238636;color:#fff;border-color:#238636;}
  .result .hint{margin-top:8px;font-size:13px;color:#8b949e;}
  .result .warning{
    margin-top:8px;padding:8px 12px;background:#1c1700;border:1px solid #d29922;
    border-radius:6px;font-size:12px;color:#d29922;
  }
  .error-msg{color:#f85149;font-size:14px;margin-top:12px;display:none;}
  .error-msg.show{display:block;}
  .spinner{display:none;border:2px solid #30363d;border-top:2px solid #58a6ff;border-radius:50%;width:18px;height:18px;animation:spin 0.8s linear infinite;vertical-align:middle;margin-left:8px;}
  @keyframes spin{to{transform:rotate(360deg);}}
  .footer{text-align:center;padding:32px 0;font-size:13px;color:#484f58;}
  .footer a{color:#58a6ff;text-decoration:none;}
  #custom-slug:focus{border-color:#58a6ff!important;}
  #custom-slug::placeholder{color:#484f58;}
  @media(max-width:600px){
    .container{padding:20px 12px;}
    h1{font-size:24px;}
    textarea{height:180px;font-size:14px;}
    .options{gap:10px;}
    .hint-row{flex-direction:column;gap:4px;align-items:flex-start;}
    .result .link-row{flex-direction:column;align-items:stretch;gap:4px;}
    .result .link-label{min-width:0;}
  }
</style>
</head>
<body>
<div class="container">
  <div class="main">
    <div class="logo">
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="8" width="36" height="32" rx="6" stroke="#58a6ff" stroke-width="2.5" fill="#161b22"/>
        <rect x="9" y="5" width="26" height="6" rx="3" fill="#238636"/>
        <rect x="12" y="5" width="8" height="6" rx="3" fill="#2ea043"/>
        <text x="24" y="11" text-anchor="middle" fill="#fff" font-size="8" font-weight="700" font-family="sans-serif">P</text>
        <line x1="12" y1="22" x2="32" y2="22" stroke="#30363d" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="12" y1="28" x2="28" y2="28" stroke="#30363d" stroke-width="1.5" stroke-linecap="round"/>
        <line x1="12" y1="34" x2="24" y2="34" stroke="#30363d" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      <div class="logo-text">
        <h1>PasteBin</h1>
        <p class="subtitle">Paste text, share instantly</p>
      </div>
    </div>
    <input type="text" class="title-input" id="title" placeholder="Title (optional)" maxlength="200">
    <textarea id="content" placeholder="Paste your text here..." spellcheck="false"></textarea>
    <div class="stats" id="stats">0 chars · 0 lines</div>
    <div class="options">
      <label>
        Expires:
        <select id="expires-in">
          <option value="1800">30 minutes</option>
          <option value="3600">1 hour</option>
          <option value="43200">12 hours</option>
          <option value="86400" selected>24 hours</option>
          <option value="604800">7 days</option>
          <option value="2592000">30 days</option>
        </select>
      </label>
      <label>
        Language:
        <select id="language">
          ${languageOptions}
        </select>
      </label>
      <label>
        <input type="checkbox" id="burn-after"> Burn after reading
      </label>
      <label style="position:relative;display:flex;align-items:center;gap:6px;">
        🔗 <input type="text" id="custom-slug" placeholder="Custom slug (optional)" maxlength="32" style="width:130px;background:#21262d;color:#c9d1d9;border:1px solid #30363d;border-radius:6px;padding:6px 10px;font-size:14px;outline:none;transition:border-color 0.15s;font-family:'SF Mono',monospace;" oninput="this.style.borderColor=this.value&&!/^[a-z0-9-]+$/i.test(this.value)?'#f85149':'#30363d'">
      </label>
      <label>
        🔒 <input type="password" id="password" placeholder="Password">
      </label>
    </div>
    <div class="hint-row">
      <span>Press <kbd>Ctrl</kbd> + <kbd>Enter</kbd> to create paste</span>
    </div>
    <div class="error-msg" id="error-msg"></div>
    <div class="actions">
      <button id="submit-btn" onclick="createPaste()">
        Create Paste
        <span class="spinner" id="spinner"></span>
      </button>
    </div>
    <div class="result" id="result">
      <div class="link-row">
        <span class="link-label">📎 Paste URL</span>
        <input type="text" id="result-url" readonly onclick="this.select()">
        <button class="copy-btn" onclick="copyField('result-url',this)">Copy</button>
      </div>
      <div class="link-row">
        <span class="link-label">⚙️ Manage URL</span>
        <input type="text" id="result-manage" class="manage-input" readonly onclick="this.select()">
        <button class="copy-btn" onclick="copyField('result-manage',this)">Copy</button>
      </div>
      <div class="warning">
        ⚠️ Save the Manage URL! You won't see it again. It's needed to delete or extend this paste.
      </div>
    </div>
    <div class="recent-pastes" id="recent-pastes" style="display:none;width:100%;max-width:700px;margin-top:20px;">
      <div style="font-size:13px;color:#8b949e;margin-bottom:12px;">📋 Recent Pastes</div>
      <div id="recent-list"></div>
    </div>
  </div>
  <div class="footer">
    <a href="https://github.com/zzdbilly/pastebin">PasteBin</a> &mdash; simple text sharing
  </div>
</div>
<script>
// Live stats: char count and line count
const contentEl=document.getElementById('content');
const statsEl=document.getElementById('stats');
function updateStats(){
  const text=contentEl.value;
  const chars=text.length;
  const lines=text?text.split(String.fromCharCode(10)).length:0;
  statsEl.textContent=chars+' chars · '+lines+' lines';
}
contentEl.addEventListener('input',updateStats);

function copyField(fieldId,btn){
  const input=document.getElementById(fieldId);
  input.select();
  navigator.clipboard.writeText(input.value).then(()=>{
    const orig=btn.textContent;
    btn.textContent='✅ Copied!';
    btn.classList.add('copied');
    setTimeout(()=>{btn.textContent=orig;btn.classList.remove('copied');},2000);
  }).catch(()=>{
    document.execCommand('copy');
  });
}

async function createPaste(){
  const content=document.getElementById('content').value.trim();
  if(!content){showError('Please paste some text first.');return;}
  const btn=document.getElementById('submit-btn');
  const spinner=document.getElementById('spinner');
  const errorMsg=document.getElementById('error-msg');
  const result=document.getElementById('result');
  btn.disabled=true;spinner.style.display='inline-block';
  errorMsg.classList.remove('show');result.classList.remove('show');
  try{
    const body={
      content:content,
      expires_in:parseInt(document.getElementById('expires-in').value),
      burn_after_reading:document.getElementById('burn-after').checked,
      title:document.getElementById('title').value.trim(),
      language:document.getElementById('language').value
    };
    const pw=document.getElementById('password').value;
    if(pw)body.password=pw;
    const slug=document.getElementById('custom-slug').value.trim().toLowerCase();
    if(slug)body.custom_slug=slug;
    const res=await fetch('/api/new',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body)
    });
    if(!res.ok){const errText=await res.text();let msg='Failed';try{const j=JSON.parse(errText);msg=j.error||j.message||errText;}catch{msg=errText;}throw new Error(msg);}
    const data=await res.json();
    document.getElementById('result-url').value=data.url;
    document.getElementById('result-manage').value=data.manage_url||'';
    result.classList.add('show');
    document.getElementById('content').value='';
    document.getElementById('title').value='';
    document.getElementById('password').value='';
    document.getElementById('custom-slug').value='';
    updateStats();
    var recent=JSON.parse(localStorage.getItem('pastebin_recent')||'[]');
    recent.unshift({id:data.id,title:body.title||'(untitled)',url:data.url,manage_url:data.manage_url,created_at:Date.now()});
    if(recent.length>10)recent.length=10;
    localStorage.setItem('pastebin_recent',JSON.stringify(recent));
    renderRecent();
  }catch(e){showError(e.message);}
  finally{btn.disabled=false;spinner.style.display='none';}
}
function showError(msg){
  const el=document.getElementById('error-msg');
  el.textContent=msg;el.classList.add('show');
}
document.addEventListener('keydown',function(e){
  if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();createPaste();}
});
function escapeHtml(str){
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
function renderRecent(){
  var recent=JSON.parse(localStorage.getItem('pastebin_recent')||'[]');
  var container=document.getElementById('recent-pastes');
  var list=document.getElementById('recent-list');
  if(!container||!list)return;
  if(recent.length===0){container.style.display='none';return;}
  container.style.display='block';
  list.innerHTML=recent.map(function(p){
    var timeAgo=Math.floor((Date.now()-p.created_at)/3600000);
    var timeStr=timeAgo<1?'just now':timeAgo<24?timeAgo+'h ago':Math.floor(timeAgo/24)+'d ago';
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;margin-bottom:6px;background:#161b22;border:1px solid #30363d;border-radius:8px;">'+
      '<div style="flex:1;min-width:0;">'+
      '<div style="font-size:14px;font-weight:500;color:#c9d1d9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+escapeHtml(p.title)+'</div>'+
      '<div style="font-size:11px;color:#484f58;margin-top:2px;"><a href="'+escapeHtml(p.url)+'" style="color:#58a6ff;text-decoration:none;">'+escapeHtml(p.url)+'</a> · '+timeStr+'</div>'+
      '</div>'+
      '<a href="'+escapeHtml(p.manage_url)+'" style="font-size:12px;color:#d29922;text-decoration:none;white-space:nowrap;margin-left:8px;">Manage</a>'+
      '</div>';
  }).join('');
}
renderRecent();
</script>
</body>
</html>`;
  return new Response(html, {
    headers: { 'Content-Type': 'text/html;charset=utf-8', 'Access-Control-Allow-Origin': '*' }
  });
}

// --- 主路由 ---

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  // POST /api/new → createPaste
  if (path === '/api/new') {
    return createPaste(request);
  }

  // POST /api/verify → verifyPassword
  if (path === '/api/verify') {
    return verifyPassword(request);
  }

  // POST /api/manage/{id} → handleManageApi
  const manageApiMatch = path.match(/^\/api\/manage\/([a-zA-Z0-9]{6})$/);
  if (manageApiMatch) {
    return handleManageApi(request, manageApiMatch[1]);
  }

  // GET /manage/{id} → renderManagePage
  const manageMatch = path.match(/^\/manage\/([a-zA-Z0-9]{6})$/);
  if (manageMatch) {
    return renderManagePage(request, manageMatch[1]);
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
