// --- 请求处理 handlers (handlers.js) ---
import { jsonResponse, escapeHtml, formatTimeLeft, parseExpiresIn } from './lib/utils.js';
import { validateViewToken } from './store.js';
import { render404Page, renderPasswordPage } from './pages.js';

// --- Raw endpoint ---

export async function getPasteRaw(request, id) {
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

export async function getPasteView(request, id) {
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

  // Parse highlight lines from URL (?lines= or ?highlight=)
  const highlightParam = url.searchParams.get('lines') || url.searchParams.get('highlight') || '';
  const highlightSet = new Set();
  if (highlightParam) {
    const parts = highlightParam.split(',');
    for (const part of parts) {
      const trimmed = part.trim();
      const rangeMatch = trimmed.match(/^(\d+)-(\d+)$/);
      if (rangeMatch) {
        const start = parseInt(rangeMatch[1]);
        const end = parseInt(rangeMatch[2]);
        for (let n = start; n <= end; n++) highlightSet.add(n);
      } else if (/^\d+$/.test(trimmed)) {
        highlightSet.add(parseInt(trimmed));
      }
    }
  }
  const hasHighlight = highlightSet.size > 0;

  // Generate line numbers with highlight data attribute
  const lineCount = paste.content.split('\n').length;
  const lineNumbersHtml = Array.from({length: lineCount}, (_, i) => {
    const lineNum = i + 1;
    const highlighted = highlightSet.has(lineNum);
    return `<span data-line="${lineNum}"${highlighted ? ' class="ln-highlighted"' : ''}>${lineNum}</span>`;
  }).join('');
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
<script src="https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js"></script>
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
  .line-numbers span.ln-highlighted { color: #e3b341; font-weight: 700; }
  .line-numbers span.ln-highlighted::before { content: '● '; font-size: 10px; color: #e3b341; }
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
  .line-highlight { background: rgba(227, 179, 65, 0.15); border-left: 3px solid #e3b341; }
  .line-highlight .line-numbers { background: rgba(227, 179, 65, 0.1); }
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
    ${hasHighlight ? '<button onclick="copyHighlightLink()" style="background:#238636;border-color:#238636;color:#fff;">🔗 Copy Highlight Link</button>' : ''}
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
// Highlight lines data
var HIGHLIGHT_LINES = ${JSON.stringify([...highlightSet])};
var HIGHLIGHT_PARAM = ${JSON.stringify(highlightParam)};
var PASTE_ID = ${JSON.stringify(id)};
var VIEW_TOKEN = ${JSON.stringify(token)};

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

// Copy highlight link
function copyHighlightLink() {
  var params = new URLSearchParams();
  params.set('lines', HIGHLIGHT_PARAM);
  if (VIEW_TOKEN) params.set('token', VIEW_TOKEN);
  var link = window.location.origin + '/' + PASTE_ID + '?' + params.toString();
  navigator.clipboard.writeText(link).then(function() {
    var btns = document.querySelectorAll('.toolbar button');
    var btn = btns[btns.length - 1];
    var orig = btn.textContent;
    btn.textContent = '✅ Copied!';
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
        // 用 DOMPurify 净化 marked 输出，防止存储型 XSS
        var rendered = marked.parse(rawText);
        if (typeof DOMPurify !== 'undefined') {
          rendered = DOMPurify.sanitize(rendered);
        }
        preview.innerHTML = rendered;
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



// Line highlighting from URL param ?lines=... or ?highlight=...
(function() {
  if (!HIGHLIGHT_LINES.length) return;

  var lineEls = document.querySelectorAll('.line-numbers span');
  if (!lineEls.length) return;

  var hlMap = {};
  for (var h = 0; h < HIGHLIGHT_LINES.length; h++) {
    hlMap[HIGHLIGHT_LINES[h]] = true;
  }

  // Highlight line numbers with gold styling
  var firstHighlighted = null;
  for (var i = 0; i < lineEls.length; i++) {
    var lineNum = i + 1;
    if (hlMap[lineNum]) {
      var el = lineEls[i];
      el.style.background = 'rgba(227, 179, 65, 0.15)';
      el.style.borderLeft = '3px solid #e3b341';
      el.style.paddingLeft = '8px';
      el.style.marginLeft = '-11px';
      el.style.color = '#e3b341';
      el.style.fontWeight = '700';
      if (!firstHighlighted) firstHighlighted = el;
    }
  }

  // Highlight code area: build gradient bars on the pre element
  var codeBlock = document.getElementById('code-block');
  var pre = codeBlock ? codeBlock.querySelector('pre') : null;
  if (pre) {
    var preStyle = window.getComputedStyle(pre);
    var lineHeight = parseFloat(preStyle.lineHeight) || 21;
    var paddingTop = parseFloat(preStyle.paddingTop) || 20;
    var sortedLines = HIGHLIGHT_LINES.slice().sort(function(a, b) { return a - b; });

    // Build multiple linear-gradient backgrounds, one per highlighted line
    var cssGradients = [];
    for (var g = 0; g < sortedLines.length; g++) {
      var ln = sortedLines[g];
      if (ln < 1 || ln > lineEls.length) continue;
      var top = paddingTop + (ln - 1) * lineHeight;
      var bottom = top + lineHeight;
      // Each gradient draws a gold bar for one line, transparent elsewhere
      cssGradients.push(
        'linear-gradient(to bottom, ' +
        'rgba(227,179,65,0.12) ' + top + 'px, ' +
        'rgba(227,179,65,0.12) ' + bottom + 'px, ' +
        'transparent ' + bottom + 'px)'
      );
    }
    if (cssGradients.length) {
      pre.style.backgroundImage = cssGradients.join(', ');
      pre.style.backgroundRepeat = 'no-repeat';
    }
  }

  // Scroll to first highlighted line
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

export async function handleManageApi(request, id) {
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

