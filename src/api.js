// --- 公开 API v1 (api.js) ---
//
// Provides a JSON API for third-party programs to create and read pastes
// programmatically, without scraping the HTML UI.
//
//   POST /api/v1/pastes             → create a paste (same fields as /api/new)
//   GET  /api/v1/pastes/{id}        → read a paste as JSON
//
import { jsonResponse, sha256 } from './lib/utils.js';
import { createPaste, deleteViews } from './store.js';

// Normalise URL for base paths.
function baseUrl(url) {
  return `${url.protocol}//${url.host}`;
}

// --- POST /api/v1/pastes → create ---
//
// Delegates to the shared createPaste() so behaviour stays identical to the
// web form. createPaste already accepts: title, content, language,
// expires_in, burn_after_reading, password, custom_slug.
export async function handleCreateV1(request) {
  const res = await createPaste(request);
  // Preserve the JSON shape already returned by createPaste
  // ({ id, url, manage_url, raw_url, expires_at }).
  return res;
}

// --- GET /api/v1/pastes/:id → read ---
export async function handleReadV1(request, id) {
  const data = await KV.get(id);
  if (!data) {
    return jsonResponse({ error: 'not found' }, 404);
  }

  let paste;
  try {
    paste = JSON.parse(data);
  } catch {
    return jsonResponse({ error: 'invalid data' }, 500);
  }

  const now = Date.now();
  if (now > paste.expires_at) {
    await KV.delete(id);
    return jsonResponse({ error: 'not found' }, 404);
  }

  // Password protection: verify via ?password= param (direct hash compare).
  if (paste.password_hash) {
    const url = new URL(request.url);
    const input = url.searchParams.get('password') || '';
    const inputHash = await sha256(input);
    if (inputHash !== paste.password_hash) {
      return jsonResponse({ error: 'password required' }, 403);
    }
  }

  // Burn-after-reading: first successful read deletes the paste.
  const burnt = paste.burn_after_reading;
  if (burnt) {
    await KV.delete(id);
    await deleteViews(id);
  }

  const url2 = new URL(request.url);
  const base = baseUrl(url2);

  return jsonResponse({
    id,
    title: paste.title || '',
    content: paste.content,
    language: paste.language || 'plaintext',
    created_at: new Date(paste.created_at).toISOString(),
    expires_at: new Date(paste.expires_at).toISOString(),
    burn_after_reading: !!paste.burn_after_reading,
    views: await KV.get(`views:${id}`) || '0',
    manage_url: `${base}/manage/${id}?token=${paste.manage_token}`,
    raw_url: `${base}/${id}/raw`,
  });
}
