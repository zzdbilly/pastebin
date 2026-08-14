// --- HTML 渲染页面 (pages.js) ---
import { escapeHtml, formatTimeLeft } from './lib/utils.js';
import { LANGUAGE_OPTIONS } from './language.js';

export function render404Page(message) {
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

export function renderPasswordPage(id) {
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

export async function renderManagePage(request, id) {
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

export function serveHomepage() {
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
      <span>Press <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to send</span>
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
// Ctrl+Enter / Cmd+Enter to submit (bound to textarea)
document.getElementById('content').addEventListener('keydown',function(e){
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

