// --- 主路由 (router.js) ---
import { createPaste, verifyPassword } from './store.js';
import { handleManageApi, getPasteRaw, getPasteView } from './handlers.js';
import { renderManagePage, serveHomepage } from './pages.js';
import { handleCreateV1, handleReadV1 } from './api.js';

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  // === 公开 API v1 ===
  // POST /api/v1/pastes → create
  if (path === '/api/v1/pastes' && request.method === 'POST') {
    return handleCreateV1(request);
  }
  // GET /api/v1/pastes/{id} → read (id: 6 chars or custom slug)
  const v1ReadMatch = path.match(/^\/api\/v1\/pastes\/([a-zA-Z0-9-]{1,32})$/);
  if (v1ReadMatch && request.method === 'GET') {
    return handleReadV1(request, v1ReadMatch[1]);
  }

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

export default handleRequest;
